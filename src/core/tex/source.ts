/** Mask TeX comments without changing offsets into the editable source. */
export function maskLatexComments(source: string): string {
  return source.replace(/(\\(?:\\|%)|%[^\r\n]*)/g, (token) =>
    token.startsWith('%') ? ' '.repeat(token.length) : token
  );
}

export function isCompleteLatexDocument(source: string): boolean {
  const code = maskLatexComments(source);
  return /\\documentclass\b/.test(code) && /\\begin\s*\{document\}/.test(code);
}

/**
 * Recover documents exported by older AgenTikZ versions which wrapped a full
 * document in another standalone document. Only unwrap when the outer body
 * contains nothing before the inner document; preserve ordinary documents.
 */
export function normalizeLatexDocument(source: string): string {
  let result = source;
  for (;;) {
    const code = maskLatexComments(result);
    const outerBegin = /\\begin\s*\{document\}/.exec(code);
    if (!outerBegin || !/\\documentclass\b/.test(code.slice(0, outerBegin.index))) break;
    const bodyStart = outerBegin.index + outerBegin[0].length;
    const innerClass = /\\documentclass\b/.exec(code.slice(bodyStart));
    if (!innerClass || code.slice(bodyStart, bodyStart + innerClass.index).trim()) break;
    const innerStart = bodyStart + innerClass.index;
    const boundaries = /\\(begin|end)\s*\{document\}/g;
    boundaries.lastIndex = innerStart;
    let depth = 0;
    let innerEnd = -1;
    let token: RegExpExecArray | null;
    while ((token = boundaries.exec(code))) {
      depth += token[1] === 'begin' ? 1 : -1;
      if (depth === 0) {
        innerEnd = boundaries.lastIndex;
        break;
      }
    }
    if (innerEnd === -1) break;
    // Only remove an otherwise empty generated outer document.
    if (code.slice(innerEnd).replace(/\\end\s*\{document\}/g, '').trim()) break;
    result = result.slice(innerStart, innerEnd);
  }
  return result;
}

/** Features outside the editable node/edge/PGFPlots subset need real TeX. */
export function getExactPreviewReasons(source: string): string[] {
  const code = maskLatexComments(source);
  const reasons: string[] = [];
  if (/\\(?:newcommand|renewcommand|providecommand|def|gdef|edef)\b/.test(code)) {
    reasons.push('自定义 TeX 宏');
  }
  if (/\\(?:filldraw|fill|path|clip|shade|shadedraw|useasboundingbox|foreach)\b/.test(code)) {
    reasons.push('TikZ 路径绘图');
  }
  if (/\\draw\s*(?:\[[^\]]*\]\s*)?\(\s*[{+\-\d]/.test(code) ||
      /\\draw\b[^;]*?\b(?:circle|rectangle|controls|arc|plot)\b/.test(code)) {
    reasons.push('坐标路径或曲线');
  }
  if (/\\begin\{tikzpicture\}\s*\[[^\]]*?\b(?:x|y|scale|xscale|yscale|rotate|transform canvas)\s*=/.test(code)) {
    reasons.push('画布坐标变换');
  }
  if (/\\node\s*\[[^\]]*\brotate\s*=/.test(code)) {
    reasons.push('文字旋转');
  }
  if (/\bat\s*\(\s*\{/.test(code)) {
    reasons.push('坐标表达式');
  }
  return reasons;
}
