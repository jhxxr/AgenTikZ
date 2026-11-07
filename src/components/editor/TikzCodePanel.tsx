import React, { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view';
import { StateEffect, StateField, Range } from '@codemirror/state';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { FULL_FIGURE_TEMPLATES } from '../../core/templates/dl-templates';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  FileCode,
  ShieldCheck,
} from 'lucide-react';

export function buildStandaloneLatexDocument(
  tikzCode: string,
  themeId: keyof typeof JOURNAL_THEMES
): string {
  const allPreambleColors = Object.values(JOURNAL_THEMES)
    .map((t) => t.tikzPreambleColors)
    .join('\n');

  // Hoist any inline #RRGGBB hex color specs (e.g. color=#2B5B84 in \addplot)
  // to valid xcolor \definecolor{hex_RRGGBB}{HTML}{RRGGBB} definitions
  const hexColors = new Set<string>();
  const sanitizedTikz = tikzCode
    .replace(/#([0-9a-fA-F]{6})\b/g, (_m, hex: string) => {
      const upper = hex.toUpperCase();
      hexColors.add(upper);
      return `hex_${upper}`;
    })
    .replace(
      /every node\/\.style=\{font=\\small\}/g,
      'every node/.style={font=\\small, align=center}'
    );

  const customHexDefs = Array.from(hexColors)
    .map((hex) => `\\definecolor{hex_${hex}}{HTML}{${hex}}`)
    .join('\n');

  const hasCjk = /[\u4e00-\u9fff]/.test(tikzCode);
  const cjkPreamble = hasCjk
    ? '\\IfFileExists{ctex.sty}{\\usepackage[UTF8]{ctex}}{}'
    : '';

  return [
    '\\documentclass[border=4pt]{standalone}',
    cjkPreamble,
    '\\usepackage{tikz}',
    '\\usepackage{pgfplots}',
    '\\usepackage{graphicx}',
    '\\usepackage{amsmath,amssymb}',
    '\\pgfplotsset{',
    '  compat=1.18,',
    '  id/.code={},',
    '  chart_type/.code={},',
    '  subcaption/.code={},',
    '  title_offset/.code={},',
    '  xlabel_offset/.code={},',
    '  ylabel_offset/.code={},',
    '  legend_scale/.code={},',
    '  legend/.code={}',
    '}',
    '\\usepgfplotslibrary{statistics}',
    '\\usetikzlibrary{arrows.meta,positioning,calc,fit,backgrounds,shapes.geometric}',
    '',
    `% --- Publication Theme Color Palette (${JOURNAL_THEMES[themeId].venueBadge}) ---`,
    allPreambleColors,
    customHexDefs,
    '',
    '% --- AgenTikZ Semantic Attribute Keys & Default Node Styles ---',
    '\\tikzset{',
    '  every node/.append style={align=center},',
    '  subtype/.code={},',
    '  depth/.code={},',
    '  channels/.code={},',
    '  sublabel/.code={},',
    '  dl_block/.style={draw=nips_blue!85!black, fill=nips_blue!14, rounded corners=2.5pt, line width=0.7pt, minimum width=2.8cm, minimum height=0.82cm, align=center},',
    '  mha_block/.style={draw=nips_amber!85!black, fill=nips_amber!16, rounded corners=2.5pt, line width=0.75pt, minimum width=3.0cm, minimum height=0.92cm, align=center},',
    '  addnorm_block/.style={draw=nips_sage!85!black, fill=nips_sage!15, rounded corners=2.0pt, line width=0.65pt, minimum width=2.8cm, minimum height=0.65cm, align=center},',
    '  conv_block/.style={draw=cvpr_teal!85!black, fill=cvpr_teal!14, rounded corners=2.0pt, line width=0.7pt, minimum width=2.6cm, minimum height=0.85cm, align=center},',
    '  feature_cube/.style={draw=cvpr_navy!85!black, fill=cvpr_navy!14, line width=0.7pt, minimum width=1.2cm, minimum height=2.0cm, align=center},',
    '  op_circle/.style={circle, draw=nips_slate!85!black, fill=white, line width=0.7pt, minimum size=0.6cm, inner sep=1pt, align=center},',
    '  stage_box/.style={draw=nips_slate!55, fill=nips_slate!5, dashed, rounded corners=4pt, line width=0.65pt, align=center},',
    '  subcaption/.style={draw=none, fill=none, align=center}',
    '}',
    '',
    '\\begin{document}',
    sanitizedTikz,
    '\\end{document}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function buildPaperFigureEnvironment(
  tikzCode: string,
  caption: string,
  label: string
): string {
  return [
    '\\begin{figure}[t]',
    '  \\centering',
    tikzCode,
    `  \\caption{${caption}}`,
    `  \\label{${label}}`,
    '\\end{figure}',
  ].join('\n');
}

interface HighlightPayload {
  lineRange: { startLine: number; endLine: number } | null;
  valueSpan?: { from: number; to: number };
}

const setTikzHighlightEffect = StateEffect.define<HighlightPayload>();

const selectedLineDeco = Decoration.line({
  attributes: { class: 'cm-tikz-selected-line' },
});

const changedValueMarkDeco = Decoration.mark({
  class: 'cm-tikz-changed-value',
});

const tikzHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setTikzHighlightEffect)) {
        const { lineRange, valueSpan } = effect.value;
        const ranges: Range<Decoration>[] = [];
        const doc = tr.state.doc;

        if (lineRange) {
          const startL = Math.max(1, Math.min(doc.lines, lineRange.startLine));
          const endL = Math.max(startL, Math.min(doc.lines, lineRange.endLine));
          for (let l = startL; l <= endL; l++) {
            const lineObj = doc.line(l);
            ranges.push(selectedLineDeco.range(lineObj.from));
          }
        }

        if (
          valueSpan &&
          valueSpan.from >= 0 &&
          valueSpan.to > valueSpan.from &&
          valueSpan.to <= doc.length
        ) {
          ranges.push(
            changedValueMarkDeco.range(valueSpan.from, valueSpan.to)
          );
        }

        ranges.sort((a, b) => a.from - b.from);
        decos = Decoration.set(ranges, true);
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Reusable live code snippet viewer that highlights the active module's TikZ lines
 * and flashes the exact numerical value span being changed in real time.
 */
export const LiveCodeSyncBanner: React.FC<{
  compact?: boolean;
  onExpandCodeTab?: () => void;
}> = ({ compact = false, onExpandCodeTab }) => {
  const { tikzCode, highlightedLineRange, lastChangeInfo, selectedIds } =
    useWorkspaceStore();

  const lines = useMemo(() => tikzCode.split('\n'), [tikzCode]);

  // Compute line start offsets so we can highlight `valueSpan` inside the snippet
  const lineOffsets = useMemo(() => {
    const offs: number[] = [0];
    for (let i = 0; i < lines.length; i++) {
      offs.push(offs[i] + lines[i].length + 1);
    }
    return offs;
  }, [lines]);

  const activeRange = lastChangeInfo?.lineRange || highlightedLineRange;
  if (!activeRange) return null;

  const startLine = Math.max(1, activeRange.startLine);
  const endLine = Math.min(lines.length, activeRange.endLine);

  const vSpan = lastChangeInfo?.valueSpan;

  const renderLineWithHighlight = (lineText: string, lineNumber1Based: number) => {
    const lineStartOffset = lineOffsets[lineNumber1Based - 1] ?? 0;
    const lineEndOffset = lineStartOffset + lineText.length;

    if (
      vSpan &&
      vSpan.from < lineEndOffset &&
      vSpan.to > lineStartOffset
    ) {
      const relStart = Math.max(0, vSpan.from - lineStartOffset);
      const relEnd = Math.min(lineText.length, vSpan.to - lineStartOffset);
      const before = lineText.slice(0, relStart);
      const mid = lineText.slice(relStart, relEnd);
      const after = lineText.slice(relEnd);
      return (
        <>
          <span>{before}</span>
          <span className="bg-amber-200 text-amber-950 font-bold px-1 py-0.2 rounded ring-1 ring-amber-400 shadow-2xs">
            {mid}
          </span>
          <span>{after}</span>
        </>
      );
    }
    return <span>{lineText}</span>;
  };

  const snippetLines: Array<{ num: number; text: string }> = [];
  const maxLinesToShow = compact ? 4 : 5;
  for (
    let l = startLine;
    l <= Math.min(endLine, startLine + maxLinesToShow - 1);
    l++
  ) {
    snippetLines.push({ num: l, text: lines[l - 1] || '' });
  }

  return (
    <div className="bg-blue-50/40 border-b border-blue-200/80 px-2.5 py-2 space-y-1.5">
      {/* Header Row: Active Module + Old -> New Value Pill */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-white font-mono font-semibold text-[10px]">
            <Activity className="w-2.5 h-2.5" />
            {lastChangeInfo?.elementId || selectedIds[0] || '模块'}
          </span>
          <span className="text-slate-600 font-medium">
            {lastChangeInfo ? lastChangeInfo.fieldLabel : '当前选中源码行'}
          </span>
          <span className="text-[10px] font-mono text-blue-700 bg-blue-100/80 px-1 rounded">
            L{startLine}
            {endLine > startLine ? `-L${endLine}` : ''}
          </span>
        </div>

        {lastChangeInfo && (
          <div className="flex items-center gap-1 text-[10.5px] font-mono bg-white px-2 py-0.5 rounded border border-amber-300 shadow-2xs">
            {lastChangeInfo.oldValue &&
              lastChangeInfo.oldValue !== lastChangeInfo.newValue && (
                <>
                  <span className="text-slate-400 line-through">
                    {lastChangeInfo.oldValue}
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                </>
              )}
            <span className="font-bold text-amber-800 bg-amber-100 px-1 rounded">
              {lastChangeInfo.newValue}
            </span>
          </div>
        )}
      </div>

      {/* Live Highlighted Code Block Preview */}
      <div className="rounded-md bg-white border border-blue-200/90 overflow-x-auto font-mono text-[11px] leading-relaxed shadow-2xs">
        {snippetLines.map((ln) => (
          <div
            key={ln.num}
            className="flex items-baseline px-2 py-0.5 bg-blue-50/35 border-l-2 border-blue-600"
          >
            <span className="w-7 text-[10px] text-blue-600 font-semibold select-none shrink-0">
              {ln.num}
            </span>
            <pre className="text-slate-800 whitespace-pre">
              {renderLineWithHighlight(ln.text, ln.num)}
            </pre>
          </div>
        ))}
      </div>

      {compact && onExpandCodeTab && (
        <div className="flex justify-end">
          <button
            onClick={onExpandCodeTab}
            className="text-[10.5px] text-blue-600 hover:underline font-medium cursor-pointer"
          >
            切换到完整 TikZ 代码面板查看 →
          </button>
        </div>
      )}
    </div>
  );
};

export const TikzCodePanel: React.FC = () => {
  const {
    tikzCode,
    parsedDoc,
    activeThemeId,
    activeTemplateId,
    selectedIds,
    highlightedLineRange,
    lastChangeInfo,
    setTikzCode,
    setSelectedIds,
    loadTemplate,
  } = useWorkspaceStore();
  const { codeFontSize, showLineNumbers } = useSettingsStore();

  const [copiedMode, setCopiedMode] = useState<'tikz' | 'standalone' | null>(
    null
  );
  const editorViewRef = useRef<EditorView | null>(null);

  const handleCopy = async (mode: 'tikz' | 'standalone') => {
    const text =
      mode === 'tikz'
        ? tikzCode
        : buildStandaloneLatexDocument(tikzCode, activeThemeId);
    await navigator.clipboard.writeText(text);
    setCopiedMode(mode);
    setTimeout(() => setCopiedMode(null), 1800);
  };

  // Dispatch highlight decoration & auto-scroll whenever highlightedLineRange or lastChangeInfo updates
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const activeLineRange = lastChangeInfo?.lineRange || highlightedLineRange;
    const valueSpan = lastChangeInfo?.valueSpan;

    view.dispatch({
      effects: setTikzHighlightEffect.of({
        lineRange: activeLineRange,
        valueSpan,
      }),
    });

    if (activeLineRange) {
      const doc = view.state.doc;
      const targetLine = Math.max(
        1,
        Math.min(doc.lines, activeLineRange.startLine)
      );
      const linePos = doc.line(targetLine).from;
      view.dispatch({
        effects: EditorView.scrollIntoView(linePos, { y: 'center' }),
      });
    }
  }, [tikzCode, highlightedLineRange, lastChangeInfo]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Code Panel Header Bar + Quick Template Switcher */}
      <div className="px-2.5 py-1.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
          <select
            value={activeTemplateId}
            onChange={(e) => {
              if (window.confirm('将用内置模板替换当前画布，可撤销。继续吗？')) {
                loadTemplate(e.target.value);
              }
            }}
            className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-medium truncate max-w-[205px] focus:outline-none focus:border-blue-500 cursor-pointer"
            title="主动载入内置模板（替换当前画布）"
          >
            <option value="" disabled>自主绘图 · 可选择快速模板</option>
            {FULL_FIGURE_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                [{tpl.venue}] {tpl.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleCopy('tikz')}
            className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
            title="仅复制 \\begin{tikzpicture}...\\end{tikzpicture} 片段"
          >
            {copiedMode === 'tikz' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3 text-slate-500" />
            )}
            <span>TikZ</span>
          </button>
          <button
            onClick={() => handleCopy('standalone')}
            className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
            title="复制包含导言区与色彩定义的完整可编译 standalone .tex 文档"
          >
            {copiedMode === 'standalone' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <FileCode className="w-3 h-3 text-slate-500" />
            )}
            <span>完整 .tex</span>
          </button>
        </div>
      </div>

      {/* Live Changing Module & Value Diff Banner */}
      <LiveCodeSyncBanner />

      {/* Quick Element-to-Line Jump Pills */}
      {parsedDoc.elements.length > 0 && (
        <div className="px-2.5 py-1.5 border-b border-slate-100 bg-white flex items-center gap-1 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-slate-400 shrink-0 mr-1">
            模块定位:
          </span>
          {parsedDoc.elements.slice(0, 14).map((el) => {
            const active = selectedIds.includes(el.id);
            return (
              <button
                key={el.id}
                onClick={() => setSelectedIds([el.id])}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {el.id}:L{el.span.startLine}
              </button>
            );
          })}
        </div>
      )}

      {/* CodeMirror 6 Light Mode Editor with Line & Value Span Highlighting */}
      <div className="flex-1 overflow-auto text-xs">
        <CodeMirror
          value={tikzCode}
          height="100%"
          theme="light"
          onCreateEditor={(view) => {
            editorViewRef.current = view;
          }}
          basicSetup={{
            lineNumbers: showLineNumbers,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
          }}
          extensions={[
            tikzHighlightField,
            EditorView.lineWrapping,
            EditorView.theme({
              '&': {
                backgroundColor: '#FFFFFF',
                fontSize: `${codeFontSize}px`,
              },
              '.cm-content': {
                fontFamily:
                  '"JetBrains Mono", "Fira Code", Consolas, monospace',
                padding: '8px 0',
              },
              '.cm-gutters': {
                backgroundColor: '#F8FAFC',
                color: '#94A3B8',
                borderRight: '1px solid #F1F5F9',
              },
              '.cm-tikz-selected-line': {
                backgroundColor: '#EFF6FF !important',
                boxShadow: 'inset 3px 0 0 0 #2563EB',
              },
              '.cm-tikz-changed-value': {
                backgroundColor: '#FEF08A',
                color: '#92400E',
                fontWeight: '700',
                borderRadius: '3px',
                padding: '1px 3px',
                outline: '1.5px solid #F59E0B',
              },
            }),
          ]}
          onChange={(val) => setTikzCode(val, true)}
        />
      </div>
    </div>
  );
};
