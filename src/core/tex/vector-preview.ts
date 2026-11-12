import { parseTikzOptionString } from '../parser/parser';
import { maskLatexComments } from './source';

const PX_PER_CM = 52;
const PX_PER_PT = PX_PER_CM / 28.45274;
type Options = Record<string, string>;
type Point = [number, number];
export interface VectorPath {
  kind: 'path';
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  arrow: boolean;
  clips: string[];
}
export interface VectorLabel {
  kind: 'label';
  x: number;
  y: number;
  lines: string[];
  fontSize: number;
  bold: boolean;
  color: string;
  rotate: number;
  clips: string[];
}
export interface VectorPreviewScene {
  elements: Array<VectorPath | VectorLabel>;
  clips: Array<{ id: string; d: string }>;
  viewBox: [number, number, number, number];
  fontFamily: string;
}

class Cursor {
  i = 0;
  constructor(readonly text: string) {}
  space() { while (/\s/.test(this.text[this.i] || '') && this.i < this.text.length) this.i++; }
  group(open = '{', close = '}'): string {
    this.space();
    if (this.text[this.i] !== open) throw new Error(`Expected ${open}`);
    const start = ++this.i;
    let depth = 1;
    while (this.i < this.text.length) {
      const ch = this.text[this.i++];
      if (ch === open) depth++;
      if (ch === close) {
        depth--;
        if (depth === 0) return this.text.slice(start, this.i - 1);
      }
    }
    throw new Error('Unclosed group');
  }
  command(): string {
    const match = /^\\([a-zA-Z]+|.)/.exec(this.text.slice(this.i));
    if (!match) throw new Error('Expected command');
    this.i += match[0].length;
    return match[1];
  }
}

/** A bounded, non-executing subset of TeX macro substitution. */
export function expandPreviewMacros(source: string): string {
  const macros = new Map<string, { args: number; body: string }>();
  let operations = 0;
  let produced = 0;
  const expand = (text: string, depth = 0): string => {
    if (depth > 32) throw new Error('Macro recursion limit');
    const c = new Cursor(text);
    let output = '';
    while (c.i < text.length) {
      if (++operations > 1000000) throw new Error('Macro expansion limit');
      if (text[c.i] !== '\\') { output += text[c.i++]; continue; }
      const start = c.i;
      const name = c.command();
      if (['newcommand', 'renewcommand', 'providecommand'].includes(name)) {
        c.space();
        if (text[c.i] === '*') c.i++;
        c.space();
        const macroName = text[c.i] === '{' ? c.group().trim().slice(1) : c.command();
        c.space();
        const args = text[c.i] === '[' ? Number(c.group('[', ']')) : 0;
        if (!Number.isInteger(args) || args < 0 || args > 9) throw new Error('Unsupported macro arguments');
        const body = c.group();
        macros.set(macroName, { args, body });
      } else if (name === 'def') {
        c.space();
        const macroName = c.command();
        c.space();
        // Parameterized \def and optional arguments require a real TeX engine.
        if (text[c.i] !== '{') throw new Error('Unsupported definition');
        macros.set(macroName, { args: 0, body: c.group() });
      } else if (macros.has(name)) {
        const macro = macros.get(name)!;
        const args = Array.from({ length: macro.args }, () => c.group());
        const body = macro.body.replace(/#([1-9])/g, (_, n: string) => args[Number(n) - 1] ?? '');
        const replacement = expand(body, depth + 1);
        produced += replacement.length;
        if (produced > 2000000) throw new Error('Expanded source too large');
        output += replacement;
      } else {
        output += text.slice(start, c.i);
      }
    }
    return output;
  };
  return expand(maskLatexComments(source));
}

/** Arithmetic only: never evaluate source as JavaScript. */
export function evaluatePreviewNumber(expression: string): number {
  const text = expression.replace(/[{} \t\r\n]/g, '');
  let i = 0;
  let depth = 0;
  const primary = (): number => {
    if (++depth > 64) throw new Error('Expression nesting limit');
    let value: number;
    if (text[i] === '+' || text[i] === '-') {
      const sign = text[i++] === '-' ? -1 : 1;
      value = sign * primary();
    } else if (text[i] === '(') {
      i++;
      value = sum();
      if (text[i++] !== ')') throw new Error('Invalid expression');
    } else {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!match) throw new Error('Non-numeric coordinate');
      i += match[0].length;
      value = Number(match[0]);
    }
    depth--;
    return value;
  };
  const product = (): number => {
    let n = primary();
    while (text[i] === '*' || text[i] === '/') {
      const op = text[i++];
      const rhs = primary();
      n = op === '*' ? n * rhs : n / rhs;
    }
    return n;
  };
  const sum = (): number => {
    let n = product();
    while (text[i] === '+' || text[i] === '-') {
      const op = text[i++];
      const rhs = product();
      n = op === '+' ? n + rhs : n - rhs;
    }
    return n;
  };
  const result = sum();
  if (i !== text.length || !Number.isFinite(result) || Math.abs(result) > 1e7) {
    throw new Error('Invalid coordinate');
  }
  return result;
}

function lengthPx(value: string): number {
  const match = /^\s*([-+\d.]+)\s*(cm|mm|pt|in)?\s*$/.exec(value);
  if (!match) throw new Error('Unsupported dimension');
  return Number(match[1]) * ({ cm: PX_PER_CM, mm: PX_PER_CM / 10, pt: PX_PER_PT, in: PX_PER_CM * 2.54 }[match[2] || 'cm']!);
}

/** Interpret coordinate paths with scoped clipping, styles and ordinary macros.
 * Return null for unsupported syntax so the UI can request real TeX explicitly.
 */
export function buildVectorPreview(source: string, onUnsupported?: (error: unknown) => void): VectorPreviewScene | null {
  try {
    const expanded = expandPreviewMacros(source);
    const picture = /\\begin\{tikzpicture\}/.exec(expanded);
    if (!picture || /\\begin\{axis\}|\\foreach\b/.test(expanded)) return null;
    const c = new Cursor(expanded);
    c.i = picture.index + picture[0].length;
    c.space();
    const global = expanded[c.i] === '[' ? parseTikzOptionString(c.group('[', ']')) : {};
    // This compatibility renderer handles axis basis lengths, not arbitrary transforms.
    if (['scale', 'xscale', 'yscale', 'rotate', 'transform canvas'].some((key) => global[key])) return null;
    const sx = global.x ? lengthPx(global.x) : PX_PER_CM;
    const sy = global.y ? -lengthPx(global.y) : -PX_PER_CM;
    const colors: Record<string, string> = { black: '#000000', white: '#FFFFFF', red: '#FF0000', blue: '#0000FF', gray: '#808080', none: 'none' };
    for (const m of expanded.matchAll(/\\definecolor\{([^}]+)\}\{HTML\}\{([0-9a-fA-F]{6})\}/g)) colors[m[1]] = `#${m[2]}`;
    const color = (value: string): string => {
      const resolved = colors[value];
      if (!resolved) throw new Error(`Unsupported color ${value}`);
      return resolved;
    };
    const styles: Record<string, Options> = {};
    const styleValues = { ...global };
    for (const m of expanded.slice(0, picture.index).matchAll(/\\tikzset\s*\{/g)) {
      const sc = new Cursor(expanded);
      sc.i = m.index! + m[0].length - 1;
      Object.assign(styleValues, parseTikzOptionString(sc.group()));
    }
    for (const [key, value] of Object.entries(styleValues)) {
      if (key.endsWith('/.style')) styles[key.slice(0, -7)] = parseTikzOptionString(value);
    }
    const resolve = (raw: Options, depth = 0): Options => {
      if (depth > 12) throw new Error('Style recursion limit');
      let opts: Options = {};
      for (const [key, value] of Object.entries(raw)) {
        if (value === 'true' && styles[key]) opts = { ...opts, ...resolve(styles[key], depth + 1) };
        else opts[key] = value;
      }
      return opts;
    };
    const scene: VectorPreviewScene = {
      elements: [], clips: [], viewBox: [0, 0, 100, 100],
      fontFamily: /\\(?:usepackage(?:\[[^\]]*\])?\{helvet\}|sfdefault)/.test(expanded) ? 'Arial, Helvetica, sans-serif' : '"Times New Roman", serif',
    };
    const bounds: Point[] = [];
    let explicitBounds: [Point, Point] | undefined;
    let clips: string[] = [];
    const scopes: string[][] = [];
    const point = (): Point => {
      const pair = new Cursor(c.group('(', ')'));
      // Coordinate expressions in braces can contain parentheses and commas.
      let depth = 0;
      let split = -1;
      for (let i = 0; i < pair.text.length; i++) {
        if ('{('.includes(pair.text[i])) depth++;
        else if ('})'.includes(pair.text[i])) depth--;
        else if (pair.text[i] === ',' && depth === 0) { split = i; break; }
      }
      if (split < 0) throw new Error('Named coordinates need TeX');
      const dimension = (value: string, basis: number, y: boolean) =>
        /(?:cm|mm|pt|in)\s*$/.test(value) ? lengthPx(value) * (y ? -1 : 1) : evaluatePreviewNumber(value) * basis;
      const p: Point = [dimension(pair.text.slice(0, split), sx, false), dimension(pair.text.slice(split + 1), sy, true)];
      bounds.push(p);
      return p;
    };
    const options = (): Options => {
      c.space();
      return expanded[c.i] === '[' ? resolve(parseTikzOptionString(c.group('[', ']'))) : {};
    };
    const consume = (token: string) => {
      c.space();
      if (!expanded.startsWith(token, c.i)) throw new Error(`Expected ${token}`);
      c.i += token.length;
    };
    while (c.i < expanded.length) {
      c.space();
      if (expanded[c.i] !== '\\') {
        if (c.i === expanded.length) break;
        throw new Error('Unsupported picture content');
      }
      const command = c.command();
      if (command === 'end') {
        const env = c.group();
        if (env === 'tikzpicture') break;
        if (env !== 'scope' || !scopes.length) throw new Error('Unsupported environment');
        clips = scopes.pop()!;
        continue;
      }
      if (command === 'begin') {
        if (c.group() !== 'scope') throw new Error('Unsupported environment');
        const opts = options();
        if (Object.keys(opts).length) throw new Error('Scope transforms need TeX');
        scopes.push([...clips]);
        continue;
      }
      if (command === 'node') {
        const opts = options();
        if (Object.keys(opts).some((key) => !['font', 'rotate', 'align', 'inner sep', 'text'].includes(key))) throw new Error('Node style needs TeX');
        c.space();
        if (expanded[c.i] === '(') c.group('(', ')'); // Optional source name.
        consume('at');
        const [x, y] = point();
        const label = c.group();
        consume(';');
        const font = /\\fontsize\{([\d.]+)\}/.exec(opts.font || '');
        const fontSize = (font ? Number(font[1]) : 10) * PX_PER_PT;
        scene.elements.push({
          kind: 'label', x, y,
          lines: label.split(/\\\\(?:\[[^\]]*\])?/),
          fontSize, bold: /\\bfseries\b/.test(opts.font || ''),
          color: color(opts.text || 'black'),
          rotate: -Number(opts.rotate || 0), clips: [...clips],
        });
        continue;
      }
      if (!['draw', 'path', 'filldraw', 'fill', 'clip', 'useasboundingbox'].includes(command)) throw new Error('Unsupported TikZ command');
      const opts = options();
      const supported = new Set(['fill', 'draw', 'line width', 'rounded corners', 'line join', 'line cap', 'dash pattern', 'dashed', '->', '-']);
      for (const key of Object.keys(opts)) {
        if (!supported.has(key) && !colors[key]) throw new Error(`Unsupported path option ${key}`);
      }
      const start = point();
      let d = `M ${start.join(' ')}`;
      let last = start;
      const radius = opts['rounded corners'] ? lengthPx(opts['rounded corners']) : 0;
      while (true) {
        c.space();
        if (expanded[c.i] === ';') { c.i++; break; }
        if (expanded.startsWith('rectangle', c.i)) {
          c.i += 9;
          const end = point();
          const [x, y] = [Math.min(start[0], end[0]), Math.min(start[1], end[1])];
          const [w, h] = [Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])];
          const r = Math.min(radius, w / 2, h / 2);
          d = `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
          if (command === 'useasboundingbox') explicitBounds = [start, end];
        } else if (expanded.startsWith('circle', c.i)) {
          c.i += 6;
          const r = evaluatePreviewNumber(c.group('(', ')'));
          const rx = Math.abs(r * sx), ry = Math.abs(r * sy);
          d = `M ${start[0] - rx} ${start[1]} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
          bounds.push([start[0] - rx, start[1] - ry], [start[0] + rx, start[1] + ry]);
        } else if (expanded.startsWith('--', c.i)) {
          c.i += 2;
          c.space();
          if (expanded.startsWith('cycle', c.i)) { c.i += 5; d += ' Z'; }
          else { last = point(); d += ` L ${last.join(' ')}`; }
        } else if (expanded.startsWith('..', c.i)) {
          consume('..'); consume('controls');
          const a = point(); consume('and');
          const b = point(); consume('..');
          last = point();
          d += ` C ${a.join(' ')} ${b.join(' ')} ${last.join(' ')}`;
        } else throw new Error('Unsupported path segment');
      }
      if (command === 'useasboundingbox') continue;
      if (command === 'clip') {
        const id = `vector-clip-${scene.clips.length}`;
        scene.clips.push({ id, d });
        clips = [...clips, id];
        continue;
      }
      const colorFlag = Object.keys(opts).find((key) => colors[key]);
      const fill = opts.fill ? color(opts.fill) : command === 'fill' || command === 'filldraw' ? color(colorFlag || 'black') : 'none';
      const stroke = opts.draw ? color(opts.draw) : command === 'draw' || command === 'filldraw' ? color(colorFlag || 'black') : 'none';
      const dash = opts['dash pattern']?.match(/[\d.]+\s*(?:pt|mm|cm)/g)?.map(lengthPx).join(' ') || (opts.dashed ? '6 4' : undefined);
      scene.elements.push({
        kind: 'path', d, fill, stroke,
        strokeWidth: lengthPx(opts['line width'] || '0.4pt'),
        arrow: opts['->'] === 'true', dash, clips: [...clips],
      });
      if (scene.elements.length > 20000) throw new Error('Scene limit');
    }
    if (!scene.elements.length || scopes.length) return null;
    const extent = explicitBounds || bounds;
    const xs = extent.map((p) => p[0]), ys = extent.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad = 8;
    scene.viewBox = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad];
    return scene;
  } catch (error) {
    onUnsupported?.(error);
    return null;
  }
}
