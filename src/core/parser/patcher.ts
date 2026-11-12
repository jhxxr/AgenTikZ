import {
  EdgeRouteType,
  PgfChartType,
  TikzChartElement,
  TikzEdgeElement,
  TikzNodeElement,
  TikzPathElement,
} from '../../types/tikz-ast';
import { formatTikzOptions } from './parser';
import { useSettingsStore } from '../../store/useSettingsStore';
import { patchElementGeometry, patchMacroGeometry } from './path-patcher';

export function formatCoordNum(val: number): string {
  const precision = useSettingsStore.getState().coordPrecision;
  if (precision === 1) {
    const rounded = Math.round(val * 10) / 10;
    return rounded.toFixed(1);
  }
  const rounded = Math.round(val * 20) / 20; // Snap to 0.05cm precision
  if (Number.isInteger(rounded)) return `${rounded}.0`;
  return Number(rounded.toFixed(2)).toString();
}

/**
 * Surgically updates coordinates of one or more nodes/charts in the TikZ source
 * without touching any comments, formatting, or unrelated options.
 */
export function patchElementsCoordinates(
  source: string,
  updates: Array<{
    element: TikzNodeElement | TikzChartElement | TikzPathElement;
    x: number;
    y: number;
  }>
): string {
  const replacements = updates.flatMap(({ element, x, y }) => {
    if (element.kind === 'node' && element.macroSource) {
      const next = patchMacroGeometry(source, element, { dx: (x - element.x) * 52, dy: -(y - element.y) * 52 });
      return [{ start: element.span.start, end: element.span.end,
        text: next.slice(element.span.start, next.length - (source.length - element.span.end)) }];
    }
    const geometry = element.kind === 'path' ? element.geometry : element.kind === 'node' ? element.coordinateGeometry : undefined;
    if (geometry?.source) {
      const span = geometry.source.span;
      const next = patchElementGeometry(source, geometry, { dx: (x - element.x) * 52, dy: -(y - element.y) * 52 });
      return [{ start: span.start, end: span.end, text: next.slice(span.start, next.length - (source.length - span.end)) }];
    }
    if (element.kind === 'path' || !element.coordSpan) return [];
    return [{ start: element.coordSpan.start, end: element.coordSpan.end, text: `${formatCoordNum(x)}, ${formatCoordNum(y)}` }];
  }).sort((a, b) => a.start - b.start);

  const parts: string[] = [];
  let cursor = 0;
  for (const patch of replacements) {
    if (patch.start < cursor) continue;
    parts.push(source.slice(cursor, patch.start), patch.text);
    cursor = patch.end;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

/**
 * Surgically updates the `{label}` content of a TikZ node.
 */
export function patchNodeLabel(
  source: string,
  node: TikzNodeElement,
  newLabel: string,
  newSublabel?: string
): string {
  if (!node.labelSpan) return source;

  if (node.subtype === 'image') {
    const oldBody = source.slice(node.labelSpan.start, node.labelSpan.end);
    const igMatch = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/.exec(oldBody);
    const igCmd = igMatch
      ? igMatch[0]
      : `\\includegraphics[width=${formatCoordNum(node.width)}cm, height=${formatCoordNum(node.height)}cm]{${node.imagePath || ''}}`;
    const defaultFileName =
      (node.imagePath || '').split('/').pop() || node.imagePath || '';
    const trimmedLabel = newLabel.trim();
    const trimmedSub = (newSublabel ?? '').trim();

    const parts: string[] = [igCmd];
    if (trimmedLabel && trimmedLabel !== defaultFileName) {
      parts.push(trimmedLabel);
    }
    if (trimmedSub) {
      parts.push(`{\\scriptsize ${trimmedSub}}`);
    }
    const combinedImageBody = parts.join(' \\\\ ');
    return (
      source.slice(0, node.labelSpan.start) +
      combinedImageBody +
      source.slice(node.labelSpan.end)
    );
  }

  const combined =
    newSublabel && newSublabel.trim()
      ? `${newLabel.trim()} \\\\ {\\scriptsize ${newSublabel.trim()}}`
      : newLabel;
  return (
    source.slice(0, node.labelSpan.start) +
    combined +
    source.slice(node.labelSpan.end)
  );
}

/**
 * Surgically updates `[options]` inside a `\node[...]` statement while preserving
 * existing style classes and custom keys.
 */
export function patchNodeOptions(
  source: string,
  node: TikzNodeElement,
  optionPatches: Record<string, string | undefined>
): string {
  if (node.macroSource) {
    const width = optionPatches['minimum width'], height = optionPatches['minimum height'];
    if (width || height) {
      const extent = (axis: 0 | 1, scale: number): [number, number] => {
        const center = axis === 0 ? node.x * 52 : -node.y * 52;
        const bounds = (node.geometryGroup || []).map((geometry) => {
          const min = geometry.bounds[axis], size = geometry.bounds[axis + 2];
          if (geometry.kind === 'label') {
            const anchor = axis === 0 ? geometry.x : geometry.y;
            const at = center + (anchor - center) * scale;
            return [at + min - anchor, at + min - anchor + size];
          }
          return [center + (min - center) * scale, center + (min + size - center) * scale];
        });
        return [Math.min(...bounds.map((item) => item[0])), Math.max(...bounds.map((item) => item[1]))];
      };
      const fit = (axis: 0 | 1, desired?: string) => {
        if (!desired) return 1;
        const target = parseFloat(desired) * 52;
        let low = 0.001, high = 1;
        while (extent(axis, high)[1] - extent(axis, high)[0] < target && high < 1024) high *= 2;
        for (let i = 0; i < 40; i++) {
          const middle = (low + high) / 2, bounds = extent(axis, middle);
          if (bounds[1] - bounds[0] < target) low = middle; else high = middle;
        }
        return (low + high) / 2;
      };
      const x = fit(0, width), y = fit(1, height);
      const xb = extent(0, x), yb = extent(1, y);
      return patchMacroGeometry(source, node, {
        scale: { x, y, originX: node.x * 52, originY: -node.y * 52 },
        dx: node.x * 52 - (xb[0] + xb[1]) / 2, dy: -node.y * 52 - (yb[0] + yb[1]) / 2,
      });
    }
    return source;
  }
  if (node.subtype !== 'image' && node.coordinateGeometry?.source && Object.values(optionPatches).every((value) => value !== undefined && value !== '')) {
    return patchElementGeometry(source, node.coordinateGeometry, {
      options: Object.fromEntries(Object.entries(optionPatches).map(([key, value]) => [key, value!])),
    });
  }
  const updatedOpts: Record<string, string> = { ...node.rawOptions };
  for (const [k, v] of Object.entries(optionPatches)) {
    if (v === undefined || v === '') {
      delete updatedOpts[k];
    } else {
      updatedOpts[k] = v;
    }
  }
  const formatted = formatTikzOptions(updatedOpts).trim();

  let nextSource = source;
  // If this is an image node and width/height changed, also sync \includegraphics[width=..., height=...] inside {label}
  if (
    node.subtype === 'image' &&
    node.labelSpan &&
    (optionPatches['minimum width'] !== undefined ||
      optionPatches['minimum height'] !== undefined)
  ) {
    const nextW = optionPatches['minimum width'] || `${formatCoordNum(node.width)}cm`;
    const nextH = optionPatches['minimum height'] || `${formatCoordNum(node.height)}cm`;
    const oldBody = nextSource.slice(node.labelSpan.start, node.labelSpan.end);
    const updatedBody = oldBody.replace(
      /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/,
      `\\includegraphics[width=${nextW}, height=${nextH}]{$1}`
    );
    nextSource =
      nextSource.slice(0, node.labelSpan.start) +
      updatedBody +
      nextSource.slice(node.labelSpan.end);
  }

  if (node.optionsSpan) {
    return (
      nextSource.slice(0, node.optionsSpan.start) +
      formatted +
      nextSource.slice(node.optionsSpan.end)
    );
  }

  // If the node didn't have `[...]` brackets yet, insert right after `\node`
  const rawStmt = nextSource.slice(node.span.start, node.span.end);
  const replacedStmt = rawStmt.replace(/^(\s*\\node)\b/, `$1[${formatted}]`);
  return (
    nextSource.slice(0, node.span.start) +
    replacedStmt +
    nextSource.slice(node.span.end)
  );
}

/**
 * Updates the relative file path inside an image node's `\includegraphics[...]{path}`.
 */
export function patchImageNodePath(
  source: string,
  node: TikzNodeElement,
  newImagePath: string
): string {
  if (!node.labelSpan) return source;
  const wStr = `${formatCoordNum(node.width)}cm`;
  const hStr = `${formatCoordNum(node.height)}cm`;
  const cleanPath = newImagePath.replace(/\\/g, '/').trim();
  const newIgCmd = `\\includegraphics[width=${wStr}, height=${hStr}]{${cleanPath}}`;
  const oldBody = source.slice(node.labelSpan.start, node.labelSpan.end);
  const igRegex = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/;
  const newBody = igRegex.test(oldBody)
    ? oldBody.replace(igRegex, newIgCmd)
    : newIgCmd;
  return (
    source.slice(0, node.labelSpan.start) +
    newBody +
    source.slice(node.labelSpan.end)
  );
}

/**
 * Updates an edge's options or routing style (`--`, `|-`, `-|`, residual skip, curved).
 */
export function patchEdgeElement(
  source: string,
  edge: TikzEdgeElement,
  updates: {
    routeType?: EdgeRouteType;
    residualOffset?: number;
    bendAngle?: number;
    label?: string;
    labelOffset?: { x: number; y: number };
    stroke?: string;
    lineWidth?: string;
    dashed?: boolean;
    dotted?: boolean;
    lineStyle?: 'solid' | 'dashed' | 'dotted' | 'densely_dashed' | 'densely_dotted';
  }
): string {
  if (edge.geometry?.source && Object.keys(updates).every((key) => ['stroke', 'lineWidth'].includes(key))) {
    return patchElementGeometry(source, edge.geometry, { options: {
      ...(updates.stroke !== undefined ? { draw: updates.stroke } : {}),
      ...(updates.lineWidth !== undefined ? { 'line width': updates.lineWidth } : {}),
    } });
  }
  const nextRoute = updates.routeType ?? edge.routeType;
  const nextOffset = updates.residualOffset ?? edge.residualOffset ?? 1.4;
  const nextBend = updates.bendAngle ?? edge.bendAngle ?? 28;
  const nextLabel = updates.label !== undefined ? updates.label : edge.label;
  const nextLabelOffset =
    updates.labelOffset !== undefined ? updates.labelOffset : edge.labelOffset;

  const opts: Record<string, string> = { ...edge.rawOptions };
  if (updates.stroke !== undefined) opts['draw'] = updates.stroke;
  if (updates.lineWidth !== undefined) opts['line width'] = updates.lineWidth;
  if (updates.lineStyle !== undefined) {
    delete opts['dashed'];
    delete opts['densely dashed'];
    delete opts['dotted'];
    delete opts['densely dotted'];
    if (updates.lineStyle === 'dashed') opts['dashed'] = 'true';
    else if (updates.lineStyle === 'densely_dashed') opts['densely dashed'] = 'true';
    else if (updates.lineStyle === 'dotted') opts['dotted'] = 'true';
    else if (updates.lineStyle === 'densely_dotted') opts['densely dotted'] = 'true';
  } else {
    if (updates.dashed !== undefined) {
      if (updates.dashed) {
        opts['dashed'] = 'true';
        delete opts['dotted'];
        delete opts['densely dotted'];
      } else {
        delete opts['dashed'];
        delete opts['densely dashed'];
      }
    }
    if (updates.dotted !== undefined) {
      if (updates.dotted) {
        opts['dotted'] = 'true';
        delete opts['dashed'];
        delete opts['densely dashed'];
      } else {
        delete opts['dotted'];
        delete opts['densely dotted'];
      }
    }
  }
  if (Object.keys(opts).length === 0) {
    opts['-Stealth'] = 'true';
    opts['line width'] = '0.7pt';
  }


  const optStr = formatTikzOptions(opts);
  const fromRef = edge.fromAnchor ? `${edge.from}.${edge.fromAnchor}` : edge.from;
  const toRef = edge.toAnchor ? `${edge.to}.${edge.toAnchor}` : edge.to;
  const shiftTokens: string[] = [];
  if (nextLabelOffset) {
    if (Math.abs(nextLabelOffset.x) >= 0.005) {
      shiftTokens.push(`xshift=${formatCoordNum(nextLabelOffset.x)}cm`);
    }
    if (Math.abs(nextLabelOffset.y) >= 0.005) {
      shiftTokens.push(`yshift=${formatCoordNum(nextLabelOffset.y)}cm`);
    }
  }
  const shiftPrefix = shiftTokens.length > 0 ? `, ${shiftTokens.join(', ')}` : '';
  const labelSegment =
    nextLabel && nextLabel.trim()
      ? ` node[midway${shiftPrefix}, fill=white, inner sep=1.5pt, font=\\scriptsize] {${nextLabel.trim()}} `
      : ' ';

  let newStmt = '';
  if (nextRoute === 'residual_right' || nextRoute === 'residual_left') {
    const signedDx =
      nextRoute === 'residual_right'
        ? formatCoordNum(Math.abs(nextOffset))
        : formatCoordNum(-Math.abs(nextOffset));
    const fAnchor = edge.fromAnchor || (nextRoute === 'residual_right' ? 'east' : 'west');
    const tAnchor = edge.toAnchor || (nextRoute === 'residual_right' ? 'east' : 'west');
    newStmt = `\\draw[${optStr}] (${edge.from}.${fAnchor}) -- ++(${signedDx}${edge.coordinateScaleX !== undefined ? 'cm' : ''}, 0) |-${labelSegment}(${edge.to}.${tAnchor});`;
  } else if (nextRoute === 'curved') {
    const dir = nextBend >= 0 ? 'bend left' : 'bend right';
    newStmt = `\\draw[${optStr}] (${fromRef}) to[${dir}=${Math.abs(nextBend)}]${labelSegment}(${toRef});`;
  } else {
    const conn = nextRoute === 'vh' ? '|-' : nextRoute === 'hv' ? '-|' : '--';
    newStmt = `\\draw[${optStr}] (${fromRef}) ${conn}${labelSegment}(${toRef});`;
  }

  // Preserve original indentation instead of hardcoding 2 spaces
  const originalIndent = source.slice(
    source.lastIndexOf('\n', edge.span.start - 1) + 1,
    edge.span.start
  ).match(/^[ \t]*/)?.[0] ?? '  ';

  let replaceStart = edge.span.start;
  while (
    replaceStart > 0 &&
    (source[replaceStart - 1] === ' ' || source[replaceStart - 1] === '\t')
  ) {
    replaceStart--;
  }

  return (
    source.slice(0, replaceStart) + `${originalIndent}${newStmt}` + source.slice(edge.span.end)
  );
}

/**
 * Surgically updates the legend's relative `at={(lx, ly)}` coordinate inside a PGFPlots axis
 * without disturbing comments or surrounding code.
 */
export function patchChartLegendPosition(
  source: string,
  chart: TikzChartElement,
  legendPos: { x: number; y: number }
): string {
  const lxStr = Number(legendPos.x.toFixed(2)).toString();
  const lyStr = Number(legendPos.y.toFixed(2)).toString();

  if (chart.legendCoordSpan) {
    return (
      source.slice(0, chart.legendCoordSpan.start) +
      `${lxStr}, ${lyStr}` +
      source.slice(chart.legendCoordSpan.end)
    );
  }

  return patchChartElement(source, chart, { legendPos });
}

/**
 * Updates a PGFPlots chart block (title, labels, subcaption, chartType, coordinates, legendPos, series, boxplots, heatmapMatrix).
 * Always normalizes leading horizontal whitespace on the starting line so repeated drag frames
 * never accumulate inline spaces.
 */
export function patchChartElement(
  source: string,
  chart: TikzChartElement,
  updates: Partial<
    Pick<
      TikzChartElement,
      | 'x'
      | 'y'
      | 'title'
      | 'xlabel'
      | 'ylabel'
      | 'subcaption'
      | 'uncertaintyNote'
      | 'directEndLabels'
      | 'chartType'
      | 'width'
      | 'height'
      | 'showGrid'
      | 'showLegend'
      | 'legendPos'
      | 'legendScale'
      | 'titleOffset'
      | 'xlabelOffset'
      | 'ylabelOffset'
      | 'series'
      | 'heatmapMatrix'
      | 'boxplots'
    >
  >
): string {
  const nextChart: TikzChartElement = {
    ...chart,
    ...updates,
  };
  const generatedBlock = generatePgfChartTikz(nextChart);

  // Rewind across any existing spaces/tabs on the `\begin{scope}` line so indentation
  // remains strictly 2 spaces (`  \begin{scope}`) across unlimited drag frames.
  let replaceStart = chart.span.start;
  while (
    replaceStart > 0 &&
    (source[replaceStart - 1] === ' ' || source[replaceStart - 1] === '\t')
  ) {
    replaceStart--;
  }

  return (
    source.slice(0, replaceStart) +
    generatedBlock +
    source.slice(chart.span.end)
  );
}

export function generatePgfChartTikz(chart: TikzChartElement): string {
  const xStr = formatCoordNum(chart.x);
  const yStr = formatCoordNum(chart.y);
  const wStr = `${formatCoordNum(chart.width)}cm`;
  const hStr = `${formatCoordNum(chart.height)}cm`;
  const lxStr = Number((chart.legendPos?.x ?? 0.04).toFixed(2)).toString();
  const lyStr = Number((chart.legendPos?.y ?? 0.94).toFixed(2)).toString();

  const axisExtra =
    chart.chartType === 'bar'
      ? 'ybar, bar width=7pt, '
      : chart.chartType === 'heatmap'
        ? 'chart_type=heatmap, colormap/viridis, '
        : chart.chartType === 'boxplot'
          ? 'chart_type=boxplot, boxplot/draw direction=y, '
          : 'chart_type=line, ';

  const optionalMetaLines: string[] = [];
  if (chart.subcaption && chart.subcaption.trim()) {
    optionalMetaLines.push(`      subcaption={${chart.subcaption.trim()}},`);
  }
  if (chart.uncertaintyNote && chart.uncertaintyNote.trim()) {
    optionalMetaLines.push(`      uncertainty_note={${chart.uncertaintyNote.trim()}},`);
  }
  if (chart.directEndLabels) {
    optionalMetaLines.push(`      direct_labels=true,`);
  }
  if (!chart.showLegend) {
    optionalMetaLines.push(`      legend=none,`);
  }
  if (chart.titleOffset && (chart.titleOffset.x !== 0 || chart.titleOffset.y !== 0)) {
    optionalMetaLines.push(
      `      title_offset={${Math.round(chart.titleOffset.x)}, ${Math.round(chart.titleOffset.y)}},`
    );
  }
  if (chart.xlabelOffset && (chart.xlabelOffset.x !== 0 || chart.xlabelOffset.y !== 0)) {
    optionalMetaLines.push(
      `      xlabel_offset={${Math.round(chart.xlabelOffset.x)}, ${Math.round(chart.xlabelOffset.y)}},`
    );
  }
  if (chart.ylabelOffset && (chart.ylabelOffset.x !== 0 || chart.ylabelOffset.y !== 0)) {
    optionalMetaLines.push(
      `      ylabel_offset={${Math.round(chart.ylabelOffset.x)}, ${Math.round(chart.ylabelOffset.y)}},`
    );
  }
  const hasCustomLegendScale =
    chart.legendScale !== undefined && Math.abs(chart.legendScale - 1) > 0.01;
  const legendScaleStr = hasCustomLegendScale
    ? Number(chart.legendScale!.toFixed(2)).toString()
    : '1';
  if (hasCustomLegendScale) {
    optionalMetaLines.push(`      legend_scale=${legendScaleStr},`);
  }
  const legendScaleNodeOpt = hasCustomLegendScale
    ? `, nodes={scale=${legendScaleStr}, transform shape}`
    : '';

  const lines: string[] = [
    `  \\begin{scope}[shift={(${xStr}, ${yStr})}]`,
    `    \\begin{axis}[`,
    `      id=${chart.id},`,
    `      ${axisExtra}width=${wStr}, height=${hStr},`,
    `      title={${chart.title}},`,
    `      xlabel={${chart.xlabel}},`,
    `      ylabel={${chart.ylabel}},`,
    ...optionalMetaLines,
    `      grid=${chart.showGrid ? 'major' : 'none'},`,
    `      grid style={dashed, gray!25},`,
    `      tick label style={font=\\scriptsize},`,
    `      label style={font=\\footnotesize},`,
    `      title style={font=\\footnotesize\\bfseries},`,
    `      legend style={at={(${lxStr}, ${lyStr})}, anchor=north west, font=\\scriptsize, draw=gray!40, fill=white, fill opacity=0.9${legendScaleNodeOpt}}`,
    `    ]`,
  ];

  if (chart.chartType === 'boxplot' && chart.boxplots && chart.boxplots.length > 0) {
    for (const bp of chart.boxplots) {
      lines.push(
        `      \\addplot+[boxplot prepared={label=${bp.label}, median=${bp.median}, upper quartile=${bp.upperQuartile}, lower quartile=${bp.lowerQuartile}, upper whisker=${bp.upperWhisker}, lower whisker=${bp.lowerWhisker}}] coordinates {};`
      );
    }
  } else {
    for (const s of chart.series) {
      const coords = s.points
        .map((pt) =>
          pt.error !== undefined
            ? `(${pt.x}, ${pt.y}) +- (0, ${pt.error})`
            : `(${pt.x}, ${pt.y})`
        )
        .join(' ');
      const dashOpt = s.dashed ? ', dashed' : '';
      const markOpt = s.mark ? `, mark=${s.mark}` : '';
      lines.push(
        `      \\addplot[color=${s.color}, line width=0.85pt${markOpt}${dashOpt}] coordinates { ${coords} };`,
        `      \\addlegendentry{${s.name}}`
      );
    }
  }

  if (chart.chartType === 'heatmap' && chart.heatmapMatrix) {
    lines.push(`      % heatmap_matrix: ${JSON.stringify(chart.heatmapMatrix)}`);
  }

  lines.push(`    \\end{axis}`, `  \\end{scope}`);
  return lines.join('\n');
}

/**
 * Deletes selected elements by their spans in descending order.
 */
export function deleteElementsFromSource(
  source: string,
  spans: Array<{ start: number; end: number }>
): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let next = source;
  for (const sp of sorted) {
    let removeStart = sp.start;
    // Also clean up leading indentation and trailing newline if on its own line
    while (removeStart > 0 && (next[removeStart - 1] === ' ' || next[removeStart - 1] === '\t')) {
      removeStart--;
    }
    let removeEnd = sp.end;
    if (next[removeEnd] === '\r') removeEnd++;
    if (next[removeEnd] === '\n') removeEnd++;
    next = next.slice(0, removeStart) + next.slice(removeEnd);
  }
  return next;
}

/**
 * Inserts a new TikZ statement cleanly right before `\end{tikzpicture}`.
 */
export function insertTikzStatement(source: string, statement: string): string {
  const endTag = '\\end{tikzpicture}';
  const idx = source.lastIndexOf(endTag);
  const formattedStmt = `  ${statement.trimStart()}`;
  if (idx === -1) {
    return `${source.trimEnd()}\n${formattedStmt}\n`;
  }
  return `${source.slice(0, idx)}${formattedStmt}\n${source.slice(idx)}`;
}

/**
 * Updates or inserts the overall Figure Caption (`% \caption{...}`) and `\label{...}`
 * without disturbing any TikZ elements.
 */
export function patchFigureCaptionAndLabel(
  source: string,
  newCaption: string,
  newLabel?: string
): string {
  let next = source;
  const capRegex = /((?:%\s*)?\\caption\{)([\s\S]*?)(\})/;
  if (capRegex.test(next)) {
    next = next.replace(capRegex, `$1${newCaption}$3`);
  } else {
    next = `${next.trimEnd()}\n% \\caption{${newCaption}}\n`;
  }

  if (newLabel !== undefined) {
    const lblRegex = /((?:%\s*)?\\label\{)([^}]*)(\})/;
    if (lblRegex.test(next)) {
      next = next.replace(lblRegex, `$1${newLabel}$3`);
    } else {
      next = `${next.trimEnd()}\n% \\label{${newLabel}}\n`;
    }
  }
  return next;
}

/**
 * Duplicates one or more nodes/charts with a clean offset (+0.4, -0.4) and new ID.
 */
export function duplicateElementsInSource(
  source: string,
  elements: Array<TikzNodeElement | TikzChartElement | TikzPathElement>,
  suffixSeed: number
): { nextSource: string; newIds: string[] } {
  let nextSource = source;
  const newIds: string[] = [];

  elements.forEach((el, idx) => {
    const rawSnippet = source.slice(el.span.start, el.span.end);
    const newId = `${el.id}_copy${suffixSeed + idx}`;
    newIds.push(newId);

    const nx = formatCoordNum(el.x + 0.45);
    const ny = formatCoordNum(el.y - 0.45);

    const geometry = el.kind === 'path' ? el.geometry : el.kind === 'node' ? el.coordinateGeometry : undefined;
    if (el.kind === 'node' && el.macroSource) {
      const updated = patchMacroGeometry(source, el, { dx: 0.45 * 52, dy: 0.45 * 52 });
      const cloned = updated.slice(el.span.start, updated.length - (source.length - el.span.end))
        .replace(new RegExp(`local bounding box\\s*=\\s*${el.id}(?=[,\\]])`), `local bounding box=${newId}`);
      nextSource = insertTikzStatement(nextSource, cloned);
    } else if (geometry?.source) {
      const updated = patchElementGeometry(source, geometry, { dx: 0.45 * 52, dy: 0.45 * 52 });
      const span = geometry.source.span;
      let cloned = updated.slice(span.start, updated.length - (source.length - span.end));
      if (el.kind === 'node' && el.namedInSource) cloned = cloned.replace(new RegExp(`\\(\\s*${el.id}\\s*\\)`), `(${newId})`);
      nextSource = insertTikzStatement(nextSource, cloned);
    } else if (el.kind === 'node') {
      let cloned = rawSnippet
        .replace(new RegExp(`\\(\\s*${el.id}\\s*\\)`), `(${newId})`)
        .replace(
          /at\s*\(\s*[-+]?[0-9]*\.?[0-9]+(?:cm)?\s*,\s*[-+]?[0-9]*\.?[0-9]+(?:cm)?\s*\)/,
          `at (${nx}, ${ny})`
        );
      nextSource = insertTikzStatement(nextSource, cloned);
    } else if (el.kind === 'chart') {
      const cloned = generatePgfChartTikz({
        ...el,
        id: newId,
        x: Number(nx),
        y: Number(ny),
      });
      nextSource = insertTikzStatement(nextSource, cloned);
    }
  });

  return { nextSource, newIds };
}
