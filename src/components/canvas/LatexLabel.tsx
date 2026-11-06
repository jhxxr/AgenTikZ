import React, { useMemo } from 'react';
import katex from 'katex';

interface LatexLabelProps {
  text: string;
  sublabel?: string;
  className?: string;
  fontSize?: number;
  color?: string;
}

const RAW_MATH_PATTERN =
  /\\(frac|sqrt|sum|prod|int|oplus|otimes|odot|times|div|pm|mp|cdot|downarrow|uparrow|leftarrow|rightarrow|to|mapsto|Rightarrow|Leftarrow|mathbf|mathcal|mathbb|mathrm|mathit|mathsf|mathtt|text|operatorname|hat|tilde|bar|vec|dot|ddot|overline|underline|left|right|langle|rangle|Vert|norm|sim|approx|equiv|le|ge|neq|in|notin|subset|subseteq|cup|cap|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|nabla|partial|infty|forall|exists|top|bot|ell|Re|Im|log|exp|sin|cos|tan|tanh|min|max|sup|inf|lim|arg)\b|[_^]\{|[a-zA-Z0-9]\^[a-zA-Z0-9\\]|[a-zA-Z0-9]_[a-zA-Z0-9\\]|\\\|/;

function renderKatexHtml(mathExpr: string, displayMode = false): string {
  const trimmed = mathExpr.trim();
  if (!trimmed) return '';
  try {
    return katex.renderToString(trimmed, {
      throwOnError: false,
      displayMode,
      output: 'html',
      strict: false,
    });
  } catch {
    return trimmed;
  }
}

/**
 * Replaces `\cmd{...}` with `<tag>...</tag>` while respecting nested `{}` braces.
 */
function replaceBracedCommand(
  input: string,
  cmd: string,
  openTag: string,
  closeTag: string,
  innerTransform: (inner: string) => string
): string {
  const token = `\\${cmd}`;
  let result = '';
  let i = 0;

  while (i < input.length) {
    const idx = input.indexOf(token, i);
    if (idx === -1) {
      result += input.slice(i);
      break;
    }
    const afterCmd = idx + token.length;
    // Ensure command boundary (next char is `{` or whitespace before `{`)
    let braceStart = afterCmd;
    while (braceStart < input.length && /\s/.test(input[braceStart])) {
      braceStart++;
    }
    if (input[braceStart] !== '{') {
      result += input.slice(i, afterCmd);
      i = afterCmd;
      continue;
    }
    // Find matching closing `}`
    let depth = 0;
    let braceEnd = -1;
    for (let j = braceStart; j < input.length; j++) {
      if (input[j] === '{' && input[j - 1] !== '\\') depth++;
      else if (input[j] === '}' && input[j - 1] !== '\\') {
        depth--;
        if (depth === 0) {
          braceEnd = j;
          break;
        }
      }
    }
    if (braceEnd === -1) {
      result += input.slice(i, afterCmd);
      i = afterCmd;
      continue;
    }
    result += input.slice(i, idx);
    const inner = input.slice(braceStart + 1, braceEnd);
    result += `${openTag}${innerTransform(inner)}${closeTag}`;
    i = braceEnd + 1;
  }
  return result;
}

function formatPlainTextSegment(segment: string): string {
  if (!segment) return '';
  let s = segment;

  // Unwrap font size / style groups like `{\scriptsize ...}`
  s = s.replace(
    /\{\s*\\(?:scriptsize|footnotesize|small|tiny|large|Large|bfseries|itshape)\b\s*([\s\S]*?)\}/g,
    '$1'
  );
  s = s.replace(
    /\\(?:scriptsize|footnotesize|small|tiny|large|Large|bfseries|itshape)\b\s*/g,
    ''
  );

  // Convert \textbf{...}, \textit{...}, \emph{...}, \texttt{...}
  s = replaceBracedCommand(s, 'textbf', '<strong>', '</strong>', formatPlainTextSegment);
  s = replaceBracedCommand(s, 'textit', '<em>', '</em>', formatPlainTextSegment);
  s = replaceBracedCommand(s, 'emph', '<em>', '</em>', formatPlainTextSegment);
  s = replaceBracedCommand(s, 'texttt', '<code>', '</code>', formatPlainTextSegment);

  // Unescape LaTeX special characters and spacing outside math
  s = s
    .replace(/\\&/g, '&amp;')
    .replace(/\\%/g, '%')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/\\\s+/g, ' ')
    .replace(/~/g, '\u00A0');

  return s;
}

/**
 * Renders mixed text and LaTeX math (`$...$`, `$$...$$`, `\(...\)`, or raw math) cleanly using KaTeX.
 */
export function renderMixedLatexToHtml(raw: string): string {
  if (!raw) return '';

  // Unwrap outer font-size group if present: `{\scriptsize ...}`
  let cleaned = raw.trim();
  const outerSizeMatch =
    /^\{\s*\\(?:scriptsize|footnotesize|small|tiny|large|Large|bfseries)\b\s*([\s\S]*)\}$/.exec(
      cleaned
    );
  if (outerSizeMatch) {
    cleaned = outerSizeMatch[1].trim();
  }
  cleaned = cleaned.replace(
    /\\(?:scriptsize|footnotesize|small|tiny|large|Large)\b\s*/g,
    ''
  );

  // Normalize `$$...$$`, `\[...\]`, `\(...\)` to `$...$`
  cleaned = cleaned
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr) => `$${expr}$`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, expr) => `$${expr}$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, expr) => `$${expr}$`);

  // If the string has no `$` delimiters at all, check if it is a raw math expression
  if (!cleaned.includes('$')) {
    const hasTextOnlyMacro = /\\(?:textbf|textit|emph|texttt)\s*\{/.test(cleaned);
    if (!hasTextOnlyMacro && RAW_MATH_PATTERN.test(cleaned)) {
      return renderKatexHtml(cleaned, false);
    }
    return formatPlainTextSegment(cleaned);
  }

  // Handle `\textbf{...}` or `\textit{...}` that might wrap `$...$`
  cleaned = replaceBracedCommand(
    cleaned,
    'textbf',
    '<strong>',
    '</strong>',
    renderMixedLatexToHtml
  );
  cleaned = replaceBracedCommand(
    cleaned,
    'textit',
    '<em>',
    '</em>',
    renderMixedLatexToHtml
  );

  // Split by `$...$` math segments
  const parts = cleaned.split(/(\$[^$]+\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
        const mathExpr = part.slice(1, -1);
        return renderKatexHtml(mathExpr, false);
      }
      return formatPlainTextSegment(part);
    })
    .join('');
}

export const LatexLabel: React.FC<LatexLabelProps> = ({
  text,
  sublabel,
  className = '',
  fontSize = 12.5,
  color = '#0F172A',
}) => {
  const mainHtml = useMemo(() => renderMixedLatexToHtml(text), [text]);
  const subHtml = useMemo(
    () => (sublabel ? renderMixedLatexToHtml(sublabel) : ''),
    [sublabel]
  );

  return (
    <div
      className={`flex flex-col items-center justify-center text-center leading-tight select-none pointer-events-none whitespace-nowrap ${className}`}
      style={{ color, fontSize: `${fontSize}px` }}
    >
      <span
        className="font-medium tracking-tight"
        dangerouslySetInnerHTML={{ __html: mainHtml }}
      />
      {subHtml && (
        <span
          className="text-[10.5px] text-slate-600 mt-0.5 opacity-90"
          dangerouslySetInnerHTML={{ __html: subHtml }}
        />
      )}
    </div>
  );
};
