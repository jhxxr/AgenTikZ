/** Shared bounds for adapted skills and the preserved original reference pages. */
export function readSkillTextPage(text: string, startLine = 1, lineCount = 100) {
  if (!Number.isSafeInteger(startLine) || startLine < 1 ||
      !Number.isSafeInteger(lineCount) || lineCount < 1 || lineCount > 160) {
    throw new Error('startLine 必须为正整数；lineCount 必须在 1–160 之间。');
  }
  const lines = text.split(/\r?\n/);
  if (startLine > lines.length) throw new Error(`起始行超出当前主题范围（共 ${lines.length} 行）。`);
  const page: string[] = [];
  let chars = 0;
  for (const line of lines.slice(startLine - 1, startLine - 1 + lineCount)) {
    if (chars + line.length + 1 > 16000) break;
    page.push(line); chars += line.length + 1;
  }
  if (!page.length) throw new Error('当前行超出参考页字符上限，无法完整读取。');
  const endLine = startLine + page.length - 1;
  return { startLine, endLine, totalLines: lines.length,
    nextStartLine: endLine < lines.length ? endLine + 1 : null, text: page.join('\n') };
}
