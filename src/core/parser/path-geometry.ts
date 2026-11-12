import { parseTikzOptionString } from './options';
import { maskLatexComments } from '../tex/source';
import { resolveTikzColor } from '../themes/journal-presets';

const PX_PER_CM = 52;
const PX_PER_PT = PX_PER_CM / 28.45274;
type Options = Record<string, string>;
type Point = [number, number];
export interface GeometrySpan { start: number; end: number }
export interface GeometryCoordinate extends GeometrySpan {
  value: number;
  /** Screen pixels per source unit, including TikZ's inverted vertical axis. */
  basis: number;
  unit: string;
  offset?: number;
  relative?: boolean;
}
export interface CoordinateTransform { xScale: number; yScale: number; shiftX: number; shiftY: number }
export interface MacroSource {
  span: GeometrySpan;
  args: Array<GeometrySpan & { value: string }>;
  parent?: CoordinateTransform;
  editScope?: { span: GeometrySpan; optionsSpan?: GeometrySpan; transform: CoordinateTransform; parent: CoordinateTransform; name?: string };
}
export interface GeometrySource {
  span: GeometrySpan;
  optionsSpan?: GeometrySpan;
  labelSpan?: GeometrySpan;
  coordinates: Array<{ x: GeometryCoordinate; y: GeometryCoordinate }>;
  rawOptions: Options;
  transform?: CoordinateTransform;
}
export type GeometryBounds = [number, number, number, number];
export interface CoordinatePath {
  kind: 'path';
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  arrow: boolean;
  arrowSize?: [number, number];
  clips: string[];
  bounds: GeometryBounds;
  source?: GeometrySource;
  macro?: MacroSource;
  radius?: GeometryCoordinate;
  lineCap: 'round' | 'butt' | 'square';
  lineJoin: 'round' | 'miter' | 'bevel';
}
export interface CoordinateLabel {
  kind: 'label';
  x: number;
  y: number;
  lines: string[];
  fontSize: number;
  bold: boolean;
  color: string;
  rotate: number;
  clips: string[];
  anchor: string;
  box: GeometryBounds;
  bounds: GeometryBounds;
  source?: GeometrySource;
  macro?: MacroSource;
}
export interface CoordinateScene {
  elements: Array<CoordinatePath | CoordinateLabel>;
  clips: Array<{ id: string; d: string }>;
  viewBox: [number, number, number, number];
  fontFamily: string;
  /** The input is retained for rejecting stale edits against moved source spans. */
  source: string;
  coordinateScale: Point;
  explicitBounds?: GeometryBounds;
  transformed?: boolean;
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
function expandMappedMacros(source: string): { text: string; origins: number[]; invocations: Array<{ from: number; to: number; source: MacroSource }> } {
  const macros = new Map<string, { args: number; body: string }>();
  const invocations: Array<{ from: number; to: number; source: MacroSource }> = [];
  let operations = 0;
  let produced = 0;
  const expand = (text: string, depth = 0): { text: string; origins: number[] } => {
    if (depth > 32) throw new Error('Macro recursion limit');
    const c = new Cursor(text);
    let output = '';
    const origins: number[] = [];
    const append = (value: string, from: number) => {
      output += value;
      for (let i = 0; i < value.length; i++) origins.push(depth === 0 ? from + i : -1);
    };
    while (c.i < text.length) {
      if (++operations > 1000000) throw new Error('Macro expansion limit');
      if (text[c.i] !== '\\') { append(text[c.i], c.i); c.i++; continue; }
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
      } else if (name === 'foreach') {
        c.space();
        const variables = [c.command()];
        while (text[c.i] === '/') { c.i++; variables.push(c.command()); }
        c.space();
        if (!text.startsWith('in', c.i)) throw new Error('Unsupported foreach syntax');
        c.i += 2; c.space();
        const listStart = c.i + 1, list = c.group();
        const listEnd = c.i - 1;
        const body = c.group();
        let items = list.split(',').map((item) => item.trim()).filter(Boolean);
        const dots = items.indexOf('...');
        if (dots >= 0) {
          const first = evaluateCoordinateNumber(items[0]), last = evaluateCoordinateNumber(items[items.length - 1]);
          const step = dots > 1 ? evaluateCoordinateNumber(items[1]) - first : last >= first ? 1 : -1;
          const count = Math.floor((last - first) / step) + 1;
          if (!step || count < 1 || count > 1000) throw new Error('Foreach iteration limit');
          items = Array.from({ length: count }, (_, index) => String(first + step * index));
        }
        if (items.length > 1000) throw new Error('Foreach iteration limit');
        const previous = new Map(macros);
        let replacement = '';
        for (const item of items) {
          macros.clear(); for (const [key, value] of previous) macros.set(key, value);
          const values = item.split('/');
          variables.forEach((variable, index) => macros.set(variable, { args: 0, body: values[index] || '' }));
          replacement += `\\begin{scope}\n${expand(body, depth + 1).text}\n\\end{scope}\n`;
        }
        macros.clear(); for (const [key, value] of previous) macros.set(key, value);
        produced += replacement.length;
        if (produced > 2000000) throw new Error('Expanded source too large');
        if (depth === 0 && replacement.trim()) invocations.push({
          from: output.length, to: output.length + replacement.length,
          source: { span: { start, end: c.i }, args: [{ start: listStart, end: listEnd, value: list }] },
        });
        output += replacement;
        for (let i = 0; i < replacement.length; i++) origins.push(-1);
      } else if (macros.has(name)) {
        const macro = macros.get(name)!;
        const argumentsWithSpans = Array.from({ length: macro.args }, () => {
          c.space(); const start = c.i + 1; const value = c.group();
          return { value, start, end: c.i - 1 };
        });
        const args = argumentsWithSpans.map((arg) => arg.value);
        const body = macro.body.replace(/#([1-9])/g, (_, n: string) => args[Number(n) - 1] ?? '');
        const replacement = expand(body, depth + 1).text;
        produced += replacement.length;
        if (produced > 2000000) throw new Error('Expanded source too large');
        if (depth === 0 && replacement.trim()) invocations.push({
          from: output.length, to: output.length + replacement.length,
          source: { span: { start, end: c.i }, args: argumentsWithSpans },
        });
        output += replacement;
        for (let i = 0; i < replacement.length; i++) origins.push(-1);
      } else {
        append(text.slice(start, c.i), start);
      }
    }
    return { text: output, origins };
  };
  return { ...expand(maskLatexComments(source)), invocations };
}

export function expandGeometryMacros(source: string): string {
  return expandMappedMacros(source).text;
}

/** Arithmetic only: never evaluate source as JavaScript. */
export function evaluateCoordinateNumber(expression: string): number {
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

/** Add source-mapped physical geometry to the original canvas's AST. */
export function parseCoordinateGeometry(source: string, onUnsupported?: (error: unknown) => void, defaultStyles: Record<string, Options> = {}): CoordinateScene | null {
  try {
    const { text: expanded, origins, invocations } = expandMappedMacros(source);
    const sourceSpan = (start: number, end: number): GeometrySpan | undefined => {
      const from = origins[start], last = origins[end - 1];
      if (from === undefined || from < 0 || last - from !== end - start - 1) return undefined;
      // Never map expanded macro content back to its definition or another invocation.
      for (let i = start; i < end; i++) if (origins[i] !== from + i - start) return undefined;
      return { start: from, end: last + 1 };
    };
    const originalStatement = (start: number, end: number) => {
      const from = origins[start], last = origins[end - 1];
      if (from === undefined || from < 0 || last < from) return undefined;
      const span = { start: from, end: last + 1 };
      const original = new Cursor(maskLatexComments(source.slice(span.start, span.end)));
      try {
        const command = original.command();
        original.space();
        const optionStart = original.i + 1;
        let optionsSpan: GeometrySpan | undefined;
        if (original.text[original.i] === '[') {
          original.group('[', ']');
          optionsSpan = { start: span.start + optionStart, end: span.start + original.i - 1 };
        }
        let labelSpan: GeometrySpan | undefined;
        if (command === 'node') {
          original.space();
          if (original.text[original.i] === '(') original.group('(', ')');
          original.space();
          if (original.text.startsWith('at', original.i)) { original.i += 2; original.group('(', ')'); }
          original.space();
          const labelStart = original.i + 1;
          original.group();
          labelSpan = { start: span.start + labelStart, end: span.start + original.i - 1 };
        }
        return { span, optionsSpan, labelSpan };
      } catch { return { span }; }
    };
    const picture = /\\begin\{tikzpicture\}/.exec(expanded);
    if (!picture) return null;
    const c = new Cursor(expanded);
    c.i = picture.index + picture[0].length;
    c.space();
    const global = expanded[c.i] === '[' ? parseTikzOptionString(c.group('[', ']')) : {};
    // Resolve physical bases before adding geometry to the original canvas AST.
    if (['rotate', 'transform canvas'].some((key) => global[key])) return null;
    const sx = global.x ? lengthPx(global.x) : PX_PER_CM;
    const sy = global.y ? -lengthPx(global.y) : -PX_PER_CM;
    const colors: Record<string, string> = {
      black: '#000000', white: '#FFFFFF', red: '#FF0000', blue: '#0000FF', gray: '#808080', none: 'none',
      green: '#00FF00', yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', brown: '#BF8040',
      lime: '#BFFF00', olive: '#808000', orange: '#FF8000', pink: '#FFBFBF', purple: '#BF0040',
      teal: '#008080', violet: '#800080', lightgray: '#BFBFBF', darkgray: '#404040',
    };
    for (const m of expanded.matchAll(/\\definecolor\{([^}]+)\}\{HTML\}\{([0-9a-fA-F]{6})\}/g)) colors[m[1]] = `#${m[2]}`;
    for (const m of expanded.matchAll(/\\definecolor\{([^}]+)\}\{(RGB|rgb|gray)\}\{([^}]+)\}/g)) {
      const values = m[3].split(',').map(Number);
      const channels = m[2] === 'gray' ? [values[0], values[0], values[0]] : values;
      if (channels.length === 3 && channels.every(Number.isFinite)) colors[m[1]] = `#${channels.map((n) =>
        Math.round(Math.max(0, Math.min(255, n * (m[2] === 'RGB' ? 1 : 255)))).toString(16).padStart(2, '0')).join('')}`;
    }
    const color = (value: string): string => {
      const rgb = /^rgb,255:red,(\d+);green,(\d+);blue,(\d+)$/.exec(value.replace(/[{}\s]/g, ''));
      if (rgb) return `#${rgb.slice(1).map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('')}`;
      if (value.includes('!')) {
        const parts = value.split('!');
        let result = color(parts.shift()!);
        while (parts.length) {
          const percentage = Number(parts.shift());
          const other = color(parts.shift() || 'white');
          if (!Number.isFinite(percentage)) throw new Error('Unsupported color mix');
          const weight = Math.max(0, Math.min(1, percentage / 100));
          result = `#${[1, 3, 5].map((at) => Math.round(parseInt(result.slice(at, at + 2), 16) * weight +
            parseInt(other.slice(at, at + 2), 16) * (1 - weight)).toString(16).padStart(2, '0')).join('')}`;
        }
        return result;
      }
      const resolved = colors[value] || (/^(?:nips|cvpr|npg|ieee)_/.test(value) ? resolveTikzColor(value, 'stroke') : undefined);
      if (!resolved) throw new Error(`Unsupported color ${value}`);
      return resolved;
    };
    for (const m of expanded.matchAll(/\\colorlet\{([^}]+)\}\{([^}]+)\}/g)) colors[m[1]] = color(m[2]);
    const styles: Record<string, Options> = { ...defaultStyles };
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
    const scene: CoordinateScene = {
      elements: [], clips: [], viewBox: [0, 0, 100, 100],
      source, coordinateScale: [sx, sy],
      transformed: sx !== PX_PER_CM || sy !== -PX_PER_CM || ['scale', 'xscale', 'yscale'].some((key) => global[key] && Number(global[key]) !== 1),
      fontFamily: /\\(?:usepackage(?:\[[^\]]*\])?\{helvet\}|sfdefault)/.test(expanded) ? 'Arial, Helvetica, sans-serif' : '"Times New Roman", serif',
    };
    const bounds: Point[] = [];
    let explicitBounds: [Point, Point] | undefined;
    let clips: string[] = [];
    let transform: CoordinateTransform = {
      xScale: Number(global.xscale || 1) * Number(global.scale || 1),
      yScale: Number(global.yscale || 1) * Number(global.scale || 1), shiftX: 0, shiftY: 0,
    };
    let editScope: MacroSource['editScope'];
    const scopes: Array<{ clips: string[]; transform: CoordinateTransform; editScope: MacroSource['editScope']; opened?: MacroSource['editScope'] }> = [];
    let statementPoints: Point[] = [];
    let coordinates: GeometrySource['coordinates'] = [];
    let rawOptions: Options = {};
    const namedPoints = new Map<string, { x: number; y: number; width: number; height: number }>();
    let optionsSpan: GeometrySpan | undefined;
    let labelSpan: GeometrySpan | undefined;
    const dimension = (raw: string, basis: number, start: number): GeometryCoordinate => {
      const match = /^(.*?)(cm|mm|pt|in)\s*$/.exec(raw);
      const unit = match?.[2] || '';
      const value = evaluateCoordinateNumber(match ? match[1] : raw);
      const actualBasis = unit ? lengthPx(`1${unit}`) : basis;
      const span = sourceSpan(start, start + raw.length);
      return { start: span?.start ?? -1, end: span?.end ?? -1, value, basis: actualBasis, unit };
    };
    const point = (): Point => {
      c.space();
      const relative = expanded[c.i] === '+';
      if (relative) { c.i++; if (expanded[c.i] === '+') c.i++; c.space(); }
      const previousPoint = statementPoints[statementPoints.length - 1];
      const innerStart = c.i + 1;
      const pair = new Cursor(c.group('(', ')'));
      // Coordinate expressions in braces can contain parentheses and commas.
      let depth = 0;
      let split = -1;
      for (let i = 0; i < pair.text.length; i++) {
        if ('{('.includes(pair.text[i])) depth++;
        else if ('})'.includes(pair.text[i])) depth--;
        else if (pair.text[i] === ',' && depth === 0) { split = i; break; }
      }
      if (split < 0) {
        const [name, anchor] = pair.text.trim().split('.');
        const named = namedPoints.get(name);
        if (!named) throw new Error('Unknown named coordinate');
        const dx = anchor === 'east' ? named.width / 2 : anchor === 'west' ? -named.width / 2 : 0;
        const dy = anchor === 'north' ? -named.height / 2 : anchor === 'south' ? named.height / 2 : 0;
        const p: Point = [named.x + dx, named.y + dy];
        coordinates.push({ x: { start: -1, end: -1, value: p[0], basis: 1, unit: '' },
          y: { start: -1, end: -1, value: p[1], basis: 1, unit: '' } });
        statementPoints.push(p); bounds.push(p);
        return p;
      }
      const x = dimension(pair.text.slice(0, split), sx, innerStart);
      const y = dimension(pair.text.slice(split + 1), sy, innerStart + split + 1);
      // Physical y dimensions always point upward, independent of the y basis.
      if (y.unit) y.basis = -Math.abs(y.basis);
      x.basis *= transform.xScale; x.offset = transform.shiftX;
      y.basis *= transform.yScale; y.offset = transform.shiftY;
      if (relative) {
        x.offset = previousPoint?.[0] ?? transform.shiftX; y.offset = previousPoint?.[1] ?? transform.shiftY;
        x.relative = true; y.relative = true;
      }
      const p: Point = [x.value * x.basis + x.offset, y.value * y.basis + y.offset];
      coordinates.push({ x, y });
      statementPoints.push(p);
      bounds.push(p);
      return p;
    };
    const options = (): Options => {
      c.space();
      const start = c.i + 1;
      rawOptions = expanded[c.i] === '[' ? parseTikzOptionString(c.group('[', ']')) : {};
      optionsSpan = c.i >= start ? sourceSpan(start, c.i - 1) : undefined;
      return resolve(rawOptions);
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
      const statementStart = c.i;
      const macro = invocations.find((invocation) => statementStart >= invocation.from && statementStart < invocation.to)?.source;
      if (macro && !macro.parent) macro.parent = { ...transform };
      if (macro && editScope) macro.editScope = editScope;
      statementPoints = [];
      coordinates = [];
      labelSpan = undefined;
      optionsSpan = undefined;
      const command = c.command();
      const editableSource = (): GeometrySource | undefined => {
        const original = originalStatement(statementStart, c.i);
        return original ? { span: original.span, optionsSpan: original.optionsSpan || optionsSpan,
          labelSpan: original.labelSpan || labelSpan, coordinates, rawOptions, transform: { ...transform } } : undefined;
      };
      const elementBounds = (): GeometryBounds => {
        const xs = statementPoints.map((p) => p[0]), ys = statementPoints.map((p) => p[1]);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      };
      if (command === 'end') {
        const env = c.group();
        if (env === 'tikzpicture') break;
        if (env !== 'scope' || !scopes.length) throw new Error('Unsupported environment');
        const previous = scopes.pop()!;
        if (previous.opened) {
          previous.opened.span.end = origins[c.i - 1] + 1;
          if (previous.opened.name) {
            const owned = scene.elements.filter((element) => element.macro?.editScope === previous.opened);
            if (owned.length) {
              const left = Math.min(...owned.map((element) => element.bounds[0]));
              const top = Math.min(...owned.map((element) => element.bounds[1]));
              const right = Math.max(...owned.map((element) => element.bounds[0] + element.bounds[2]));
              const bottom = Math.max(...owned.map((element) => element.bounds[1] + element.bounds[3]));
              namedPoints.set(previous.opened.name, { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top });
            }
          }
        }
        clips = previous.clips; transform = previous.transform; editScope = previous.editScope;
        continue;
      }
      if (command === 'begin') {
        const environment = c.group();
        if (environment === 'axis') {
          const end = expanded.indexOf('\\end{axis}', c.i);
          if (end < 0) throw new Error('Unclosed axis');
          c.i = end + '\\end{axis}'.length;
          continue;
        }
        if (environment !== 'scope') throw new Error('Unsupported environment');
        const opts = options();
        const scopeEnd = expanded.indexOf('\\end{scope}', c.i);
        if (scopeEnd >= 0 && expanded.slice(c.i, scopeEnd).includes('\\begin{axis}')) {
          c.i = scopeEnd + '\\end{scope}'.length;
          continue;
        }
        if (Object.keys(opts).some((key) => !['shift', 'xshift', 'yshift', 'scale', 'xscale', 'yscale', 'local bounding box'].includes(key))) throw new Error('Unsupported scope transform');
        const parent = { ...transform };
        const shift = /^\s*\(\s*(.*?)\s*,\s*(.*?)\s*\)\s*$/.exec(opts.shift || '');
        const length = (raw: string, basis: number) => {
          const physical = /(?:cm|mm|pt|in)\s*$/.test(raw);
          return physical ? lengthPx(raw) * Math.sign(basis) : evaluateCoordinateNumber(raw) * basis;
        };
        const local: CoordinateTransform = {
          xScale: Number(opts.xscale || 1) * Number(opts.scale || 1), yScale: Number(opts.yscale || 1) * Number(opts.scale || 1),
          shiftX: shift ? length(shift[1], /(?:cm|mm|pt|in)\s*$/.test(shift[1]) ? 52 : sx) : 0,
          shiftY: shift ? length(shift[2], /(?:cm|mm|pt|in)\s*$/.test(shift[2]) ? -52 : sy) : 0,
        };
        if (opts.xshift) local.shiftX += lengthPx(opts.xshift);
        if (opts.yshift) local.shiftY -= lengthPx(opts.yshift);
        if (![local.xScale, local.yScale, local.shiftX, local.shiftY].every(Number.isFinite) || !local.xScale || !local.yScale) throw new Error('Invalid scope transform');
        const direct = sourceSpan(statementStart, c.i);
        const marker = direct ? source.slice(0, direct.start).match(/% @agentikz-edit-group\s*$/) : null;
        const opened = direct && marker ? {
          span: { start: marker.index!, end: direct.end }, optionsSpan, transform: local, parent, name: opts['local bounding box'],
        } : undefined;
        scopes.push({ clips: [...clips], transform: parent, editScope, opened });
        if (opened) editScope = opened;
        transform = { xScale: parent.xScale * local.xScale, yScale: parent.yScale * local.yScale,
          shiftX: parent.shiftX + local.shiftX * parent.xScale, shiftY: parent.shiftY + local.shiftY * parent.yScale };
        continue;
      }
      if (command === 'node') {
        const opts = options();
        c.space();
        const name = expanded[c.i] === '(' ? c.group('(', ')').trim() : undefined;
        c.space();
        let x = 0, y = 0;
        if (expanded.startsWith('at', c.i)) { consume('at'); [x, y] = point(); }
        if (opts.xshift) x += lengthPx(opts.xshift) * transform.xScale;
        if (opts.yshift) y -= lengthPx(opts.yshift) * transform.yScale;
        c.space();
        const labelStart = c.i + 1;
        const label = c.group();
        labelSpan = sourceSpan(labelStart, c.i - 1);
        consume(';');
        const font = /\\fontsize\{([\d.]+)\}/.exec(opts.font || '');
        const sizeCommand = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(opts.font || '')?.[1];
        const fontSize = (font ? Number(font[1]) : ({
          tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10,
          large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88,
        } as Record<string, number>)[sizeCommand || 'normalsize']) * PX_PER_PT;
        const lines = label.split(/\\\\(?:\[[^\]]*\])?/);
        const width = Math.max(opts['minimum width'] ? lengthPx(opts['minimum width']) : 0,
          opts['text width'] ? lengthPx(opts['text width']) : 0, fontSize, ...lines.map((line) =>
          Array.from(line.replace(/\\[a-zA-Z]+|[{}$]/g, '')).reduce((n, char) => n + (/[^\x00-\xff]/.test(char) ? 1 : 0.58), 0) * fontSize
          + fontSize * 0.8));
        const height = Math.max(opts['minimum height'] ? lengthPx(opts['minimum height']) : 0, fontSize * lines.length * 1.4);
        if (name) namedPoints.set(name, { x, y, width, height });
        const anchor = opts.anchor || 'center';
        const left = anchor.includes('west') ? 0 : anchor.includes('east') ? -width : -width / 2;
        const top = anchor.includes('north') ? 0 : anchor.includes('south') ? -height : -height / 2;
        const rotate = -Number(opts.rotate || 0);
        const angle = rotate * Math.PI / 180;
        const corners: Point[] = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]];
        const xs = corners.map(([a, b]) => x + a * Math.cos(angle) - b * Math.sin(angle));
        const ys = corners.map(([a, b]) => y + a * Math.sin(angle) + b * Math.cos(angle));
        scene.elements.push({
          kind: 'label', x, y,
          lines,
          fontSize, bold: /\\bfseries\b/.test(opts.font || ''),
          color: color(opts.text || 'black'),
          rotate, clips: [...clips], anchor, box: [left, top, width, height],
          bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
          source: editableSource(), macro,
        });
        continue;
      }
      if (!['draw', 'path', 'filldraw', 'fill', 'clip', 'useasboundingbox'].includes(command)) throw new Error('Unsupported TikZ command');
      const opts = options();
      const supported = new Set(['fill', 'draw', 'line width', 'rounded corners', 'line join', 'line cap', 'dash pattern', 'dashed', 'densely dashed', 'loosely dashed', 'dotted', 'densely dotted', '->', '-', '-Stealth', '-Latex']);
      for (const key of Object.keys(opts)) {
        if (!supported.has(key) && !colors[key]) throw new Error(`Unsupported path option ${key}`);
      }
      const start = point();
      let d = `M ${start.join(' ')}`;
      let last = start;
      const radius = opts['rounded corners'] ? lengthPx(opts['rounded corners']) : 0;
      let circleRadius: GeometryCoordinate | undefined;
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
          c.space();
          const radiusStart = c.i + 1;
          const radiusText = c.group('(', ')');
          circleRadius = dimension(radiusText, sx, radiusStart);
          circleRadius.basis *= transform.xScale;
          const rx = Math.abs(circleRadius.value * circleRadius.basis);
          const ry = circleRadius.unit ? Math.abs(circleRadius.value * lengthPx(`1${circleRadius.unit}`) * transform.yScale) : Math.abs(circleRadius.value * sy * transform.yScale);
          d = `M ${start[0] - rx} ${start[1]} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
          bounds.push([start[0] - rx, start[1] - ry], [start[0] + rx, start[1] + ry]);
          statementPoints.push([start[0] - rx, start[1] - ry], [start[0] + rx, start[1] + ry]);
        } else if (expanded.startsWith('--', c.i)) {
          c.i += 2;
          c.space();
          if (expanded.startsWith('cycle', c.i)) { c.i += 5; d += ' Z'; }
          else { last = point(); d += ` L ${last.join(' ')}`; }
        } else if (expanded.startsWith('|-', c.i) || expanded.startsWith('-|', c.i)) {
          const verticalFirst = expanded.startsWith('|-', c.i);
          c.i += 2;
          c.space();
          // Named edge labels remain owned and edited by the existing edge AST.
          if (expanded.startsWith('node', c.i)) {
            c.i += 4; c.space();
            if (expanded[c.i] === '[') c.group('[', ']');
            c.group(); c.space();
          }
          const end = point();
          d += verticalFirst ? ` L ${last[0]} ${end[1]} L ${end.join(' ')}` : ` L ${end[0]} ${last[1]} L ${end.join(' ')}`;
          last = end;
        } else if (expanded.startsWith('to', c.i)) {
          c.i += 2; c.space();
          const bend = expanded[c.i] === '[' ? parseTikzOptionString(c.group('[', ']')) : {};
          const end = point();
          const amount = Number(bend['bend left'] || bend['bend right'] || 28) * Math.PI / 180;
          const sign = bend['bend right'] ? -1 : 1;
          const cx = (last[0] + end[0]) / 2 - (end[1] - last[1]) * Math.tan(amount) * sign / 2;
          const cy = (last[1] + end[1]) / 2 + (end[0] - last[0]) * Math.tan(amount) * sign / 2;
          d += ` Q ${cx} ${cy} ${end.join(' ')}`; last = end;
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
      if (radius > 0 && !/[CQaZ]/.test(d) && statementPoints.length > 2) {
        d = `M ${statementPoints[0].join(' ')}`;
        for (let i = 1; i < statementPoints.length - 1; i++) {
          const a = statementPoints[i - 1], b = statementPoints[i], end = statementPoints[i + 1];
          const before = Math.hypot(b[0] - a[0], b[1] - a[1]), after = Math.hypot(end[0] - b[0], end[1] - b[1]);
          if (!before || !after) continue;
          const r = Math.min(radius, before / 2, after / 2);
          const p: Point = [b[0] + (a[0] - b[0]) * r / before, b[1] + (a[1] - b[1]) * r / before];
          const q: Point = [b[0] + (end[0] - b[0]) * r / after, b[1] + (end[1] - b[1]) * r / after];
          d += ` L ${p.join(' ')} Q ${b.join(' ')} ${q.join(' ')}`;
        }
        d += ` L ${statementPoints[statementPoints.length - 1].join(' ')}`;
      }
      const colorFlag = Object.keys(opts).find((key) => colors[key]);
      const fill = opts.fill ? color(opts.fill) : command === 'fill' || command === 'filldraw' ? color(colorFlag || 'black') : 'none';
      const stroke = opts.draw ? color(opts.draw) : command === 'draw' || command === 'filldraw' ? color(colorFlag || 'black') : 'none';
      const dash = opts['dash pattern']?.match(/[\d.]+\s*(?:pt|mm|cm)/g)?.map(lengthPx).join(' ') ||
        (opts['densely dashed'] ? '5.5 3.7' : opts['loosely dashed'] ? '5.5 11' : opts.dashed ? '5.5 5.5' :
          opts['densely dotted'] ? '0.8 2.7' : opts.dotted ? '0.8 5.5' : undefined);
      scene.elements.push({
        kind: 'path', d, fill, stroke,
        strokeWidth: lengthPx(opts['line width'] || '0.4pt'),
        arrow: ['->', '-Stealth', '-Latex'].some((key) => opts[key] === 'true'), dash, clips: [...clips],
        arrowSize: [
          global['>']?.match(/length\s*=\s*([\d.]+(?:pt|mm|cm))/)?.[1],
          global['>']?.match(/width\s*=\s*([\d.]+(?:pt|mm|cm))/)?.[1],
        ].map((size) => size ? lengthPx(size) : 7) as [number, number],
        bounds: elementBounds(), source: editableSource(), macro, radius: circleRadius,
        lineCap: (opts['line cap'] || 'butt') as CoordinatePath['lineCap'],
        lineJoin: (opts['line join'] || 'miter') as CoordinatePath['lineJoin'],
      });
      if (scene.elements.length > 20000) throw new Error('Scene limit');
    }
    if (!scene.elements.length || scopes.length) return null;
    const extent = explicitBounds || bounds;
    const xs = extent.map((p) => p[0]), ys = extent.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad = 8;
    if (explicitBounds) scene.explicitBounds = [minX, minY, maxX - minX, maxY - minY];
    scene.viewBox = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad];
    return scene;
  } catch (error) {
    onUnsupported?.(error);
    return null;
  }
}
