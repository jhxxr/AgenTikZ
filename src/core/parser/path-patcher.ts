import type { GeometryCoordinate, CoordinateScene, GeometrySpan, CoordinatePath, CoordinateLabel } from './path-geometry';
import type { TikzNodeElement } from '../../types/tikz-ast';

type Patch = GeometrySpan & { text: string };
export interface GeometryEdit {
  dx?: number;
  dy?: number;
  /** Scale in scene pixels around an origin, independently of source units. */
  scale?: { x: number; y: number; originX: number; originY: number };
  point?: { index: number; x: number; y: number };
  label?: string;
  options?: Record<string, string>;
  remove?: boolean;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Invalid vector coordinate');
  return String(Number(value.toFixed(6)));
}

/** Edit only the requested option value; retain comments and unrelated formatting. */
function optionPatch(source: string, span: GeometrySpan, key: string, value: string): Patch {
  const body = source.slice(span.start, span.end);
  const entries: Array<[number, number]> = [];
  let start = 0, depth = 0;
  for (let i = 0; i <= body.length; i++) {
    if (i === body.length || (body[i] === ',' && depth === 0)) { entries.push([start, i]); start = i + 1; }
    else if ('{[('.includes(body[i])) depth++;
    else if ('}])'.includes(body[i])) depth--;
  }
  for (const [from, to] of entries.reverse()) {
    const entry = body.slice(from, to);
    const equal = entry.indexOf('=');
    if ((equal < 0 ? entry : entry.slice(0, equal)).trim() !== key) continue;
    if (equal < 0) return { start: span.start + from, end: span.start + to, text: `${key}=${value}` };
    const old = entry.slice(equal + 1);
    const leading = old.match(/^\s*/)?.[0] || '';
    const trailing = old.match(/\s*$/)?.[0] || '';
    return { start: span.start + from + equal + 1, end: span.start + to, text: `${leading}${value}${trailing}` };
  }
  return { start: span.end, end: span.end, text: `${body.trim() ? ', ' : ''}${key}=${value}` };
}

/** All offsets refer to scene.source. A stale scene is rejected, never guessed. */
export function patchGeometryElements(
  source: string, scene: CoordinateScene, indices: number[], edit: GeometryEdit
): string {
  if (source !== scene.source) throw new Error('图形源码已变化，请重新选择元素。');
  const patches: Patch[] = [];
  for (const index of new Set(indices)) {
    const element = scene.elements[index];
    const origin = element?.source;
    if (!origin) throw new Error('此元素来自宏展开，请编辑宏源码。');
    if (edit.remove) { patches.push({ ...origin.span, text: '' }); continue; }
    if (edit.label !== undefined && origin.labelSpan) patches.push({ ...origin.labelSpan, text: edit.label });
    for (const [key, value] of Object.entries(edit.options || {})) {
      if (origin.optionsSpan) patches.push(optionPatch(source, origin.optionsSpan, key, value));
      else {
        const command = /^\\[a-zA-Z]+/.exec(source.slice(origin.span.start));
        if (!command) throw new Error('Cannot locate TikZ command');
        const at = origin.span.start + command[0].length;
        patches.push({ start: at, end: at, text: `[${key}=${value}]` });
      }
    }
    const patchCoordinate = (coordinate: GeometryCoordinate, value: number) => {
      if (coordinate.start < 0 || coordinate.end <= coordinate.start) throw new Error('Cannot edit expanded coordinate');
      const raw = source.slice(coordinate.start, coordinate.end);
      if (Math.abs(value - coordinate.value) < 0.00000001) return;
      const leading = raw.match(/^\s*/)?.[0] || '';
      const trailing = raw.match(/\s*$/)?.[0] || '';
      patches.push({ start: coordinate.start, end: coordinate.end, text: `${leading}${number(value)}${coordinate.unit}${trailing}` });
    };
    origin.coordinates.forEach((point, pointIndex) => {
      if (edit.point && edit.point.index === pointIndex) {
        patchCoordinate(point.x, (edit.point.x - (point.x.offset || 0)) / point.x.basis);
        patchCoordinate(point.y, (edit.point.y - (point.y.offset || 0)) / point.y.basis);
      } else if (!edit.point && (edit.dx !== undefined || edit.dy !== undefined || edit.scale)) {
        const transform = (value: GeometryCoordinate, axis: 'x' | 'y') => {
          if (value.relative) return value.value * (edit.scale?.[axis] || 1);
          const pixel = value.value * value.basis + (value.offset || 0);
          const center = axis === 'x' ? edit.scale?.originX : edit.scale?.originY;
          const scaled = center === undefined ? pixel : center + (pixel - center) * edit.scale![axis];
          return (scaled + (axis === 'x' ? edit.dx || 0 : edit.dy || 0) - (value.offset || 0)) / value.basis;
        };
        patchCoordinate(point.x, transform(point.x, 'x'));
        patchCoordinate(point.y, transform(point.y, 'y'));
      }
    });
    if (edit.scale && element.kind === 'path' && element.radius) {
      if (Math.abs(edit.scale.x - edit.scale.y) > 0.000001) throw new Error('圆形仅支持等比例缩放。');
      patchCoordinate(element.radius, element.radius.value * Math.abs(edit.scale.x));
    }
  }
  // Append simultaneous inserted options in one bracket, preserving last-value semantics.
  const merged = new Map<string, Patch>();
  for (const patch of patches) {
    const key = `${patch.start}:${patch.end}`;
    const previous = merged.get(key);
    if (previous && patch.start === patch.end) {
      previous.text = previous.text.endsWith(']') && patch.text.startsWith('[')
        ? `${previous.text.slice(0, -1)}, ${patch.text.slice(1)}` : previous.text + patch.text;
    } else merged.set(key, { ...patch });
  }
  const sorted = [...merged.values()].sort((a, b) => a.start - b.start);
  let cursor = 0, result = '';
  for (const patch of sorted) {
    if (patch.start < cursor) throw new Error('Overlapping vector source edits');
    result += source.slice(cursor, patch.start) + patch.text;
    cursor = patch.end;
  }
  return result + source.slice(cursor);
}

export function geometrySourceLineRange(source: string, span: GeometrySpan) {
  return {
    startLine: source.slice(0, span.start).split('\n').length,
    endLine: source.slice(0, span.end).split('\n').length,
  };
}

/** Shared surgical geometry edits for elements in the original canvas AST. */
export function patchElementGeometry(source: string, geometry: CoordinatePath | CoordinateLabel, edit: GeometryEdit): string {
  if (geometry.kind === 'label' && geometry.source &&
      (!geometry.source.coordinates.length || geometry.source.coordinates.some((point) => point.x.start < 0 || point.y.start < 0)) &&
      (edit.dx !== undefined || edit.dy !== undefined)) {
    const length = (value: string | undefined) => {
      const match = /^\s*([-+\d.]+)\s*(cm|mm|pt|in)?\s*$/.exec(value || '0cm');
      return match ? Number(match[1]) * ({ cm: 52, mm: 5.2, pt: 52 / 28.45274, in: 52 * 2.54 }[match[2] || 'cm']!) : 0;
    };
    edit = { options: {
      xshift: `${number((length(geometry.source.rawOptions.xshift) + (edit.dx || 0) / (geometry.source.transform?.xScale || 1)) / 52)}cm`,
      yshift: `${number((length(geometry.source.rawOptions.yshift) - (edit.dy || 0) / (geometry.source.transform?.yScale || 1)) / 52)}cm`,
    } };
  }
  return patchGeometryElements(source, {
    source, elements: [geometry], clips: [], viewBox: [0, 0, 1, 1],
    fontFamily: '', coordinateScale: [52, -52],
  }, [0], edit);
}

/** A macro invocation moves/scales as one original-canvas element, retaining its definition. */
export function patchMacroGeometry(source: string, node: TikzNodeElement, edit: GeometryEdit): string {
  const macro = node.macroSource;
  if (!macro) return source;
  const parent = macro.editScope?.parent || macro.parent || { xScale: 1, yScale: 1, shiftX: 0, shiftY: 0 };
  const local = macro.editScope?.transform || { xScale: 1, yScale: 1, shiftX: 0, shiftY: 0 };
  const x = edit.scale?.x || 1, y = edit.scale?.y || 1;
  const cx = edit.scale?.originX || 0, cy = edit.scale?.originY || 0;
  const shiftX = x * local.shiftX + (1 - x) * (cx - parent.shiftX) / parent.xScale + (edit.dx || 0) / parent.xScale;
  const shiftY = y * local.shiftY + (1 - y) * (cy - parent.shiftY) / parent.yScale + (edit.dy || 0) / parent.yScale;
  const options = {
    shift: `{(${number(shiftX / 52)}cm,${number(-shiftY / 52)}cm)}`,
    xscale: number(local.xScale * x), yscale: number(local.yScale * y),
  };
  if (macro.editScope?.optionsSpan) {
    const patches = Object.entries(options).map(([key, value]) => optionPatch(source, macro.editScope!.optionsSpan!, key, value))
      .sort((a, b) => b.start - a.start);
    let next = source;
    for (const patch of patches) next = next.slice(0, patch.start) + patch.text + next.slice(patch.end);
    return next;
  }
  const invocation = source.slice(macro.span.start, macro.span.end);
  const wrapper = `% @agentikz-edit-group\n\\begin{scope}[local bounding box=${node.id},shift=${options.shift},xscale=${options.xscale},yscale=${options.yscale}]\n${invocation}\n\\end{scope}`;
  return source.slice(0, macro.span.start) + wrapper + source.slice(macro.span.end);
}
