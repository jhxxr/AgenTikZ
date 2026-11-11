import React, { useMemo } from 'react';
import katex from 'katex';
import { Check, Copy } from 'lucide-react';
import { copyText, isDesktop, useFlash } from './agent-ui';

/**
 * A deliberately small Markdown renderer for agent replies.
 *
 * Model output is rendered as React elements, never as an HTML string (the
 * one exception is KaTeX's own output, see MathSpan), so a reply cannot inject
 * markup. It also tolerates half-written input because it re-runs on every
 * streamed chunk: an unterminated code fence simply runs to the end.
 */

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' };

const FENCE = /^\s{0,3}(```+|~~~+)\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s{0,6}[-*+•]\s+(.*)$/;
const ORDERED = /^\s{0,6}(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const body: string[] = [];
      index++;
      while (index < lines.length && !(lines[index].trim().startsWith(marker.repeat(3)) && FENCE.test(lines[index]))) {
        body.push(lines[index]);
        index++;
      }
      index++;
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index++; continue; }
    if (RULE.test(line)) { blocks.push({ type: 'rule' }); index++; continue; }

    if (line.includes('|') && index + 1 < lines.length && TABLE_DIVIDER.test(lines[index + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitRow(lines[index]));
        index++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const pattern = ordered ? ORDERED : BULLET;
      const start = ordered ? Number(ORDERED.exec(line)![1]) : 1;
      const items: string[] = [];
      while (index < lines.length) {
        const match = pattern.exec(lines[index]);
        if (match) { items.push(match[ordered ? 2 : 1]); index++; continue; }
        // An indented continuation line belongs to the previous item.
        if (items.length && /^\s{2,}\S/.test(lines[index]) && !BULLET.test(lines[index]) && !ORDERED.test(lines[index])) {
          items[items.length - 1] += `\n${lines[index].trim()}`;
          index++;
          continue;
        }
        break;
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) { quoted.push(QUOTE.exec(lines[index])![1]); index++; }
      blocks.push({ type: 'quote', lines: quoted });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !FENCE.test(lines[index]) && !HEADING.test(lines[index]) &&
        !RULE.test(lines[index]) && !BULLET.test(lines[index]) && !ORDERED.test(lines[index]) && !QUOTE.test(lines[index])) {
      paragraph.push(lines[index]);
      index++;
    }
    blocks.push({ type: 'paragraph', lines: paragraph });
  }
  return blocks;
}

// Order matters: code spans first so their contents are never re-interpreted, then math
// (so `a_i * b_i` inside a formula is not read as emphasis). The `$` guards keep prices
// such as "$5 and $10" as plain text.
const INLINE = new RegExp([
  '(?<tick>`+)(?<code>[^`]|[^`][\\s\\S]*?[^`])\\k<tick>(?!`)',
  '\\$\\$(?<display>[^$]+?)\\$\\$',
  '(?<![\\\\$\\w])\\$(?<math>[^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?![\\d$])',
  '\\\\\\((?<paren>[^\\n]+?)\\\\\\)',
  '\\*\\*(?<bold>[^\\s*](?:[\\s\\S]*?[^\\s*])?)\\*\\*',
  '(?<![\\w*])\\*(?<em>[^\\s*](?:[^*]*?[^\\s*])?)\\*(?![\\w*])',
  '\\[(?<label>[^\\]\\n]+)\\]\\((?<url>[^)\\s]+)\\)',
].join('|'), 'g');

function safeUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The single place that injects an HTML string: KaTeX's own output, which it
 * builds from escaped input with `trust` off (no \href, \url or raw HTML).
 * Anything KaTeX cannot parse falls back to the literal source text.
 */
const MathSpan: React.FC<{ tex: string; display?: boolean; source: string }> = ({ tex, display, source }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: true, displayMode: !!display, output: 'html', strict: false, trust: false });
    } catch {
      return undefined;
    }
  }, [tex, display]);
  if (html === undefined) return <>{source}</>;
  return <span className={display ? 'block overflow-x-auto py-1' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
};

const ExternalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => {
  const [copied, flash] = useFlash();
  // The desktop webview has no browser chrome: navigating it away would replace the app.
  const desktop = isDesktop();
  return (
    <a href={href} target="_blank" rel="noreferrer noopener"
      title={desktop ? (copied ? '已复制链接' : `点击复制链接：${href}`) : href}
      onClick={(event) => {
        if (!desktop) return;
        event.preventDefault();
        void copyText(href).then((ok) => { if (ok) flash(); });
      }}
      className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600 break-all cursor-pointer">
      {children}{copied && <span className="ml-1 text-[10px] text-emerald-600 no-underline">已复制</span>}
    </a>
  );
};

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let count = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const key = `${keyPrefix}-${count++}`;
    const group = match.groups ?? {};
    if (group.code !== undefined) {
      nodes.push(<code key={key} className="rounded bg-slate-100 px-1 py-px font-mono text-[0.92em] text-slate-800 break-words">{group.code}</code>);
    } else if (group.display !== undefined) {
      nodes.push(<MathSpan key={key} tex={group.display} display source={match[0]} />);
    } else if (group.math !== undefined || group.paren !== undefined) {
      nodes.push(<MathSpan key={key} tex={group.math ?? group.paren} source={match[0]} />);
    } else if (group.bold !== undefined) {
      nodes.push(<strong key={key} className="font-semibold text-slate-900">{renderInline(group.bold, key)}</strong>);
    } else if (group.em !== undefined) {
      nodes.push(<em key={key}>{renderInline(group.em, key)}</em>);
    } else {
      const href = safeUrl(group.url);
      nodes.push(href ? <ExternalLink key={key} href={href}>{group.label}</ExternalLink> : match[0]);
    }
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderLines(lines: string[], keyPrefix: string): React.ReactNode[] {
  return lines.flatMap((line, index) => [
    ...(index ? [<br key={`${keyPrefix}-br-${index}`} />] : []),
    ...renderInline(line, `${keyPrefix}-${index}`),
  ]);
}

const CodeBlock: React.FC<{ lang: string; text: string }> = ({ lang, text }) => {
  const [copied, flash] = useFlash();
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-100/70 px-2.5 py-1">
        <span className="font-mono text-[10.5px] text-slate-500">{lang || 'text'}</span>
        <button type="button" onClick={() => void copyText(text).then((ok) => { if (ok) flash(); })}
          className="inline-flex items-center gap-1 rounded px-1 text-[10.5px] text-slate-500 hover:text-slate-900 cursor-pointer">
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-slate-800"><code>{text}</code></pre>
    </div>
  );
};

const HEADING_CLASS: Record<number, string> = {
  1: 'text-[15px] font-semibold text-slate-900',
  2: 'text-[14px] font-semibold text-slate-900',
  3: 'text-[13px] font-semibold text-slate-900',
};

export const Markdown: React.FC<{ source: string; className?: string }> = React.memo(({ source, className }) => {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`min-w-0 space-y-2 break-words ${className ?? ''}`}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case 'heading':
            return <div key={key} role="heading" aria-level={block.level}
              className={`${HEADING_CLASS[block.level] ?? 'text-[13px] font-semibold text-slate-800'} pt-1 first:pt-0`}>
              {renderInline(block.text, key)}
            </div>;
          case 'code':
            return <CodeBlock key={key} lang={block.lang} text={block.text} />;
          case 'list': {
            const items = block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-0.5">{renderLines(item.split('\n'), `${key}-${itemIndex}`)}</li>
            ));
            return block.ordered
              ? <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-slate-400">{items}</ol>
              : <ul key={key} className="list-disc space-y-1 pl-5 marker:text-slate-400">{items}</ul>;
          }
          case 'quote':
            return <blockquote key={key} className="border-l-2 border-slate-300 pl-3 text-slate-600">
              {renderLines(block.lines, key)}
            </blockquote>;
          case 'table':
            return <div key={key} className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>{block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} className="border-b border-slate-200 px-2 py-1 font-semibold">{renderInline(cell, `${key}-h${cellIndex}`)}</th>
                  ))}</tr>
                </thead>
                <tbody>{block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-2 py-1 align-top">{renderInline(cell, `${key}-${rowIndex}-${cellIndex}`)}</td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>;
          case 'rule':
            return <hr key={key} className="border-slate-200" />;
          default:
            return <p key={key}>{renderLines(block.lines, key)}</p>;
        }
      })}
    </div>
  );
});
Markdown.displayName = 'Markdown';
