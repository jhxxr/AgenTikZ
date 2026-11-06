import {
  BoxplotStat,
  ChartDataPoint,
  ChartSeries,
  EdgeRouteType,
  NodeSubtype,
  ParsedTikzDocument,
  PgfChartType,
  SceneElement,
  SourceSpan,
  TikzChartElement,
  TikzEdgeElement,
  TikzNodeElement,
} from '../../types/tikz-ast';

function offsetToLine(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function makeSpan(source: string, start: number, end: number): SourceSpan {
  return {
    start,
    end,
    startLine: offsetToLine(source, start),
    endLine: offsetToLine(source, Math.max(start, end - 1)),
  };
}

/**
 * Splits a TikZ `[key=val, flag, foo={a,b}]` option list at top-level commas.
 */
export function parseTikzOptionString(optStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  let depth = 0;
  let current = '';

  const commit = (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      result[trimmed] = 'true';
    } else {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if (v.startsWith('{') && v.endsWith('}')) {
        v = v.slice(1, -1).trim();
      }
      result[k] = v;
    }
  };

  for (let i = 0; i < optStr.length; i++) {
    const ch = optStr[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      commit(current);
      current = '';
    } else {
      current += ch;
    }
  }
  commit(current);
  return result;
}

export function formatTikzOptions(options: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(options)) {
    if (v === undefined || v === '') continue;
    if (v === 'true') {
      parts.push(k);
    } else if (
      k === 'channels' ||
      k === 'sublabel' ||
      v.includes(',') ||
      v.includes('\\')
    ) {
      parts.push(`${k}={${v}}`);
    } else if (v.includes(' ')) {
      if (
        k === 'minimum width' ||
        k === 'minimum height' ||
        k === 'minimum size' ||
        k === 'rounded corners' ||
        k === 'line width' ||
        k === 'inner sep' ||
        k === 'text width' ||
        k === 'align'
      ) {
        parts.push(`${k}=${v}`);
      } else {
        parts.push(`${k}={${v}}`);
      }
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join(', ');
}

function parseCmValue(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const num = parseFloat(val.replace(/cm|pt|mm/g, '').trim());
  if (isNaN(num)) return fallback;
  if (val.includes('mm')) return num / 10;
  if (val.includes('pt')) return num / 28.45;
  return num;
}

function parsePreambleStyles(source: string): Record<string, Record<string, string>> {
  const styles: Record<string, Record<string, string>> = {
    dl_block: {
      draw: 'nips_blue!85!black',
      fill: 'nips_blue!14',
      'rounded corners': '2.5pt',
      'line width': '0.7pt',
      'minimum width': '2.8cm',
      'minimum height': '0.85cm',
    },
    mha_block: {
      draw: 'nips_amber!85!black',
      fill: 'nips_amber!16',
      'rounded corners': '2.5pt',
      'line width': '0.75pt',
      'minimum width': '3.0cm',
      'minimum height': '0.95cm',
    },
    addnorm_block: {
      draw: 'nips_sage!85!black',
      fill: 'nips_sage!15',
      'rounded corners': '2.0pt',
      'line width': '0.65pt',
      'minimum width': '2.8cm',
      'minimum height': '0.65cm',
    },
    conv_block: {
      draw: 'cvpr_teal!85!black',
      fill: 'cvpr_teal!14',
      'rounded corners': '2.0pt',
      'line width': '0.7pt',
      'minimum width': '2.6cm',
      'minimum height': '0.85cm',
    },
    feature_cube: {
      draw: 'cvpr_navy!85!black',
      fill: 'cvpr_navy!14',
      'line width': '0.7pt',
      'minimum width': '1.2cm',
      'minimum height': '2.2cm',
    },
    op_circle: {
      circle: 'true',
      draw: 'nips_slate!85!black',
      fill: 'white',
      'line width': '0.7pt',
      'minimum size': '0.65cm',
    },
    stage_box: {
      draw: 'nips_slate!60',
      fill: 'nips_slate!6',
      dashed: 'true',
      'rounded corners': '4pt',
      'line width': '0.65pt',
    },
    subcaption: {
      subtype: 'caption',
      draw: 'none',
      fill: 'none',
      'minimum width': '4.6cm',
      'minimum height': '0.55cm',
    },
  };

  const tikzsetRegex = /\\tikzset\s*\{([\s\S]*?)\n\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = tikzsetRegex.exec(source)) !== null) {
    const body = match[1];
    const styleDefRegex = /([a-zA-Z0-9_-]+)\s*\/\.style\s*=\s*\{([\s\S]*?)\}/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = styleDefRegex.exec(body)) !== null) {
      const styleName = sMatch[1].trim();
      const styleBody = sMatch[2].trim();
      styles[styleName] = {
        ...(styles[styleName] || {}),
        ...parseTikzOptionString(styleBody),
      };
    }
  }
  return styles;
}

function inferNodeSubtype(
  styleClass: string | undefined,
  mergedOpts: Record<string, string>,
  label: string
): NodeSubtype {
  if (mergedOpts['subtype']) {
    return mergedOpts['subtype'] as NodeSubtype;
  }
  if (
    styleClass === 'feature_cube' ||
    mergedOpts['cuboid'] === 'true' ||
    mergedOpts['depth'] !== undefined
  ) {
    return 'cuboid';
  }
  if (
    styleClass === 'op_circle' ||
    mergedOpts['circle'] === 'true' ||
    label.includes('\\oplus') ||
    label.includes('\\otimes')
  ) {
    return 'op_circle';
  }
  if (
    styleClass === 'stage_box' ||
    (mergedOpts['dashed'] === 'true' && mergedOpts['minimum height'] && parseCmValue(mergedOpts['minimum height'], 1) >= 2.2)
  ) {
    return 'container';
  }
  if (styleClass === 'mha_block' || /Multi-Head|Attention|MHA/i.test(label)) {
    return 'mha';
  }
  if (styleClass === 'addnorm_block' || /Add\s*&\s*Norm|LayerNorm|RMSNorm/i.test(label)) {
    return 'addnorm';
  }
  if (styleClass === 'conv_block' || /Conv|Pool|Downsample|Upsample/i.test(label)) {
    return 'conv';
  }
  if (
    styleClass === 'subcaption' ||
    mergedOpts['subtype'] === 'caption' ||
    /^\s*(\\(textbf|bf)\s*\{\s*\([a-z0-9]+\)\s*\}|\([a-z0-9]+\)|Fig\.|Figure\s+\d)/i.test(
      label
    )
  ) {
    return 'caption';
  }
  if (mergedOpts['draw'] === 'none' && (!mergedOpts['fill'] || mergedOpts['fill'] === 'none')) {
    return 'math';
  }
  return 'block';
}

function parseSingleNodeStatement(
  source: string,
  stmtStart: number,
  stmtEnd: number,
  preambleStyles: Record<string, Record<string, string>>,
  autoIdx: number
): TikzNodeElement | null {
  const rawStmt = source.slice(stmtStart, stmtEnd);
  if (!rawStmt.trimStart().startsWith('\\node')) return null;

  // Locate [options] if present before `at` or `(` or `{`
  let optionsSpan: SourceSpan | undefined;
  let rawOptions: Record<string, string> = {};
  const optMatch = /\\node\s*\[([\s\S]*?)\]/.exec(rawStmt);
  if (optMatch) {
    const contentStart = stmtStart + optMatch.index + optMatch[0].indexOf('[') + 1;
    const contentEnd = stmtStart + optMatch.index + optMatch[0].lastIndexOf(']');
    optionsSpan = makeSpan(source, contentStart, contentEnd);
    rawOptions = parseTikzOptionString(optMatch[1]);
  }

  // Locate node ID `(id)` before `at` or `{`
  let id = `node_${autoIdx}`;
  let namedInSource = false;
  const withoutAt = rawStmt.replace(/at\s*\(\s*[-+0-9.a-zA-Z]+\s*,\s*[-+0-9.a-zA-Z]+\s*\)/, '   ');
  const idMatch = /\(\s*([a-zA-Z0-9_:-]+)\s*\)/.exec(withoutAt);
  if (idMatch) {
    id = idMatch[1].trim();
    namedInSource = true;
  }

  // Locate `at (x, y)` coordinate and its exact inner span
  let x = 0;
  let y = 0;
  let coordSpan: SourceSpan | undefined;
  const atMatch = /\bat\s*\(\s*([-+]?[0-9]*\.?[0-9]+)(?:cm)?\s*,\s*([-+]?[0-9]*\.?[0-9]+)(?:cm)?\s*\)/.exec(
    rawStmt
  );
  if (atMatch) {
    x = parseFloat(atMatch[1]);
    y = parseFloat(atMatch[2]);
    const openParenOffset = rawStmt.indexOf('(', atMatch.index);
    const closeParenOffset = rawStmt.indexOf(')', openParenOffset);
    coordSpan = makeSpan(
      source,
      stmtStart + openParenOffset + 1,
      stmtStart + closeParenOffset
    );
  }

  // Locate `{label}` at the end of `\node ... {label};`
  let label = '';
  let labelSpan: SourceSpan | undefined;
  const firstBraceAfterAt = (() => {
    const searchFrom = atMatch ? atMatch.index + atMatch[0].length : 0;
    const idx = rawStmt.indexOf('{', searchFrom);
    return idx !== -1 ? idx : rawStmt.lastIndexOf('{');
  })();

  if (firstBraceAfterAt !== -1) {
    let depth = 0;
    let closeBraceIdx = -1;
    for (let i = firstBraceAfterAt; i < rawStmt.length; i++) {
      if (rawStmt[i] === '{') depth++;
      else if (rawStmt[i] === '}') {
        depth--;
        if (depth === 0) {
          closeBraceIdx = i;
          break;
        }
      }
    }
    if (closeBraceIdx !== -1) {
      label = rawStmt.slice(firstBraceAfterAt + 1, closeBraceIdx).trim();
      labelSpan = makeSpan(
        source,
        stmtStart + firstBraceAfterAt + 1,
        stmtStart + closeBraceIdx
      );
    }
  }

  // Determine styleClass & merge options from preamble \tikzset
  let styleClass: string | undefined;
  let mergedOpts: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawOptions)) {
    if (v === 'true' && preambleStyles[k]) {
      styleClass = k;
      mergedOpts = { ...mergedOpts, ...preambleStyles[k] };
    }
  }
  mergedOpts = { ...mergedOpts, ...rawOptions };

  const subtype = inferNodeSubtype(styleClass, mergedOpts, label);

  const defaultW =
    subtype === 'op_circle'
      ? 0.7
      : subtype === 'cuboid'
        ? 1.3
        : subtype === 'container'
          ? 4.2
          : subtype === 'caption'
            ? 4.6
            : 2.8;
  const defaultH =
    subtype === 'op_circle'
      ? 0.7
      : subtype === 'cuboid'
        ? 2.2
        : subtype === 'addnorm'
          ? 0.65
          : subtype === 'container'
            ? 3.4
            : subtype === 'caption'
              ? 0.55
              : 0.85;

  const sizeSpec = mergedOpts['minimum size'];
  const width = parseCmValue(mergedOpts['minimum width'] || sizeSpec, defaultW);
  const height = parseCmValue(mergedOpts['minimum height'] || sizeSpec, defaultH);
  const depth = subtype === 'cuboid' ? parseCmValue(mergedOpts['depth'], 0.55) : undefined;
  const channels = mergedOpts['channels'] || (subtype === 'cuboid' ? '64×64×128' : undefined);

  // Extract optional secondary sublabel if separated by `\\`
  let mainLabel = label;
  let sublabel = mergedOpts['sublabel'];
  if (label.includes('\\\\')) {
    const parts = label.split('\\\\').map((s) => s.trim());
    mainLabel = parts[0];
    let rawSub = parts.slice(1).join(' ');
    const unwrapped = /^\{\\(?:scriptsize|footnotesize|tiny)\s+([\s\S]*)\}$/.exec(
      rawSub
    );
    if (unwrapped) {
      rawSub = unwrapped[1].trim();
    }
    sublabel = rawSub;
  }

  return {
    kind: 'node',
    id,
    namedInSource,
    subtype,
    x,
    y,
    width,
    height,
    depth,
    channels,
    label: mainLabel,
    sublabel,
    styleClass,
    fill: mergedOpts['fill'],
    stroke: mergedOpts['draw'],
    lineWidth: mergedOpts['line width'],
    roundedCorners: mergedOpts['rounded corners'],
    dashed: mergedOpts['dashed'] === 'true' || mergedOpts['densely dashed'] === 'true',
    rawOptions,
    span: makeSpan(source, stmtStart, stmtEnd),
    coordSpan,
    optionsSpan,
    labelSpan,
  };
}

function parseSingleDrawStatement(
  source: string,
  stmtStart: number,
  stmtEnd: number,
  preambleStyles: Record<string, Record<string, string>>,
  autoIdx: number
): TikzEdgeElement | null {
  const rawStmt = source.slice(stmtStart, stmtEnd);
  if (!rawStmt.trimStart().startsWith('\\draw')) return null;

  let optionsSpan: SourceSpan | undefined;
  let rawOptions: Record<string, string> = {};
  const optMatch = /\\draw\s*\[([\s\S]*?)\]/.exec(rawStmt);
  if (optMatch) {
    const contentStart = stmtStart + optMatch.index + optMatch[0].indexOf('[') + 1;
    const contentEnd = stmtStart + optMatch.index + optMatch[0].lastIndexOf(']');
    optionsSpan = makeSpan(source, contentStart, contentEnd);
    rawOptions = parseTikzOptionString(optMatch[1]);
  }

  let styleClass: string | undefined;
  let mergedOpts: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawOptions)) {
    if (v === 'true' && preambleStyles[k]) {
      styleClass = k;
      mergedOpts = { ...mergedOpts, ...preambleStyles[k] };
    }
  }
  mergedOpts = { ...mergedOpts, ...rawOptions };

  // Find endpoint references `(nodeA.anchor)` or `(nodeA)`
  const bodyAfterOpt = optMatch
    ? rawStmt.slice(optMatch.index + optMatch[0].length)
    : rawStmt.replace(/^\\draw\s*/, '');

  // Check for residual skip connection: `(a.east) -- ++(1.4, 0) |- (b.east)`
  const residualMatch =
    /\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)\s*--\s*\+\+\(\s*([-+]?[0-9.]+)(?:cm)?\s*,\s*[-+]?[0-9.]+(?:cm)?\s*\)\s*\|-\s*(?:node\s*\[[\s\S]*?\]\s*\{([\s\S]*?)\}\s*)?\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)/.exec(
      bodyAfterOpt
    );

  if (residualMatch) {
    const dx = parseFloat(residualMatch[3]);
    return {
      kind: 'edge',
      id: `edge_${autoIdx}`,
      from: residualMatch[1],
      fromAnchor: residualMatch[2],
      to: residualMatch[5],
      toAnchor: residualMatch[6],
      routeType: dx >= 0 ? 'residual_right' : 'residual_left',
      residualOffset: Math.abs(dx),
      label: residualMatch[4]?.trim(),
      arrowEnd: true,
      stroke: mergedOpts['draw'] || 'nips_slate!85!black',
      lineWidth: mergedOpts['line width'] || '0.7pt',
      dashed: mergedOpts['dashed'] === 'true' || mergedOpts['densely dashed'] === 'true',
      styleClass,
      rawOptions,
      span: makeSpan(source, stmtStart, stmtEnd),
      optionsSpan,
    };
  }

  // Standard or curved or orthogonal connection
  const stdMatch =
    /\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)\s*(--|\|-|-\||to\s*\[[^\]]*\])\s*(?:node\s*\[[^\]]*\]\s*\{([\s\S]*?)\}\s*)?\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)/.exec(
      bodyAfterOpt
    );

  if (!stdMatch) return null;

  const connector = stdMatch[3].trim();
  let routeType: EdgeRouteType = 'direct';
  let bendAngle: number | undefined;
  if (connector === '|-') routeType = 'vh';
  else if (connector === '-|') routeType = 'hv';
  else if (connector.startsWith('to')) {
    routeType = 'curved';
    const bendMatch = /bend\s+(left|right)(?:=\s*([-+]?[0-9.]+))?/.exec(connector);
    if (bendMatch) {
      const deg = bendMatch[2] ? parseFloat(bendMatch[2]) : 28;
      bendAngle = bendMatch[1] === 'right' ? -deg : deg;
    }
  }

  const hasArrowEnd =
    !mergedOpts['-'] &&
    (mergedOpts['->'] === 'true' ||
      mergedOpts['-Stealth'] === 'true' ||
      mergedOpts['-Latex'] === 'true' ||
      styleClass !== undefined ||
      Object.keys(mergedOpts).some((k) => k.startsWith('-')));

  return {
    kind: 'edge',
    id: `edge_${autoIdx}`,
    from: stdMatch[1],
    fromAnchor: stdMatch[2],
    to: stdMatch[5],
    toAnchor: stdMatch[6],
    routeType,
    bendAngle,
    label: stdMatch[4]?.trim(),
    arrowStart: Object.keys(mergedOpts).some((k) => k.startsWith('<') || k.startsWith('Stealth-')),
    arrowEnd: hasArrowEnd,
    stroke: mergedOpts['draw'] || 'nips_slate!85!black',
    lineWidth: mergedOpts['line width'] || '0.7pt',
    dashed: mergedOpts['dashed'] === 'true' || mergedOpts['densely dashed'] === 'true',
    styleClass,
    rawOptions,
    span: makeSpan(source, stmtStart, stmtEnd),
    optionsSpan,
  };
}

function parsePgfAxisBlock(
  source: string,
  blockStart: number,
  blockEnd: number,
  autoIdx: number
): TikzChartElement {
  const rawBlock = source.slice(blockStart, blockEnd);

  // Extract scope shift={(x, y)} if present
  let x = 6.5;
  let y = 0.2;
  let coordSpan: SourceSpan | undefined;
  const shiftMatch =
    /shift\s*=\s*\{\s*\(\s*([-+]?[0-9]*\.?[0-9]+)(?:cm)?\s*,\s*([-+]?[0-9]*\.?[0-9]+)(?:cm)?\s*\)\s*\}/.exec(
      rawBlock
    );
  if (shiftMatch) {
    x = parseFloat(shiftMatch[1]);
    y = parseFloat(shiftMatch[2]);
    const openParen = rawBlock.indexOf('(', shiftMatch.index);
    const closeParen = rawBlock.indexOf(')', openParen);
    coordSpan = makeSpan(source, blockStart + openParen + 1, blockStart + closeParen);
  }

  // Extract \begin{axis}[...] options
  const axisOptMatch = /\\begin\{axis\}\s*\[([\s\S]*?)\]/.exec(rawBlock);
  const axisOpts = axisOptMatch ? parseTikzOptionString(axisOptMatch[1]) : {};

  const title = axisOpts['title'] || 'Experimental Results';
  const xlabel = axisOpts['xlabel'] || 'Training Steps / Scale';
  const ylabel = axisOpts['ylabel'] || 'Metric Score (%)';
  const subcaption = axisOpts['subcaption'] || '';
  const width = parseCmValue(axisOpts['width'], 5.8);
  const height = parseCmValue(axisOpts['height'], 4.2);
  const showGrid = axisOpts['grid'] !== 'none';
  const showLegend = axisOpts['legend'] !== 'none';

  // Optional label offsets for draggable title / xlabel / ylabel
  const parseOffsetPair = (raw: string | undefined): { x: number; y: number } | undefined => {
    if (!raw) return undefined;
    const parts = raw.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { x: parts[0], y: parts[1] };
    }
    return undefined;
  };
  const titleOffset = parseOffsetPair(axisOpts['title_offset']);
  const xlabelOffset = parseOffsetPair(axisOpts['xlabel_offset']);
  const ylabelOffset = parseOffsetPair(axisOpts['ylabel_offset']);

  // Extract legend position `at={(lx, ly)}` inside `legend style={...}` if present
  let legendPos = { x: 0.04, y: 0.94 };
  let legendCoordSpan: SourceSpan | undefined;
  const legendAtMatch =
    /legend\s+style\s*=\s*\{[^\n]*?at\s*=\s*\{\s*\(\s*([-+]?[0-9]*\.?[0-9]+)\s*,\s*([-+]?[0-9]*\.?[0-9]+)\s*\)\s*\}/.exec(
      rawBlock
    );
  if (legendAtMatch) {
    legendPos = {
      x: parseFloat(legendAtMatch[1]),
      y: parseFloat(legendAtMatch[2]),
    };
    const atIdx = legendAtMatch[0].lastIndexOf('at');
    const openParen = legendAtMatch[0].indexOf('(', atIdx);
    const closeParen = legendAtMatch[0].indexOf(')', openParen);
    legendCoordSpan = makeSpan(
      source,
      blockStart + legendAtMatch.index + openParen + 1,
      blockStart + legendAtMatch.index + closeParen
    );
  }

  // Detect chartType (`line` | `bar` | `heatmap` | `boxplot`)
  let chartType: PgfChartType = (axisOpts['chart_type'] as PgfChartType) || 'line';
  if (rawBlock.includes('ybar') || axisOpts['ybar'] !== undefined) {
    chartType = 'bar';
  } else if (rawBlock.includes('matrix plot') || rawBlock.includes('heatmap')) {
    chartType = 'heatmap';
  } else if (rawBlock.includes('boxplot prepared') || rawBlock.includes('boxplot')) {
    chartType = 'boxplot';
  }

  // Parse \addplot blocks
  const series: ChartSeries[] = [];
  const boxplots: BoxplotStat[] = [];
  let heatmapMatrix: number[][] | undefined;

  const addplotRegex =
    /\\addplot\+?\s*(?:\[([\s\S]*?)\])?\s*coordinates\s*\{([\s\S]*?)\}\s*;(?:\s*\\addlegendentry\{([\s\S]*?)\})?/g;
  let pMatch: RegExpExecArray | null;
  let sIdx = 1;

  while ((pMatch = addplotRegex.exec(rawBlock)) !== null) {
    const pOpts = pMatch[1] ? parseTikzOptionString(pMatch[1]) : {};
    const coordBody = pMatch[2];
    const legendName = pMatch[3]?.trim() || pOpts['name'] || `Series ${sIdx}`;
    const color = pOpts['color'] || pOpts['draw'] || ['#2B5B84', '#D97706', '#28664B', '#7C3AED'][sIdx - 1] || '#2B5B84';

    const points: ChartDataPoint[] = [];
    const ptRegex =
      /\(\s*([^,\s)]+)\s*,\s*([-+]?[0-9]*\.?[0-9]+)\s*\)(?:\s*\+-\s*\(\s*[^,)]+\s*,\s*([-+]?[0-9]*\.?[0-9]+)\s*\))?/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = ptRegex.exec(coordBody)) !== null) {
      const rawX = cMatch[1].trim();
      const numX = Number(rawX);
      points.push({
        x: isNaN(numX) ? rawX : numX,
        y: parseFloat(cMatch[2]),
        error: cMatch[3] ? parseFloat(cMatch[3]) : undefined,
      });
    }

    series.push({
      id: `series_${sIdx}`,
      name: legendName,
      color,
      mark: (pOpts['mark'] as ChartSeries['mark']) || '*',
      dashed: pOpts['dashed'] === 'true',
      points,
    });
    sIdx++;
  }

  // Parse boxplot prepared blocks if present
  if (chartType === 'boxplot') {
    const boxRegex = /boxplot prepared\s*=\s*\{([\s\S]*?)\}/g;
    let bMatch: RegExpExecArray | null;
    let bIdx = 1;
    while ((bMatch = boxRegex.exec(rawBlock)) !== null) {
      const bOpts = parseTikzOptionString(bMatch[1]);
      boxplots.push({
        label: bOpts['label'] || `Model ${bIdx}`,
        median: parseFloat(bOpts['median'] || '78'),
        upperQuartile: parseFloat(bOpts['upper quartile'] || '82'),
        lowerQuartile: parseFloat(bOpts['lower quartile'] || '74'),
        upperWhisker: parseFloat(bOpts['upper whisker'] || '86'),
        lowerWhisker: parseFloat(bOpts['lower whisker'] || '69'),
      });
      bIdx++;
    }
    if (boxplots.length === 0) {
      boxplots.push(
        { label: 'Baseline', median: 74.2, lowerQuartile: 71.5, upperQuartile: 76.8, lowerWhisker: 68.0, upperWhisker: 79.5 },
        { label: '+Attn', median: 79.6, lowerQuartile: 77.4, upperQuartile: 81.9, lowerWhisker: 74.5, upperWhisker: 84.2 },
        { label: 'Ours', median: 84.8, lowerQuartile: 83.1, upperQuartile: 86.4, lowerWhisker: 80.8, upperWhisker: 88.5 }
      );
    }
  }

  // Parse heatmap matrix if present
  if (chartType === 'heatmap') {
    const matrixCommentMatch = /%\s*heatmap_matrix:\s*(\[\[[\s\S]*?\]\])/.exec(rawBlock);
    if (matrixCommentMatch) {
      try {
        heatmapMatrix = JSON.parse(matrixCommentMatch[1]);
      } catch {
        // use default below
      }
    }
    if (!heatmapMatrix) {
      heatmapMatrix = [
        [0.82, 0.11, 0.04, 0.03],
        [0.09, 0.76, 0.10, 0.05],
        [0.05, 0.12, 0.74, 0.09],
        [0.02, 0.06, 0.08, 0.84],
      ];
    }
  }

  return {
    kind: 'chart',
    id: axisOpts['id'] || `chart_${autoIdx}`,
    chartType,
    x,
    y,
    width,
    height,
    title,
    xlabel,
    ylabel,
    subcaption,
    showGrid,
    showLegend: showLegend && (series.length > 0 || chartType === 'line' || chartType === 'bar'),
    legendPos,
    titleOffset,
    xlabelOffset,
    ylabelOffset,
    series:
      series.length > 0
        ? series
        : [
            {
              id: 'series_1',
              name: 'Ours (AgentTikZ)',
              color: '#2B5B84',
              mark: '*',
              points: [
                { x: 1, y: 72.4, error: 1.2 },
                { x: 2, y: 78.6, error: 1.0 },
                { x: 3, y: 83.1, error: 0.8 },
                { x: 4, y: 86.5, error: 0.7 },
              ],
            },
            {
              id: 'series_2',
              name: 'Baseline',
              color: '#D97706',
              mark: 'square*',
              dashed: true,
              points: [
                { x: 1, y: 68.1, error: 1.5 },
                { x: 2, y: 73.2, error: 1.3 },
                { x: 3, y: 76.8, error: 1.1 },
                { x: 4, y: 79.0, error: 1.0 },
              ],
            },
          ],
    heatmapMatrix,
    heatmapXLabels: ['Q_1', 'Q_2', 'Q_3', 'Q_4'],
    heatmapYLabels: ['K_1', 'K_2', 'K_3', 'K_4'],
    boxplots,
    span: makeSpan(source, blockStart, blockEnd),
    coordSpan,
    legendCoordSpan,
  };
}

/**
 * Main lossless parser entry point: parses TikZ + PGFPlots code into a SceneGraph
 * where every node, edge, and chart carries its exact character `SourceSpan`.
 */
export function parseTikzDocument(source: string): ParsedTikzDocument {
  const preambleStyles = parsePreambleStyles(source);
  const elements: SceneElement[] = [];
  const nodes: TikzNodeElement[] = [];
  const edges: TikzEdgeElement[] = [];
  const charts: TikzChartElement[] = [];
  const diagnostics: ParsedTikzDocument['diagnostics'] = [];

  // Extract overall Figure Caption (% \caption{...} or \caption{...}) and \label{...}
  let figureCaption =
    'Overview of the proposed architecture and experimental scaling analysis.';
  let figureLabel = 'fig:architecture_overview';
  const capMatch = /(?:%\s*)?\\caption\{([\s\S]*?)\}\s*(?:\n|$)/.exec(source);
  if (capMatch) {
    figureCaption = capMatch[1].trim();
  }
  const lblMatch = /(?:%\s*)?\\label\{([^}]+)\}/.exec(source);
  if (lblMatch) {
    figureLabel = lblMatch[1].trim();
  }

  // First locate any PGFPlots scope/axis blocks so we don't double-parse inside them
  const axisRanges: Array<{ start: number; end: number }> = [];
  const scopeAxisRegex =
    /\\begin\{scope\}\s*\[[^\]]*shift\s*=[^\]]*\][\s\S]*?\\begin\{axis\}[\s\S]*?\\end\{axis\}\s*\\end\{scope\}|\\begin\{axis\}[\s\S]*?\\end\{axis\}/g;
  let aMatch: RegExpExecArray | null;
  let chartIdx = 1;
  while ((aMatch = scopeAxisRegex.exec(source)) !== null) {
    const start = aMatch.index;
    const end = start + aMatch[0].length;
    axisRanges.push({ start, end });
    const chartEl = parsePgfAxisBlock(source, start, end, chartIdx++);
    elements.push(chartEl);
    charts.push(chartEl);
  }

  const isInsideAxis = (offset: number) =>
    axisRanges.some((r) => offset >= r.start && offset < r.end);

  // Scan top-level `\node ...;` and `\draw ...;` statements
  const stmtRegex = /\\(node|draw)\b[\s\S]*?;/g;
  let sMatch: RegExpExecArray | null;
  let nodeIdx = 1;
  let edgeIdx = 1;

  while ((sMatch = stmtRegex.exec(source)) !== null) {
    const start = sMatch.index;
    const end = start + sMatch[0].length;
    if (isInsideAxis(start)) continue;

    // Check if commented out on its starting line
    const lineStart = source.lastIndexOf('\n', start) + 1;
    const prefixOnLine = source.slice(lineStart, start);
    if (prefixOnLine.includes('%')) continue;

    const cmd = sMatch[1];
    if (cmd === 'node') {
      const node = parseSingleNodeStatement(
        source,
        start,
        end,
        preambleStyles,
        nodeIdx++
      );
      if (node) {
        elements.push(node);
        nodes.push(node);
      }
    } else if (cmd === 'draw') {
      const edge = parseSingleDrawStatement(
        source,
        start,
        end,
        preambleStyles,
        edgeIdx++
      );
      if (edge) {
        elements.push(edge);
        edges.push(edge);
      }
    }
  }

  return {
    fullSource: source,
    figureCaption,
    figureLabel,
    preambleStyles,
    elements,
    nodes,
    edges,
    charts,
    diagnostics,
  };
}
