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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    return escapeHtml(trimmed);
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

function replaceFormattingCommands(input: string): string {
  let s = input;
  s = replaceBracedCommand(s, 'textbf', '<strong>', '</strong>', replaceFormattingCommands);
  s = replaceBracedCommand(s, 'textit', '<em>', '</em>', replaceFormattingCommands);
  s = replaceBracedCommand(s, 'emph', '<em>', '</em>', replaceFormattingCommands);
  s = replaceBracedCommand(s, 'texttt', '<code>', '</code>', replaceFormattingCommands);
  return s;
}

function formatPlainTextSegment(segment: string): string {
  if (!segment) return '';
  let s = segment;

  // Unwrap innermost font size / style groups like `{\scriptsize ...}`
  s = s.replace(
    /\{\s*\\(?:scriptsize|footnotesize|small|tiny|large|Large|bfseries|itshape)\b\s*([^{}]*)\}/g,
    '$1'
  );

  // Unescape LaTeX special characters and spacing outside math, then escape raw HTML
  s = s
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/\\\s+/g, ' ')
    .replace(/~/g, '\u00A0');

  s = escapeHtml(s);

  // Convert \textbf{...}, \textit{...}, \emph{...}, \texttt{...}
  s = replaceFormattingCommands(s);

  // Clean up any remaining outer font size / style groups or switches
  s = s.replace(
    /\{\s*\\(?:scriptsize|footnotesize|small|tiny|large|Large|bfseries|itshape)\b\s*([\s\S]*?)\}/g,
    '$1'
  );
  s = s.replace(
    /\\(?:scriptsize|footnotesize|small|tiny|large|Large|bfseries|itshape)\b\s*/g,
    ''
  );

  return s;
}

/**
 * Renders mixed text and LaTeX math (`$...$`, `$$...$$`, `\(...\)`, or raw math) cleanly using KaTeX.
 */
export function renderMixedLatexToHtml(raw: string): string {
  if (!raw) return '';

  // Strip null characters so placeholder tokens cannot collide with input
  let cleaned = raw.replace(/\u0000/g, '').trim();

  // Unwrap outer font-size group if present: `{\scriptsize ...}`
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
    const hasHtmlTagLike = /<\/?[a-zA-Z][a-zA-Z0-9]*[\s/>]/.test(cleaned);
    if (!hasTextOnlyMacro && !hasHtmlTagLike && RAW_MATH_PATTERN.test(cleaned)) {
      return renderKatexHtml(cleaned, false);
    }
    return formatPlainTextSegment(cleaned);
  }

  // Tokenize `$...$` math segments into placeholders before formatting and HTML-escaping plain text
  const mathPlaceholders: string[] = [];
  const withPlaceholders = cleaned.replace(/\$([^$]+)\$/g, (_match, mathExpr: string) => {
    const idx = mathPlaceholders.length;
    mathPlaceholders.push(renderKatexHtml(mathExpr, false));
    return `\u0000MATH_${idx}\u0000`;
  });

  const formatted = formatPlainTextSegment(withPlaceholders);

  return formatted.replace(/\u0000MATH_(\d+)\u0000/g, (_match, idxStr: string) => {
    return mathPlaceholders[Number(idxStr)] ?? '';
  });
}

export const LatexLabel = React.memo(function LatexLabel({
  text,
  sublabel,
  className = '',
  fontSize = 12.5,
  color = '#0F172A',
}: LatexLabelProps) {
  const mainHtml = useMemo(() => renderMixedLatexToHtml(text), [text]);
  const subHtml = useMemo(
    () => (sublabel ? renderMixedLatexToHtml(sublabel) : ''),
    [sublabel]
  );

  return (
    <div
      data-latex-root="true"
      className={`flex flex-col items-center justify-center text-center leading-tight select-none pointer-events-none whitespace-nowrap ${className}`}
      style={{ color, fontSize: `${fontSize}px` }}
    >
      <span
        data-latex-line="true"
        className="font-medium tracking-tight"
        dangerouslySetInnerHTML={{ __html: mainHtml }}
      />
      {subHtml && (
        <span
          data-latex-line="true"
          className="text-[10.5px] text-slate-600 mt-0.5 opacity-90"
          dangerouslySetInnerHTML={{ __html: subHtml }}
        />
      )}
    </div>
  );
});
