import { parseTikzOptionEntries, parseTikzOptionString } from './options';
import { maskLatexComments } from '../tex/source';
import { resolveTikzColor } from '../themes/journal-presets';
import { TikzCursor as Cursor, indexTikzEnvironments, scanTikzStatements } from './syntax';
import { applyStyleDefinitions, resolveTikzStyles, type TikzOptionEntries, type TikzStyles } from './styles';

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
  reference?: string;
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
  resolvedOptions?: Options;
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
  arrowStart?: boolean;
  /** Rendering-only trimming; the editable coordinates remain unchanged. */
  renderD?: string;
  preaction?: { stroke: string; strokeWidth: number };
  opacity?: number;
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
  shape?: { kind: 'rectangle' | 'circle' | 'ellipse'; fill: string; stroke: string; strokeWidth: number; radius: number; dash?: string };
  fontFamily?: string;
  align?: string;
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
  diagnostics?: Array<{ span: GeometrySpan; message: string; command: string }>;
}

/** A bounded, non-executing subset of TeX macro substitution. */
function expandMappedMacros(source: string, tolerant = false): { text: string; origins: number[]; invocations: Array<{ from: number; to: number; source: MacroSource }>;
  diagnostics: NonNullable<CoordinateScene['diagnostics']> } {
  const macros = new Map<string, { args: number; body: string }>();
  const invocations: Array<{ from: number; to: number; source: MacroSource }> = [];
  const diagnostics: NonNullable<CoordinateScene['diagnostics']> = [];
  let operations = 0;
  let produced = 0;
  let recoveryEnds: Map<number, number> | undefined;
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
      if (text[c.i] !== '\\' || c.i + 1 >= text.length || /[\r\n]/.test(text[c.i + 1])) {
        append(text[c.i], c.i); c.i++; continue;
      }
      const start = c.i;
      const name = c.command();
      const expands = macros.has(name) || ['newcommand', 'renewcommand', 'providecommand', 'def', 'foreach'].includes(name);
      const previousMacros = expands ? new Map(macros) : undefined;
      const previousInvocations = invocations.length;
      try {
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
      } catch (error) {
        if (!tolerant || depth > 0) throw error;
        if (previousMacros) { macros.clear(); for (const [key, value] of previousMacros) macros.set(key, value); }
        invocations.length = previousInvocations;
        // Leave unsupported definitions/invocations opaque. The remaining source
        // can still be expanded and mapped independently of this failed command.
        recoveryEnds ??= new Map(scanTikzStatements(text).map((item) => [item.start, item.end]));
        const end = recoveryEnds.get(start) ?? Math.max(c.i, start + 1);
        c.i = end;
        diagnostics.push({ span: { start, end }, command: name, message: error instanceof Error ? error.message : String(error) });
        append(text.slice(start, end), start);
      }
    }
    return { text: output, origins };
  };
  return { ...expand(maskLatexComments(source)), invocations, diagnostics };
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
  if (!match || !Number.isFinite(Number(match[1]))) throw new Error(`Unsupported dimension ${value}`);
  return Number(match[1]) * ({ cm: PX_PER_CM, mm: PX_PER_CM / 10, pt: PX_PER_PT, in: PX_PER_CM * 2.54 }[match[2] || 'cm']!);
}

/** Add source-mapped physical geometry to the original canvas's AST. */
export function parseCoordinateGeometry(source: string, onUnsupported?: (error: unknown) => void, defaultStyles: Record<string, Options> = {}): CoordinateScene | null {
  try {
    const { text: expanded, origins, invocations, diagnostics: macroDiagnostics } = expandMappedMacros(source, true);
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
    const statements = scanTikzStatements(expanded);
    const environmentCloses = indexTikzEnvironments(statements);
    const picture = statements.find((item) => item.command === 'begin' && item.environment === 'tikzpicture');
    if (!picture) return null;
    const pictureClose = environmentCloses.get(picture.start);
    const pictureEnd = pictureClose?.start ?? expanded.length;
    const c = new Cursor(expanded);
    let colors: Record<string, string> = {
      black: '#000000', white: '#FFFFFF', red: '#FF0000', blue: '#0000FF', gray: '#808080', none: 'none',
      green: '#00FF00', yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', brown: '#BF8040',
      lime: '#BFFF00', olive: '#808000', orange: '#FF8000', pink: '#FFBFBF', purple: '#BF0040',
      teal: '#008080', violet: '#800080', lightgray: '#BFBFBF', darkgray: '#404040',
    };
    const color = (value: string): string => {
      value = value.trim();
      if (/^#[0-9a-f]{6}$/i.test(value)) return value;
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
      const resolved = Object.hasOwn(colors, value) ? colors[value] :
        /^(?:nips|cvpr|npg|ieee)_/.test(value) ? resolveTikzColor(value, 'stroke') : undefined;
      if (!resolved) throw new Error(`Unsupported color ${value}`);
      return resolved;
    };
    const hasColor = (name: string) => Object.hasOwn(colors, name);
    let styles: TikzStyles = Object.assign(Object.create(null), Object.fromEntries(
      Object.entries(defaultStyles).map(([key, value]) => [key, Object.entries(value)])
    ));
    let inherited: Options = {};
    const resolve = (raw: TikzOptionEntries) => resolveTikzStyles(raw, styles);
    const declaration = (command: string, cursor: Cursor): boolean => {
      if (command === 'tikzset') {
        const nextStyles = Object.assign(Object.create(null), styles) as TikzStyles;
        const values = resolveTikzStyles(applyStyleDefinitions(parseTikzOptionEntries(cursor.group()), nextStyles), nextStyles);
        styles = nextStyles;
        inherited = { ...inherited, ...values };
      } else if (command === 'definecolor') {
        const name = cursor.group().trim(), model = cursor.group().trim(), value = cursor.group().trim();
        let hex: string;
        if (model === 'HTML' && /^[a-f\d]{6}$/i.test(value)) hex = `#${value}`;
        else {
          const parts = value.split(',');
          const values = parts.map((part) => part.trim() ? Number(part) : NaN);
          const channels = model === 'gray' ? [values[0], values[0], values[0]] : values;
          if (!['RGB', 'rgb', 'gray'].includes(model) || values.length !== (model === 'gray' ? 1 : 3) || !channels.every(Number.isFinite)) {
            throw new Error(`Unsupported color definition ${name} (${model})`);
          }
          hex = `#${channels.map((n) => Math.round(Math.max(0, Math.min(255, n * (model === 'RGB' ? 1 : 255))))
            .toString(16).padStart(2, '0')).join('')}`;
        }
        colors = { ...colors, [name]: hex };
      } else if (command === 'colorlet') {
        const name = cursor.group().trim();
        colors = { ...colors, [name]: color(cursor.group().trim()) };
      } else return false;
      return true;
    };
    const scene: CoordinateScene = {
      elements: [], clips: [], viewBox: [0, 0, 100, 100], diagnostics: [],
      source, coordinateScale: [PX_PER_CM, -PX_PER_CM],
      fontFamily: /\\(?:usepackage(?:\[[^\]]*\])?\{helvet\}|sfdefault)/.test(expanded) ? 'Arial, Helvetica, sans-serif' : '"Times New Roman", serif',
    };
    const diagnosticStarts = new Set<number>();
    const report = (start: number, end: number, command: string, error: unknown, macro?: MacroSource) => {
      const span = sourceSpan(start, end) || macro?.span || {
        start: Math.max(0, origins[start] ?? 0),
        end: (end === expanded.length ? source.length : Math.max(0, origins[end - 1] ?? 0) + 1),
      };
      if (diagnosticStarts.has(span.start)) return;
      diagnosticStarts.add(span.start);
      scene.diagnostics!.push({ span, command, message: error instanceof Error ? error.message : String(error) });
      onUnsupported?.(error);
    };
    for (const issue of macroDiagnostics) {
      if (pictureClose && issue.span.start >= origins[pictureClose.end - 1]) continue;
      diagnosticStarts.add(issue.span.start);
      scene.diagnostics!.push(issue);
      onUnsupported?.(new Error(issue.message));
    }
    for (const statement of statements.filter((item) => item.start < picture.start)) {
      const sc = new Cursor(expanded); sc.i = statement.start; sc.limit = statement.end;
      try { declaration(sc.command(), sc); }
      catch (error) { report(statement.start, statement.end, statement.command, error); }
    }
    let global: Options;
    let sx: number, sy: number;
    let transform: CoordinateTransform;
    try {
      c.i = picture.start; c.limit = picture.end;
      c.command(); c.group(); c.space();
      const entries = expanded[c.i] === '[' ? parseTikzOptionEntries(c.group('[', ']')) : [];
      const options = applyStyleDefinitions(entries, styles);
      global = { ...inherited, ...resolve(styles['every picture'] || []), ...resolve(options) };
      if (['rotate', 'rotate around', 'shift', 'xshift', 'yshift', 'transform canvas', 'cm'].some((key) => global[key])) {
        throw new Error('Unsupported picture transform');
      }
      sx = global.x ? lengthPx(global.x) : PX_PER_CM;
      sy = global.y ? -lengthPx(global.y) : -PX_PER_CM;
      transform = {
        xScale: Number(global.xscale || 1) * Number(global.scale || 1),
        yScale: Number(global.yscale || 1) * Number(global.scale || 1), shiftX: 0, shiftY: 0,
      };
      if (![transform.xScale, transform.yScale, sx, sy].every(Number.isFinite) || !sx || !sy || !transform.xScale || !transform.yScale) {
        throw new Error('Invalid picture scale');
      }
      scene.coordinateScale = [sx, sy];
      scene.transformed = sx !== PX_PER_CM || sy !== -PX_PER_CM || transform.xScale !== 1 || transform.yScale !== 1;
      inherited = global;
    } catch (error) {
      report(picture.start, pictureClose?.end ?? expanded.length, 'begin', error);
      return scene;
    }
    const appearanceKeys = new Set(['font', 'text', 'align', 'draw', 'fill', 'color', 'line width', 'rounded corners', 'line join', 'line cap',
      'dash pattern', 'dashed', 'densely dashed', 'loosely dashed', 'dotted', 'densely dotted', 'loosely dotted', 'solid',
      '->', '<-', '<->', '-', '-Stealth', '-Latex', 'Stealth-', 'Latex-', 'shorten >', 'shorten <', 'preaction', 'opacity', '>']);
    const appearance = (opts: Options) => Object.fromEntries(Object.entries(opts).filter(([key]) => appearanceKeys.has(key) || hasColor(key)));
    const dashPattern = (opts: Options) => opts.solid ? undefined :
      opts['dash pattern']?.match(/[\d.]+\s*(?:pt|mm|cm)/g)?.map(lengthPx).join(' ') ||
      (opts['densely dashed'] ? '5.5 3.7' : opts['loosely dashed'] ? '5.5 11' : opts.dashed ? '5.5 5.5' :
        opts['densely dotted'] ? '0.8 2.7' : opts['loosely dotted'] ? '0.8 9' : opts.dotted ? '0.8 5.5' : undefined);
    const paint = (opts: Options, key: 'draw' | 'fill', fallback: string) => {
      const flag = Object.keys(opts).filter((name) => hasColor(name) && opts[name] === 'true').at(-1);
      return color(opts[key] === 'false' ? 'none' : opts[key] && opts[key] !== 'true' ? opts[key] : opts.color || flag || fallback);
    };
    let explicitBounds: [Point, Point] | undefined;
    let clips: string[] = [];
    let editScope: MacroSource['editScope'];
    const scopes: Array<{ end: number; clips: string[]; transform: CoordinateTransform; editScope: MacroSource['editScope']; opened?: MacroSource['editScope'];
      styles: TikzStyles; colors: Record<string, string>; inherited: Options }> = [];
    let statementPoints: Point[] = [];
    let coordinates: GeometrySource['coordinates'] = [];
    let rawOptions: Options = {};
    let resolvedOptions: Options = {};
    let relativeBase: Point | undefined;
    const namedPoints = new Map<string, { x: number; y: number; width: number; height: number; shape?: string }>();
    let namedReferences = new Map<Point, { name: string; anchor?: string }>();
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
      const updateBase = !relative || expanded[c.i + 1] === '+';
      if (relative) { c.i++; if (expanded[c.i] === '+') c.i++; c.space(); }
      const previousPoint = relativeBase;
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
        if (anchor && !['center', 'north', 'south', 'east', 'west', 'north east', 'north west', 'south east', 'south west'].includes(anchor)) throw new Error(`Unsupported anchor ${anchor}`);
        const dx = anchor?.includes('east') ? named.width / 2 : anchor?.includes('west') ? -named.width / 2 : 0;
        const dy = anchor?.includes('north') ? -named.height / 2 : anchor?.includes('south') ? named.height / 2 : 0;
        const p: Point = [named.x + dx, named.y + dy];
        coordinates.push({ x: { start: -1, end: -1, value: p[0], basis: 1, unit: '', reference: name },
          y: { start: -1, end: -1, value: p[1], basis: 1, unit: '', reference: name } });
        namedReferences.set(p, { name, anchor });
        statementPoints.push(p); relativeBase = p;
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
      if (updateBase) relativeBase = p;
      return p;
    };
    const options = (): Options => {
      c.space();
      const start = c.i + 1;
      const text = expanded[c.i] === '[' ? c.group('[', ']') : '';
      rawOptions = parseTikzOptionString(text);
      optionsSpan = c.i >= start ? sourceSpan(start, c.i - 1) : undefined;
      resolvedOptions = resolve(parseTikzOptionEntries(text));
      return resolvedOptions;
    };
    const consume = (token: string) => {
      c.space();
      if (c.i + token.length > c.limit || !expanded.startsWith(token, c.i)) throw new Error(`Expected ${token}`);
      c.i += token.length;
    };
    let skipUntil = picture.end;
    for (const statement of statements) {
      if (statement.start < skipUntil) continue;
      if (statement.start >= pictureEnd) break;
      const statementStart = statement.start;
      c.i = statementStart; c.limit = statement.end;
      const macro = invocations.find((invocation) => statementStart >= invocation.from && statementStart < invocation.to)?.source;
      if (macro && !macro.parent) macro.parent = { ...transform };
      if (macro && editScope) macro.editScope = editScope;
      statementPoints = [];
      coordinates = [];
      namedReferences = new Map();
      relativeBase = undefined;
      rawOptions = {}; resolvedOptions = {};
      labelSpan = undefined;
      optionsSpan = undefined;
      const { command } = statement;
      const checkpoint = { elements: scene.elements.length, clipCount: scene.clips.length, clips, explicitBounds, styles, colors, inherited };
      const editableSource = (): GeometrySource | undefined => {
        const original = originalStatement(statementStart, c.i);
        return original ? { span: original.span, optionsSpan: original.optionsSpan || optionsSpan,
          labelSpan: original.labelSpan || labelSpan, coordinates, rawOptions, resolvedOptions, transform: { ...transform } } : undefined;
      };
      const elementBounds = (): GeometryBounds => {
        const xs = statementPoints.map((p) => p[0]), ys = statementPoints.map((p) => p[1]);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      };
      try {
      c.command();
      if (declaration(command, c)) continue;
      if (command === 'end') {
        if (statement.environment !== 'scope' || scopes.at(-1)?.end !== statement.end) throw new Error('Unexpected environment closer');
        const previous = scopes.pop()!;
        if (previous.opened) {
          previous.opened.span.end = origins[statement.end - 1] + 1;
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
        styles = previous.styles; colors = previous.colors; inherited = previous.inherited;
        continue;
      }
      if (command === 'begin') {
        const environment = c.group().trim();
        const scopeEnd = environmentCloses.get(statementStart)?.end;
        if (environment === 'axis') {
          if (scopeEnd === undefined) throw new Error('Unclosed axis');
          skipUntil = scopeEnd;
          continue;
        }
        if (environment !== 'scope') throw new Error(`Unsupported environment ${environment}`);
        const opts = options();
        const unsupported = Object.keys(opts).find((key) =>
          !['shift', 'xshift', 'yshift', 'scale', 'xscale', 'yscale', 'local bounding box'].includes(key) &&
          !appearanceKeys.has(key) && !hasColor(key));
        if (unsupported) throw new Error(`Unsupported scope option ${unsupported}`);
        const parent = { ...transform };
        const shift = /^\s*\(\s*(.*?)\s*,\s*(.*?)\s*\)\s*$/.exec(opts.shift || '');
        if (opts.shift && !shift) throw new Error('Unsupported scope shift');
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
        scopes.push({ end: scopeEnd ?? pictureEnd, clips, transform: parent, editScope, opened, styles, colors, inherited });
        if (scopeEnd === undefined) report(statementStart, statement.end, command, new Error('Unclosed scope'), macro);
        inherited = { ...inherited, ...appearance(opts) };
        if (opened) editScope = opened;
        transform = { xScale: parent.xScale * local.xScale, yScale: parent.yScale * local.yScale,
          shiftX: parent.shiftX + local.shiftX * parent.xScale, shiftY: parent.shiftY + local.shiftY * parent.yScale };
        continue;
      }
      if (command === 'coordinate') {
        const opts = options();
        if (Object.keys(opts).length) throw new Error('Unsupported coordinate options');
        const name = c.group('(', ')').trim(); consume('at');
        const [x, y] = point(); consume(';');
        namedPoints.set(name, { x, y, width: 0, height: 0 });
        continue;
      }
      if (command === 'node') {
        const opts = resolvedOptions = { ...appearance(inherited), ...resolve(styles['every node'] || []), ...options() };
        c.space();
        const name = expanded[c.i] === '(' ? c.group('(', ')').trim() : undefined;
        c.space();
        let x = transform.shiftX, y = transform.shiftY;
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
        const innerSep = opts['inner sep'] ? lengthPx(opts['inner sep']) : 3.333 * PX_PER_PT;
        const innerX = opts['inner xsep'] ? lengthPx(opts['inner xsep']) : innerSep;
        const innerY = opts['inner ysep'] ? lengthPx(opts['inner ysep']) : innerSep;
        let width = Math.max(opts['minimum width'] || opts['minimum size'] ? lengthPx(opts['minimum width'] || opts['minimum size']) : 0,
          opts['text width'] ? lengthPx(opts['text width']) : 0, fontSize, ...lines.map((line) =>
          Array.from(line.replace(/\\[a-zA-Z]+|[{}$]/g, '')).reduce((n, char) => n + (/[^\x00-\xff]/.test(char) ? 1 : 0.58), 0) * fontSize
          + 2 * innerX));
        let height = Math.max(opts['minimum height'] || opts['minimum size'] ? lengthPx(opts['minimum height'] || opts['minimum size']) : 0,
          label ? fontSize * lines.length * 1.15 + 2 * innerY : 2 * innerY);
        if (opts.circle === 'true' || opts.shape === 'circle') width = height = Math.max(width, height);
        const anchor = opts.anchor || 'center';
        const left = anchor.includes('west') ? 0 : anchor.includes('east') ? -width : -width / 2;
        const top = anchor.includes('north') ? 0 : anchor.includes('south') ? -height : -height / 2;
        const rotate = -Number(opts.rotate || 0);
        if (![x, y, width, height, rotate, fontSize].every(Number.isFinite) || width < 0 || height < 0) throw new Error('Invalid node dimensions');
        const angle = rotate * Math.PI / 180;
        const corners: Point[] = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]];
        const xs = corners.map(([a, b]) => x + a * Math.cos(angle) - b * Math.sin(angle));
        const ys = corners.map(([a, b]) => y + a * Math.sin(angle) + b * Math.cos(angle));
        const shapeName = opts.shape || (opts.circle ? 'circle' : opts.ellipse ? 'ellipse' : 'rectangle');
        if (!['rectangle', 'circle', 'ellipse'].includes(shapeName)) throw new Error(`Unsupported node shape ${shapeName}`);
        const unsupportedNode = ['diamond', 'trapezium', 'cylinder', 'regular polygon', 'rotate around', 'transform canvas', 'transform shape', 'scale', 'xscale', 'yscale']
          .find((key) => opts[key]);
        if (unsupportedNode) throw new Error(`Unsupported node option ${unsupportedNode}`);
        const shape: CoordinateLabel['shape'] = opts.draw || opts.fill ? {
          kind: shapeName as 'rectangle' | 'circle' | 'ellipse',
          fill: opts.fill ? paint(opts, 'fill', 'black') : 'none', stroke: opts.draw ? paint(opts, 'draw', 'black') : 'none',
          strokeWidth: lengthPx(opts['line width'] || '0.4pt'), radius: lengthPx(opts['rounded corners'] || '0pt'), dash: dashPattern(opts),
        } : undefined;
        const textColor = color(opts.text || opts.color || 'black');
        if (name) namedPoints.set(name, { x: x + left + width / 2, y: y + top + height / 2, width, height, shape: shapeName });
        scene.elements.push({
          kind: 'label', x, y,
          lines,
          fontSize, bold: /\\bfseries\b/.test(opts.font || ''),
          color: textColor,
          rotate, clips: [...clips], anchor, box: [left, top, width, height],
          bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
          source: editableSource(), macro, shape,
          fontFamily: /\\sffamily\b/.test(opts.font || '') ? 'Arial, Helvetica, sans-serif' : undefined,
          align: opts.align,
        });
        continue;
      }
      if (!['draw', 'path', 'filldraw', 'fill', 'clip', 'useasboundingbox'].includes(command)) throw new Error('Unsupported TikZ command');
      const opts = resolvedOptions = { ...appearance(inherited), ...resolve(styles['every path'] || []), ...options() };
      const supported = appearanceKeys;
      for (const key of Object.keys(opts)) {
        if (!supported.has(key) && !hasColor(key)) throw new Error(`Unsupported path option ${key}`);
      }
      const start = point();
      let d = `M ${start.join(' ')}`;
      let last = start;
      const radius = opts['rounded corners'] ? lengthPx(opts['rounded corners']) : 0;
      let circleRadius: GeometryCoordinate | undefined;
      let inlineLabels = false;
      const skipInlineLabel = () => {
        c.space();
        if (!expanded.startsWith('node', c.i)) return;
        inlineLabels = true;
        c.i += 4; c.space();
        if (expanded[c.i] === '[') c.group('[', ']');
        c.group(); c.space();
      };
      while (true) {
        c.space();
        if (c.i >= c.limit) throw new Error('Expected ;');
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
          statementPoints.push([start[0] - rx, start[1] - ry], [start[0] + rx, start[1] + ry]);
        } else if (expanded.startsWith('--', c.i)) {
          c.i += 2;
          c.space();
          skipInlineLabel();
          if (expanded.startsWith('cycle', c.i)) { c.i += 5; d += ' Z'; }
          else { last = point(); d += ` L ${last.join(' ')}`; }
        } else if (expanded.startsWith('|-', c.i) || expanded.startsWith('-|', c.i)) {
          const verticalFirst = expanded.startsWith('|-', c.i);
          c.i += 2;
          c.space();
          // Named edge labels remain owned and edited by the existing edge AST.
          skipInlineLabel();
          const end = point();
          d += verticalFirst ? ` L ${last[0]} ${end[1]} L ${end.join(' ')}` : ` L ${end[0]} ${last[1]} L ${end.join(' ')}`;
          last = end;
        } else if (expanded.startsWith('to', c.i)) {
          c.i += 2; c.space();
          const bend = expanded[c.i] === '[' ? parseTikzOptionString(c.group('[', ']')) : {};
          skipInlineLabel();
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
      if (inlineLabels && (!namedReferences.has(start) || !namedReferences.has(last))) throw new Error('Inline labels on coordinate paths require TeX');
      const boundaryPoint = (p: Point, toward: Point): Point => {
        const reference = namedReferences.get(p);
        if (!reference || reference.anchor) return p;
        const node = namedPoints.get(reference.name)!;
        const dx = toward[0] - node.x, dy = toward[1] - node.y;
        if (!node.width || !node.height || (!dx && !dy)) return p;
        const factor = node.shape === 'circle' || node.shape === 'ellipse'
          ? 1 / Math.hypot(dx / (node.width / 2), dy / (node.height / 2))
          : Math.min(dx ? node.width / (2 * Math.abs(dx)) : Infinity, dy ? node.height / (2 * Math.abs(dy)) : Infinity);
        return [node.x + dx * factor, node.y + dy * factor];
      };
      if (statementPoints.length > 1 && !/[HVaZ]/.test(d)) {
        const first = boundaryPoint(start, statementPoints[1]);
        const end = boundaryPoint(last, statementPoints[statementPoints.length - 2]);
        d = d.replace(`M ${start.join(' ')}`, `M ${first.join(' ')}`);
        const tail = last.join(' ');
        if (d.endsWith(tail)) d = d.slice(0, -tail.length) + end.join(' ');
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
      const fill = opts.fill || command === 'fill' || command === 'filldraw' ? paint(opts, 'fill', 'black') : 'none';
      const stroke = opts.draw || command === 'draw' || command === 'filldraw' ? paint(opts, 'draw', 'black') : 'none';
      const dash = dashPattern(opts);
      let preaction: CoordinatePath['preaction'];
      if (opts.preaction) {
        const pre = resolve(parseTikzOptionEntries(opts.preaction));
        if (Object.keys(pre).some((key) => !['draw', 'line width'].includes(key))) throw new Error('Unsupported preaction option');
        preaction = { stroke: paint(pre, 'draw', 'black'), strokeWidth: lengthPx(pre['line width'] || opts['line width'] || '0.4pt') };
      }
      let renderD: string | undefined;
      if (opts['shorten >'] || opts['shorten <']) {
        if (!/^M [-+\d.eE ]+(?: L [-+\d.eE ]+)+$/.test(d)) throw new Error('Shortening curved paths requires TeX');
        const points = statementPoints.map((p) => [...p] as Point);
        const trim = (amount: number) => {
          if (amount < 0) {
            const a = points[0], b = points[1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (length) points[0] = [a[0] + (b[0] - a[0]) * amount / length, a[1] + (b[1] - a[1]) * amount / length];
            return;
          }
          while (amount && points.length > 1) {
            const a = points[0], b = points[1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (length > amount) {
              points[0] = [a[0] + (b[0] - a[0]) * amount / length, a[1] + (b[1] - a[1]) * amount / length]; break;
            }
            points.shift(); amount -= length;
          }
        };
        trim(lengthPx(opts['shorten <'] || '0pt'));
        points.reverse(); trim(lengthPx(opts['shorten >'] || '0pt')); points.reverse();
        renderD = `M ${points.map((p) => p.join(' ')).join(' L ')}`;
      }
      const opacity = opts.opacity === undefined ? undefined : Number(opts.opacity);
      if (opacity !== undefined && (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)) throw new Error('Invalid opacity');
      scene.elements.push({
        kind: 'path', d, fill, stroke, renderD, preaction, opacity,
        strokeWidth: lengthPx(opts['line width'] || '0.4pt'),
        arrow: ['->', '<->', '-Stealth', '-Latex'].some((key) => opts[key] === 'true'),
        arrowStart: ['<-', '<->', 'Stealth-', 'Latex-'].some((key) => opts[key] === 'true'), dash, clips: [...clips],
        arrowSize: [
          opts['>']?.match(/length\s*=\s*([\d.]+(?:pt|mm|cm))/)?.[1],
          opts['>']?.match(/width\s*=\s*([\d.]+(?:pt|mm|cm))/)?.[1],
        ].map((size) => size ? lengthPx(size) : 7) as [number, number],
        bounds: elementBounds(), source: editableSource(), macro, radius: circleRadius,
        lineCap: (opts['line cap'] || 'butt') as CoordinatePath['lineCap'],
        lineJoin: (opts['line join'] || 'miter') as CoordinatePath['lineJoin'],
      });
      if (scene.elements.length > 20000) throw new Error('Scene limit');
      } catch (error) {
        scene.elements.length = checkpoint.elements;
        scene.clips.length = checkpoint.clipCount; clips = checkpoint.clips; explicitBounds = checkpoint.explicitBounds;
        styles = checkpoint.styles; colors = checkpoint.colors; inherited = checkpoint.inherited;
        let end = statement.end;
        if (command === 'begin' && statement.environment) skipUntil = end = environmentCloses.get(statementStart)?.end ?? pictureEnd;
        report(statementStart, end, command, error, macro);
      }
    }
    if (!pictureClose) report(picture.start, picture.end, 'begin', new Error('Unclosed tikzpicture'));
    if (!scene.elements.length) return scene.diagnostics?.length ? scene : null;
    const extent = explicitBounds || scene.elements.flatMap((element): Point[] => [
      [element.bounds[0], element.bounds[1]], [element.bounds[0] + element.bounds[2], element.bounds[1] + element.bounds[3]],
    ]);
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
