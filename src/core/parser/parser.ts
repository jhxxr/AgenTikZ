import {
  BoxplotStat,
  ChartDataPoint,
  ChartSeries,
  EdgeLineStyle,
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
import { JournalThemeId, NodeSalienceRole } from '../../types/theme';
import {
  getThemeDefaultPreambleStyles,
  registerCustomTikzColors,
} from '../themes/journal-presets';
import { parsePragmaDirectivesFromSource } from '../agent/figure-contract';

// ── Depth-aware scanning utilities ──────────────────────────────────────
// These replace naive non-greedy regex matches that would break on nested
// braces (`{...{...}...}`), brackets (`[...{...[...]...}...]`), or
// semicolons inside brace groups (`$p(x;\theta)$`).

/**
 * Starting at `from` (which should point at the opening char), find the
 * matching closing char respecting nested brace depth.
 * Works for `{}`, `[]`, and `()` pairs.
 */
function findMatchingClose(
  source: string,
  from: number,
  openCh: string,
  closeCh: string
): number {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    if (source[i] === openCh) depth++;
    else if (source[i] === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Find the end of a `\node ...;` or `\draw ...;` statement, where `;`
 * only terminates the statement when brace-depth is 0.
 * Returns the index one past the semicolon (exclusive end), or -1.
 */
function findStatementEnd(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth = Math.max(0, depth - 1);
    else if (source[i] === ';' && depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Extract the content between `[...]` starting at the `[` at position `openIdx`,
 * correctly handling nested `{...}` and `[...]` groups.
 * Returns `{ content, closeIdx }` where closeIdx is the position of `]`,
 * or null if no matching `]` is found.
 */
function extractBracketContent(
  source: string,
  openIdx: number
): { content: string; closeIdx: number } | null {
  let depth = 0; // tracks [] depth
  let braceDepth = 0; // tracks {} depth
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (braceDepth === 0) {
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          return {
            content: source.slice(openIdx + 1, i),
            closeIdx: i,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Extract the content of `\caption{...}` starting from the `{` after `\caption`,
 * correctly handling nested braces.
 * Returns the inner text or null.
 */
function extractBraceContent(
  source: string,
  openBraceIdx: number
): { content: string; closeIdx: number } | null {
  const closeIdx = findMatchingClose(source, openBraceIdx, '{', '}');
  if (closeIdx === -1) return null;
  return {
    content: source.slice(openBraceIdx + 1, closeIdx),
    closeIdx,
  };
}

// ── End depth-aware utilities ───────────────────────────────────────────

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

function parseEdgeLabelOffset(
  labelOptStr: string | undefined
): { x: number; y: number } | undefined {
  if (!labelOptStr) return undefined;
  const opts = parseTikzOptionString(labelOptStr);
  let x = parseCmValue(opts['xshift'], 0);
  let y = parseCmValue(opts['yshift'], 0);
  if (opts['right'] !== undefined && opts['xshift'] === undefined) {
    x += opts['right'] === 'true' ? 0.35 : parseCmValue(opts['right'], 0.35);
  }
  if (opts['left'] !== undefined && opts['xshift'] === undefined) {
    x -= opts['left'] === 'true' ? 0.35 : parseCmValue(opts['left'], 0.35);
  }
  if (opts['above'] !== undefined && opts['yshift'] === undefined) {
    y += opts['above'] === 'true' ? 0.25 : parseCmValue(opts['above'], 0.25);
  }
  if (opts['below'] !== undefined && opts['yshift'] === undefined) {
    y -= opts['below'] === 'true' ? 0.25 : parseCmValue(opts['below'], 0.25);
  }
  if (Math.abs(x) < 0.005 && Math.abs(y) < 0.005) return undefined;
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
  };
}

function parsePreambleStyles(
  source: string,
  activeThemeId: JournalThemeId = 'neurips'
): Record<string, Record<string, string>> {
  const styles: Record<string, Record<string, string>> =
    getThemeDefaultPreambleStyles(activeThemeId);


  const extractStyleDefinitions = (body: string) => {
    const styleKeyRegex = /([a-zA-Z0-9_-]+)\s*\/\.style\s*=\s*\{/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = styleKeyRegex.exec(body)) !== null) {
      const styleName = sMatch[1].trim();
      const bodyOpenIdx = sMatch.index + sMatch[0].length - 1;
      const bodyCloseIdx = findMatchingClose(body, bodyOpenIdx, '{', '}');
      if (bodyCloseIdx === -1) continue;
      const styleBody = body.slice(bodyOpenIdx + 1, bodyCloseIdx).trim();
      styles[styleName] = {
        ...(styles[styleName] || {}),
        ...parseTikzOptionString(styleBody),
      };
    }
  };

  // Scan \begin{tikzpicture}[...] options for inline style definitions
  const beginTikzMatch = /\\begin\{tikzpicture\}\s*\[/g.exec(source);
  if (beginTikzMatch) {
    const openBracketIdx = beginTikzMatch.index + beginTikzMatch[0].length - 1;
    const extracted = extractBracketContent(source, openBracketIdx);
    if (extracted) {
      extractStyleDefinitions(extracted.content);
    }
  }

  const tikzsetRegex = /\\tikzset\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = tikzsetRegex.exec(source)) !== null) {
    const outerBraceIdx = match.index + match[0].length - 1;
    const outerClose = findMatchingClose(source, outerBraceIdx, '{', '}');
    if (outerClose === -1) continue;
    const body = source.slice(outerBraceIdx + 1, outerClose);
    extractStyleDefinitions(body);
  }
  return styles;
}

const BUILTIN_BLOCK_STYLES = new Set([
  'dl_block',
  'mha_block',
  'addnorm_block',
  'conv_block',
  'feature_cube',
  'op_circle',
  'stage_box',
]);

function inferNodeSubtype(
  styleClass: string | undefined,
  mergedOpts: Record<string, string>,
  label: string,
  nodeId?: string
): NodeSubtype {
  if (mergedOpts['subtype']) {
    return mergedOpts['subtype'] as NodeSubtype;
  }
  if (
    styleClass === 'image_asset' ||
    mergedOpts['image_path'] !== undefined ||
    /\\includegraphics\b/.test(label)
  ) {
    return 'image';
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
  const minH = parseCmValue(mergedOpts['minimum height'], 0.85);
  const minW = parseCmValue(mergedOpts['minimum width'], 2.8);
  if (
    styleClass === 'stage_box' ||
    (mergedOpts['dashed'] === 'true' && minH >= 2.2) ||
    (minW >= 3.6 &&
      minH >= 2.5 &&
      (label.trim() === '' ||
        /stage|container|group|frame|encoder_block|decoder_block|outer/i.test(
          `${styleClass || ''} ${nodeId || ''}`
        )))
  ) {
    return 'container';
  }
  if (styleClass === 'mha_block' || /Multi-Head|Attention|MHA/i.test(label)) {
    return 'mha';
  }
  if (styleClass === 'addnorm_block' || /^Add\s*\\?&\s*(?:Layer)?Norm|^LayerNorm|^RMSNorm/i.test(label)) {
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
  // If a custom style (like `textlabel`, `note`, `annot`) or raw option list has no visible border/fill
  const hasVisibleDraw =
    mergedOpts['draw'] !== undefined && mergedOpts['draw'] !== 'none';
  const hasVisibleFill =
    mergedOpts['fill'] !== undefined && mergedOpts['fill'] !== 'none';
  if (
    !hasVisibleDraw &&
    !hasVisibleFill &&
    styleClass &&
    !BUILTIN_BLOCK_STYLES.has(styleClass) &&
    /label|note|annot|text|caption|math|eq|title|repeat|dim/i.test(
      `${styleClass} ${nodeId || ''}`
    )
  ) {
    return minW >= 5.5 ? 'caption' : 'math';
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

  // Locate [options] if present, using depth-aware bracket matching
  // so that nested brackets inside braces (e.g. `label={[above]X}`) work.
  let optionsSpan: SourceSpan | undefined;
  let rawOptions: Record<string, string> = {};
  const nodePrefix = /^\\node\s*/.exec(rawStmt);
  if (nodePrefix) {
    const afterNode = nodePrefix[0].length;
    if (rawStmt[afterNode] === '[') {
      const extracted = extractBracketContent(rawStmt, afterNode);
      if (extracted) {
        const contentStart = stmtStart + afterNode + 1;
        const contentEnd = stmtStart + extracted.closeIdx;
        optionsSpan = makeSpan(source, contentStart, contentEnd);
        rawOptions = parseTikzOptionString(extracted.content);
      }
    }
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

  // Locate `at (x, y)` coordinate and its exact inner span.
  // Only search the portion of the statement BEFORE the label `{...}` to avoid
  // matching `at (x, y)` that appears inside node text content.
  let x = 0;
  let y = 0;
  let coordSpan: SourceSpan | undefined;
  const labelBraceIdx = (() => {
    // Find the first `{` that is NOT inside [options]
    const searchFrom = nodePrefix
      ? (rawStmt[nodePrefix[0].length] === '['
        ? (extractBracketContent(rawStmt, nodePrefix[0].length)?.closeIdx ?? -1) + 1
        : nodePrefix[0].length)
      : 0;
    return rawStmt.indexOf('{', searchFrom);
  })();
  const atSearchRegion = labelBraceIdx !== -1 ? rawStmt.slice(0, labelBraceIdx) : rawStmt;
  const atMatch = /\bat\s*\(\s*([-+]?[0-9]*\.?[0-9]+)(?:cm)?\s*,\s*([-+]?[0-9]*\.?[0-9]+)(?:cm)?\s*\)/.exec(
    atSearchRegion
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

  const subtype = inferNodeSubtype(styleClass, mergedOpts, label, id);

  // Extract \includegraphics[...]{path} details if subtype === 'image'
  let imagePath: string | undefined = mergedOpts['image_path'];
  let includeGraphicsW: number | undefined;
  let includeGraphicsH: number | undefined;
  if (subtype === 'image') {
    const igMatch = /\\includegraphics\s*(?:\[([^\]]*)\])?\s*\{\s*([^}]+)\s*\}/.exec(
      label
    );
    if (igMatch) {
      imagePath = igMatch[2].trim();
      if (igMatch[1]) {
        const igOpts = parseTikzOptionString(igMatch[1]);
        if (igOpts['width']) {
          includeGraphicsW = parseCmValue(igOpts['width'], 4.2);
        }
        if (igOpts['height']) {
          includeGraphicsH = parseCmValue(igOpts['height'], 3.0);
        }
      }
    }
  }

  const defaultW =
    subtype === 'op_circle'
      ? 0.7
      : subtype === 'cuboid'
        ? 1.3
        : subtype === 'container'
          ? 4.2
          : subtype === 'caption'
            ? 4.6
            : subtype === 'image'
              ? includeGraphicsW ?? 4.2
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
              : subtype === 'image'
                ? includeGraphicsH ?? 3.0
                : 0.85;

  const sizeSpec = mergedOpts['minimum size'];
  const width = parseCmValue(mergedOpts['minimum width'] || sizeSpec, defaultW);
  const height = parseCmValue(mergedOpts['minimum height'] || sizeSpec, defaultH);
  const depth = subtype === 'cuboid' ? parseCmValue(mergedOpts['depth'], 0.55) : undefined;
  const channels = mergedOpts['channels'] || (subtype === 'cuboid' ? '64×64×128' : undefined);

  // Extract optional secondary sublabel if separated by `\\`
  let mainLabel = label;
  let sublabel = mergedOpts['sublabel'];
  if (subtype === 'image' && imagePath) {
    // Strip the raw \includegraphics{...} command from display label if present
    const stripped = label
      .replace(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/g, '')
      .replace(/^\s*(?:\\\\\s*)+|(?:\s*\\\\)+\s*$/g, '')
      .trim();
    const defaultImgLabel = imagePath.split('/').pop() || imagePath;
    const unwrapSub = (s: string) => {
      const m = /^\{\\(?:scriptsize|footnotesize|tiny)\b\s*([\s\S]*)\}$/.exec(
        s.trim()
      );
      return m ? m[1].trim() : s.trim();
    };
    if (!stripped) {
      mainLabel = defaultImgLabel;
    } else if (stripped.includes('\\\\')) {
      const parts = stripped
        .split('\\\\')
        .map((s) => s.trim())
        .filter(Boolean);
      mainLabel = parts[0] || defaultImgLabel;
      sublabel = unwrapSub(parts.slice(1).join(' '));
    } else if (/^\{\\(?:scriptsize|footnotesize|tiny)\b/.test(stripped)) {
      mainLabel = defaultImgLabel;
      sublabel = unwrapSub(stripped);
    } else {
      mainLabel = stripped;
    }
  } else if (label.includes('\\\\')) {
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
    imagePath,
    label: mainLabel,
    sublabel,
    styleClass,
    salienceRole: (mergedOpts['role'] as NodeSalienceRole) || undefined,
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

function resolveEdgeLineStyle(mergedOpts: Record<string, string>): {
  dashed: boolean;
  dotted: boolean;
  lineStyle: EdgeLineStyle;
} {
  const isDenselyDotted = mergedOpts['densely dotted'] === 'true';
  const isDotted = isDenselyDotted || mergedOpts['dotted'] === 'true';
  const isDenselyDashed = mergedOpts['densely dashed'] === 'true';
  const isDashed = !isDotted && (isDenselyDashed || mergedOpts['dashed'] === 'true');
  const lineStyle: EdgeLineStyle = isDenselyDotted
    ? 'densely_dotted'
    : isDotted
      ? 'dotted'
      : isDenselyDashed
        ? 'densely_dashed'
        : isDashed
          ? 'dashed'
          : 'solid';
  return { dashed: isDashed, dotted: isDotted, lineStyle };
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
  const drawPrefix = /^\\draw\s*/.exec(rawStmt);
  if (drawPrefix) {
    const afterDraw = drawPrefix[0].length;
    if (rawStmt[afterDraw] === '[') {
      const extracted = extractBracketContent(rawStmt, afterDraw);
      if (extracted) {
        const contentStart = stmtStart + afterDraw + 1;
        const contentEnd = stmtStart + extracted.closeIdx;
        optionsSpan = makeSpan(source, contentStart, contentEnd);
        rawOptions = parseTikzOptionString(extracted.content);
      }
    }
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
  const { dashed, dotted, lineStyle } = resolveEdgeLineStyle(mergedOpts);

  // Find endpoint references `(nodeA.anchor)` or `(nodeA)`
  const bodyAfterOpt = (() => {
    if (drawPrefix) {
      const afterDraw = drawPrefix[0].length;
      if (rawStmt[afterDraw] === '[') {
        const extracted = extractBracketContent(rawStmt, afterDraw);
        if (extracted) {
          return rawStmt.slice(extracted.closeIdx + 1);
        }
      }
    }
    return rawStmt.replace(/^\\draw\s*/, '');
  })();

  // Check for residual skip connection: `(a.east) -- ++(1.4, 0) |- (b.east)`
  const residualMatch =
    /\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)\s*--\s*\+\+\(\s*([-+]?[0-9.]+)(?:cm)?\s*,\s*[-+]?[0-9.]+(?:cm)?\s*\)\s*\|-\s*(?:node\s*\[([\s\S]*?)\]\s*\{([\s\S]*?)\}\s*)?\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)/.exec(
      bodyAfterOpt
    );

  if (residualMatch) {
    const dx = parseFloat(residualMatch[3]);
    return {
      kind: 'edge',
      id: `edge_${autoIdx}`,
      from: residualMatch[1],
      fromAnchor: residualMatch[2],
      to: residualMatch[6],
      toAnchor: residualMatch[7],
      routeType: dx >= 0 ? 'residual_right' : 'residual_left',
      residualOffset: Math.abs(dx),
      label: residualMatch[5]?.trim(),
      labelOffset: parseEdgeLabelOffset(residualMatch[4]),
      arrowEnd: true,
      stroke: mergedOpts['draw'] || 'nips_slate!85!black',
      lineWidth: mergedOpts['line width'] || '0.7pt',
      dashed,
      dotted,
      lineStyle,
      styleClass,
      rawOptions,
      span: makeSpan(source, stmtStart, stmtEnd),
      optionsSpan,
    };
  }

  // Standard or curved or orthogonal connection
  const stdMatch =
    /\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)\s*(--|\|-|-\||to\s*\[[^\]]*\])\s*(?:node\s*\[([^\]]*)\]\s*\{([\s\S]*?)\}\s*)?\(\s*([a-zA-Z0-9_:-]+)(?:\.([a-zA-Z ]+))?\s*\)/.exec(
      bodyAfterOpt
    );

  const hasArrowEnd =
    !mergedOpts['-'] &&
    (mergedOpts['->'] === 'true' ||
      mergedOpts['-Stealth'] === 'true' ||
      mergedOpts['-Latex'] === 'true' ||
      styleClass !== undefined ||
      Object.keys(mergedOpts).some((k) => k.startsWith('-')));

  if (!stdMatch) {
    // Fallback for multi-segment waypoint paths between two named nodes:
    // e.g. `(a.east) -- (15.4, 2.2) |- (b.east);` or `(a.east) -- (9.55, 3.7) -- (9.55, 0.7) |- (b.west);`
    const namedEndpoints: Array<{ id: string; anchor?: string; index: number }> = [];
    const tokenRegex = /(\+\+\s*)?\(\s*([a-zA-Z_][a-zA-Z0-9_:-]*)(?:\.([a-zA-Z ]+))?\s*\)/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tokenRegex.exec(bodyAfterOpt)) !== null) {
      if (tMatch[1]) continue; // skip relative ++(...)
      namedEndpoints.push({
        id: tMatch[2].trim(),
        anchor: tMatch[3]?.trim(),
        index: tMatch.index,
      });
    }
    if (namedEndpoints.length >= 2) {
      const first = namedEndpoints[0];
      const last = namedEndpoints[namedEndpoints.length - 1];
      const fAnchor = first.anchor;
      const tAnchor = last.anchor;
      const inlineLabelMatch = /node\s*(?:\[([^\]]*)\])?\s*\{([\s\S]*?)\}/.exec(bodyAfterOpt);
      let routeType: EdgeRouteType = 'direct';
      let residualOffset: number | undefined;
      if (fAnchor === 'east' && tAnchor === 'east') {
        routeType = 'residual_right';
        residualOffset = 1.2;
      } else if (fAnchor === 'west' && tAnchor === 'west') {
        routeType = 'residual_left';
        residualOffset = 1.2;
      } else if (/\|-\s*(?:node[\s\S]*?)?\(\s*[a-zA-Z_]/.test(bodyAfterOpt)) {
        routeType = 'vh';
      } else if (/-\|\s*(?:node[\s\S]*?)?\(\s*[a-zA-Z_]/.test(bodyAfterOpt)) {
        routeType = 'hv';
      }
      return {
        kind: 'edge',
        id: `edge_${autoIdx}`,
        from: first.id,
        fromAnchor: fAnchor,
        to: last.id,
        toAnchor: tAnchor,
        routeType,
        residualOffset,
        label: inlineLabelMatch?.[2]?.trim(),
        labelOffset: parseEdgeLabelOffset(inlineLabelMatch?.[1]),
        arrowStart: Object.keys(mergedOpts).some((k) => k.startsWith('<') || k.startsWith('Stealth-')),
        arrowEnd: hasArrowEnd,
        stroke: mergedOpts['draw'] || 'nips_slate!85!black',
        lineWidth: mergedOpts['line width'] || '0.7pt',
        dashed,
        dotted,
        lineStyle,
        styleClass,
        rawOptions,
        span: makeSpan(source, stmtStart, stmtEnd),
        optionsSpan,
      };
    }
    return null;
  }

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

  return {
    kind: 'edge',
    id: `edge_${autoIdx}`,
    from: stdMatch[1],
    fromAnchor: stdMatch[2],
    to: stdMatch[6],
    toAnchor: stdMatch[7],
    routeType,
    bendAngle,
    label: stdMatch[5]?.trim(),
    labelOffset: parseEdgeLabelOffset(stdMatch[4]),
    arrowStart: Object.keys(mergedOpts).some((k) => k.startsWith('<') || k.startsWith('Stealth-')),
    arrowEnd: hasArrowEnd,
    stroke: mergedOpts['draw'] || 'nips_slate!85!black',
    lineWidth: mergedOpts['line width'] || '0.7pt',
    dashed,
    dotted,
    lineStyle,
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
  const uncertaintyNote = axisOpts['uncertainty_note'] || undefined;
  const directEndLabels = axisOpts['direct_labels'] === 'true';
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

  // Extract legend position `at={(lx, ly)}` and optional scale inside `legend style={...}` or `legend_scale`
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

  let legendScale: number | undefined;
  if (axisOpts['legend_scale']) {
    const parsedScale = parseFloat(axisOpts['legend_scale']);
    if (!isNaN(parsedScale) && parsedScale > 0) {
      legendScale = parsedScale;
    }
  } else {
    const legendScaleMatch =
      /legend\s+style\s*=\s*\{[^\n]*?scale\s*=\s*([0-9]*\.?[0-9]+)/.exec(
        rawBlock
      );
    if (legendScaleMatch) {
      const parsedScale = parseFloat(legendScaleMatch[1]);
      if (!isNaN(parsedScale) && parsedScale > 0) {
        legendScale = parsedScale;
      }
    }
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
    uncertaintyNote,
    directEndLabels,
    showGrid,
    showLegend: showLegend && (series.length > 0 || chartType === 'line' || chartType === 'bar'),
    legendPos,
    legendScale,
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
export function parseTikzDocument(
  source: string,
  activeThemeId: JournalThemeId = 'neurips'
): ParsedTikzDocument {
  registerCustomTikzColors(source);
  const preambleStyles = parsePreambleStyles(source, activeThemeId);
  const { contract, panels, imageDirectives } = parsePragmaDirectivesFromSource(source);
  const elements: SceneElement[] = [];
  const nodes: TikzNodeElement[] = [];
  const edges: TikzEdgeElement[] = [];
  const charts: TikzChartElement[] = [];
  const diagnostics: ParsedTikzDocument['diagnostics'] = [];

  // Extract overall Figure Caption (% \caption{...} or \caption{...}) and \label{...}
  let figureCaption = '';
  let figureLabel = '';
  // Extract caption using depth-aware brace matching
  const capSearchRegex = /(?:%\s*)?\\caption\{/g;
  const capStartMatch = capSearchRegex.exec(source);
  if (capStartMatch) {
    const openBraceIdx = capStartMatch.index + capStartMatch[0].length - 1;
    const extracted = extractBraceContent(source, openBraceIdx);
    if (extracted) {
      figureCaption = extracted.content.trim();
    }
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

  // Scan top-level `\node ...;` and `\draw ...;` statements using depth-aware
  // semicolon detection so that `;` inside brace groups (e.g. $p(x;\theta)$)
  // does not truncate the match.
  const stmtStartRegex = /\\(node|draw)\b/g;
  let sMatch: RegExpExecArray | null;
  let nodeIdx = 1;
  let edgeIdx = 1;

  while ((sMatch = stmtStartRegex.exec(source)) !== null) {
    const start = sMatch.index;
    if (isInsideAxis(start)) continue;
    const end = findStatementEnd(source, start);
    if (end === -1) continue;

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
    contract,
    panels,
    imageDirectives,
    preambleStyles,
    elements,
    nodes,
    edges,
    charts,
    diagnostics,
  };
}
