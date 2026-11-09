import { maskLatexComments } from '../tex/source';
import type { FigureColumnSpan, InsertFigureSnippetOptions } from './paper-templates';

export interface FigureInsertionResult {
  ok: boolean;
  snippet: string;
  targetFile: string;
  error?: string;
  alreadyPresent?: boolean;
  label?: string;
}

export interface FigureInsertSource {
  mode: 'tikz_package' | 'external_graphic';
  relativePath: string;
}
export type FigureInsertionOptions = InsertFigureSnippetOptions & {
  targetTexFile?: string;
  insertAtCursor?: boolean;
  allowDuplicate?: boolean;
};

export interface PaperInsertionLocation {
  id: string;
  projectId: string;
  path: string;
  offset: number;
}

export function normalizeFigurePath(value: string): string {
  const path = value.replace(/\\/g, '/').trim();
  if (!path || path.length > 1024 || /[:%#{}\u0000-\u001f\u007f]/.test(path) ||
      path.split('/').some((part) => !part || part === '.' || part === '..' ||
        part.trim() !== part || part.startsWith('.') || /[. ]$/.test(part))) {
    throw new Error('配图路径必须在项目内，不能包含路径穿越、隐藏目录或 TeX 保留字符（% # { }）。');
  }
  return path;
}

export function canInsertGraphic(path: string): boolean {
  try { return /\.(pdf|png|jpe?g)$/i.test(normalizeFigurePath(path)); }
  catch { return false; }
}

export function figurePathArgument(path: string): string {
  const clean = normalizeFigurePath(path);
  return /^[a-zA-Z0-9_./-]+$/.test(clean) ? clean : `\\detokenize{${clean}}`;
}

export function canvasFigurePath(fileName: string): string {
  if (!fileName || !/\.canvas\.json$/i.test(fileName) || /[\\/]/.test(fileName)) {
    throw new Error('请先选择一个有效画布。');
  }
  return normalizeFigurePath(`figures/${fileName.replace(/\.canvas\.json$/i, '')}.tikz`);
}

export function escapeLatexText(value: string): string {
  const escapes: Record<string, string> = { '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
  return value.replace(/[\\&%$#_{}~^]/g, (char) => escapes[char]);
}

export function defaultFigureLabel(value: string): string {
  const stem = value.split('/').pop()!.replace(/\.(canvas\.json|tikz|pdf|png|jpe?g)$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `fig:${stem || 'figure'}`;
}

/** Preserve offsets while excluding comments and common literal-code environments. */
export function manuscriptCode(source: string): string {
  return maskLatexComments(source).replace(
    /\\begin\s*\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\s*\{\1\}/g,
    (text) => text.replace(/[^\r\n]/g, ' '),
  ).replace(/\\verb\*?([^\w\s])([^\r\n]*?)\1/g, (text) => ' '.repeat(text.length));
}

export function hasDrawableFigure(source: string): boolean {
  const code = manuscriptCode(source);
  const picture = /\\begin\s*\{tikzpicture\}(?:\s*\[[\s\S]*?\])?([\s\S]*?)\\end\s*\{tikzpicture\}/.exec(code);
  return Boolean(picture?.[1].trim());
}

export function validateFigureOptions(opts: InsertFigureSnippetOptions): void {
  const path = normalizeFigurePath(opts.relativePath || opts.figureRelPath || '');
  if (!['tikz_package', 'external_graphic'].includes(opts.mode)) throw new Error('请选择有效插入方式。');
  if (opts.mode === 'tikz_package' ? !/\.tikz$/i.test(path) : !canInsertGraphic(path)) {
    throw new Error('论文直接插图支持 PDF、PNG、JPEG；SVG/WebP 请先转换，TikZ 代码包须使用 .tikz 文件。');
  }
  const span = opts.span || opts.columnSpan || 'single_column';
  if (!['single_column', 'double_column'].includes(span)) throw new Error('栏宽设置无效。');
  const ratio = opts.widthRatio === undefined ? 1 : Number(opts.widthRatio);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) throw new Error('宽度比例应大于 0 且不超过 1。');
  if (opts.placement && !/^[!htbp]+$/.test(opts.placement)) throw new Error('浮动位置仅支持 !、h、t、b、p。');
  if (opts.label && !/^[a-zA-Z0-9:._-]+$/.test(opts.label)) throw new Error('引用标签只支持英文字母、数字和 : . _ -。');
  if (maskLatexComments(opts.caption) !== opts.caption) throw new Error('图注中的 % 需要转义为 \\%。');
  let depth = 0;
  for (const token of opts.caption.matchAll(/\\[{}\\]|[{}]/g)) {
    if (token[0] === '{') depth++;
    if (token[0] === '}' && --depth < 0) throw new Error('图注中的花括号不匹配。');
  }
  if (depth) throw new Error('图注中的花括号不匹配。');
}

export function defaultFigureSpan(mainSource: string, widthCm = 0): FigureColumnSpan {
  const code = manuscriptCode(mainSource);
  const options = /\\documentclass\s*\[([^\]]*)\]/.exec(code)?.[1] || '';
  const double = (/\btwocolumn\b/.test(options) || /\\twocolumn\b/.test(code)) && !/\bonecolumn\b/.test(options);
  return double && widthCm >= 12 ? 'double_column' : 'single_column';
}

export function uniqueFigureLabel(label: string, sources: string[]): string {
  const used = new Set(sources.flatMap((source) => [...manuscriptCode(source).matchAll(/\\label\s*\{([^{}]+)\}/g)].map((match) => match[1])));
  let next = label;
  for (let count = 2; used.has(next); count++) next = `${label}-${count}`;
  return next;
}

export function findExistingFigure(source: string, path: string, mode: InsertFigureSnippetOptions['mode']) {
  const code = manuscriptCode(source);
  const command = mode === 'tikz_package' ? 'input' : 'includegraphics';
  const matcher = new RegExp(`\\\\${command}\\s*(?:\\[[^\\]]*\\]\\s*)?\\{\\s*(?:\\\\detokenize\\{([^{}]*)\\}|([^{}]*))\\s*\\}`, 'g');
  for (const match of code.matchAll(matcher)) {
    const existing = (match[1] ?? match[2]).trim().replace(/\\/g, '/');
    if (existing !== path && (/\.[a-z0-9]+$/i.test(existing) || existing !== path.replace(/\.[^.]+$/, ''))) continue;
    const end = code.indexOf('\\end{figure', match.index);
    const label = end >= 0 ? /\\label\s*\{([^{}]+)\}/.exec(code.slice(match.index, end))?.[1] : undefined;
    return { offset: match.index!, snippet: source.slice(match.index!, match.index! + match[0].length), label };
  }
  return undefined;
}

export function ensureFigurePackages(source: string, mode: InsertFigureSnippetOptions['mode']) {
  const code = manuscriptCode(source);
  const begin = /\\begin\s*\{document\}/.exec(code);
  if (!begin || !/\\documentclass\b/.test(code.slice(0, begin.index)) ||
      !/\\end\s*\{document\}/.test(code.slice(begin.index + begin[0].length))) {
    throw new Error('找不到完整论文主文件，不能为章节自动创建或套入另一篇论文。');
  }
  const preamble = code.slice(0, begin.index);
  const packages = [...preamble.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g)]
    .flatMap((match) => match[1].split(',').map((name) => name.trim()));
  const needed = mode === 'tikz_package' ? 'styles/agentikz-macros' : 'graphicx';
  const exists = packages.includes(needed) || (mode === 'tikz_package' && packages.includes('agentikz-macros'));
  if (exists) return source;
  const prefix = source.slice(0, begin.index);
  return `${prefix}${prefix && !prefix.endsWith('\n') ? '\n' : ''}\\usepackage{${needed}}\n\n${source.slice(begin.index)}`;
}

export function insertFigureAtSafePosition(source: string, snippet: string, cursor?: number | null) {
  const code = manuscriptCode(source);
  const begin = /\\begin\s*\{document\}/.exec(code);
  const end = /\\end\s*\{document\}/.exec(code);
  const bodyStart = begin ? begin.index + begin[0].length : 0;
  const bodyEnd = end?.index ?? source.length;
  let offset = bodyEnd;
  if (cursor != null && Number.isSafeInteger(cursor) && cursor >= bodyStart && cursor <= bodyEnd) {
    const nextLine = source.indexOf('\n', cursor);
    const candidate = cursor === 0 || source[cursor - 1] === '\n' ? cursor
      : nextLine >= 0 && nextLine < bodyEnd ? nextLine + 1 : bodyEnd;
    const prefix = code.slice(0, candidate);
    let braces = 0;
    for (const match of prefix.matchAll(/\\[{}\\]|[{}]/g)) {
      if (match[0] === '{') braces++;
      if (match[0] === '}') braces--;
    }
    const stack: string[] = [];
    for (const match of prefix.matchAll(/\\(begin|end)\s*\{([^{}]+)\}/g)) {
      if (match[1] === 'begin') stack.push(match[2]); else stack.pop();
    }
    const mathTokens = [...prefix.matchAll(/\\(?:\\|\$)|(\$\$|\$)|\\(\[|\]|\(|\))/g)].filter((match) => match[1] || match[2]);
    const inLiteral = [...maskLatexComments(source).matchAll(
      /\\begin\s*\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\s*\{\1\}/g,
    )].some((match) => candidate > match.index! && candidate < match.index! + match[0].length);
    if (!inLiteral && braces === 0 && stack.every((name) => name === 'document') && mathTokens.length % 2 === 0) offset = candidate;
  }
  const before = source.slice(0, offset);
  const after = source.slice(offset);
  const head = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = !after ? '\n' : after.startsWith('\n') ? '\n' : '\n\n';
  return { text: before + head + snippet + tail + after, offset: offset + head.length };
}
