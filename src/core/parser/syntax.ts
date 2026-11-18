import { maskLatexComments } from '../tex/source';

const commandPattern = /\\([a-zA-Z]+|[^\r\n])/y;

/** A bounded cursor: a malformed statement cannot consume the next statement. */
export class TikzCursor {
  i = 0;
  limit: number;
  constructor(readonly text: string) { this.limit = text.length; }
  space() { while (this.i < this.limit && /\s/.test(this.text[this.i])) this.i++; }
  command(): string {
    commandPattern.lastIndex = this.i;
    const match = commandPattern.exec(this.text);
    if (!match || commandPattern.lastIndex > this.limit) throw new Error('Expected command');
    this.i = commandPattern.lastIndex;
    return match[1];
  }
  group(open = '{', close = '}'): string {
    this.space();
    if (this.i >= this.limit || this.text[this.i] !== open) throw new Error(`Expected ${open}`);
    const start = ++this.i;
    let depth = 1, braces = 0;
    while (this.i < this.limit) {
      const ch = this.text[this.i++];
      // Escaped delimiters and \\ are TeX tokens, not nesting delimiters.
      if (ch === '\\' && /[{}\[\]()%\\]/.test(this.text[this.i] || '')) { this.i++; continue; }
      if (open !== '{') {
        if (ch === '{') braces++;
        if (ch === '}') braces--;
        if (braces) continue;
      }
      if (ch === open) depth++;
      if (ch === close && --depth === 0) return this.text.slice(start, this.i - 1);
    }
    throw new Error(`Unclosed ${open}${close} group`);
  }
}

export interface TikzStatement { command: string; start: number; end: number; environment?: string }
const paths = new Set(['node', 'draw', 'path', 'fill', 'filldraw', 'clip', 'shade', 'shadedraw', 'coordinate', 'useasboundingbox', 'addplot', 'pic']);
const boundaries = new Set([...paths, 'begin', 'end', 'tikzset', 'definecolor', 'colorlet', 'foreach',
  'newcommand', 'renewcommand', 'providecommand', 'def']);
const environmentPattern = /\s*\{\s*([\w*.-]+)\s*\}/y;

/** Lossless statement boundaries. Comments are masked, never removed from source. */
export function scanTikzStatements(source: string): TikzStatement[] {
  const text = maskLatexComments(source);
  const result: TikzStatement[] = [];
  const c = new TikzCursor(text);
  while (c.i < text.length) {
    c.space();
    if (text[c.i] !== '\\') { c.i++; continue; }
    const start = c.i;
    if (c.i + 1 >= text.length || /[\r\n]/.test(text[c.i + 1])) {
      result.push({ command: '', start, end: ++c.i });
      continue;
    }
    const command = c.command();
    let environment: string | undefined;
    if (command === 'begin' || command === 'end') {
      environmentPattern.lastIndex = c.i;
      const match = environmentPattern.exec(text);
      if (match) {
        environment = match[1];
        c.i = environmentPattern.lastIndex;
        const headerEnd = c.i;
        c.space();
        if (command === 'end' || text[c.i] !== '[') {
          result.push({ command, start, end: headerEnd, environment });
          continue;
        }
      }
    }
    let definitionName = ['def', 'gdef', 'edef', 'newcommand', 'renewcommand', 'providecommand'].includes(command);
    let braces = 0, brackets = 0, parens = 0;
    let recovery: number | undefined;
    while (c.i < text.length) {
      const ch = text[c.i];
      if (ch === '\\') {
        if (/[{}\[\]()%\\]/.test(text[c.i + 1] || '')) { c.i += 2; continue; }
        if (definitionName && !braces && !brackets && !parens && /[a-zA-Z]/.test(text[c.i + 1] || '')) {
          c.command(); definitionName = false; continue;
        }
        // A new command at top level, or at the start of a line after broken
        // nesting, is a recovery boundary. Commands inside labels stay opaque.
        if (!braces && !brackets && !parens) break;
        if (recovery === undefined) {
          commandPattern.lastIndex = c.i;
          const next = commandPattern.exec(text)?.[1];
          if (next && boundaries.has(next) && text.slice(text.lastIndexOf('\n', c.i - 1) + 1, c.i).trim() === '') {
            recovery = c.i;
          }
        }
      }
      if (ch === '{') { braces++; definitionName = false; }
      else if (ch === '}') braces = Math.max(0, braces - 1);
      else if (!braces) {
        if (ch === '[') brackets++;
        else if (ch === ']') brackets = Math.max(0, brackets - 1);
        else if (ch === '(') parens++;
        else if (ch === ')') parens = Math.max(0, parens - 1);
        else if (ch === ';' && !brackets && !parens) { c.i++; break; }
      }
      c.i++;
      if (environment && ch === ']' && !braces && !brackets && !parens) break;
    }
    if ((braces || brackets || parens) && recovery !== undefined) c.i = recovery;
    let end = c.i;
    while (end > start && /\s/.test(text[end - 1])) end--;
    result.push({ command, start, end, environment });
  }
  return result;
}

/** Match scopes without letting a missing inner closer swallow the enclosing picture. */
export function indexTikzEnvironments(statements: TikzStatement[]): Map<number, TikzStatement> {
  const closes = new Map<number, TikzStatement>();
  const stack: TikzStatement[] = [];
  for (const statement of statements) {
    if (!statement.environment) continue;
    if (statement.command === 'begin') stack.push(statement);
    else {
      let index = stack.length - 1;
      while (index >= 0 && stack[index].environment !== statement.environment) index--;
      if (index < 0) continue;
      closes.set(stack[index].start, statement);
      stack.length = index;
    }
  }
  return closes;
}
