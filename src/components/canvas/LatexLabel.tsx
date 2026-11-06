import React, { useMemo } from 'react';
import katex from 'katex';

interface LatexLabelProps {
  text: string;
  sublabel?: string;
  className?: string;
  fontSize?: number;
  color?: string;
}

/**
 * Renders mixed text and LaTeX math (`$...$`) cleanly using KaTeX.
 */
function renderMixedLatexToHtml(raw: string): string {
  if (!raw) return '';
  // Unescape TikZ `\&` or `\%` outside math
  const cleaned = raw
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>')
    .replace(/\\scriptsize\b/g, '')
    .replace(/\\footnotesize\b/g, '');

  // If the entire string looks like raw math without `$` but has `\oplus`, `\times`, etc.
  if (!cleaned.includes('$') && /\\(oplus|otimes|times|downarrow|uparrow|mathbf|mathcal|hat|top)/.test(cleaned)) {
    try {
      return katex.renderToString(cleaned, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return cleaned;
    }
  }

  // Split by `$...$` segments
  const parts = cleaned.split(/(\$[^$]+\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
        const mathExpr = part.slice(1, -1);
        try {
          return katex.renderToString(mathExpr, {
            throwOnError: false,
            displayMode: false,
          });
        } catch {
          return mathExpr;
        }
      }
      return part;
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
      className={`flex flex-col items-center justify-center text-center leading-tight select-none pointer-events-none ${className}`}
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
