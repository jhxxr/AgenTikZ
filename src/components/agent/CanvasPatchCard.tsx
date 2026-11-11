import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, Code2, Eye, GitCompare, Image as ImageIcon, Loader2, PenLine, Undo2, Wand2, X } from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { getPaperWorkspaceVersion, useProjectStore } from '../../store/useProjectStore';
import { currentCanvasTarget, proposalConflict, sameCanvas } from '../../core/mcp/context';
import { parseTikzDocument } from '../../core/parser/parser';
import { generateScientificIllustration } from '../../core/agent/illustration-prompt';
import type { TikzPatchProposal } from '../../types/acp';
import { DiffStats, DiffView } from './DiffView';

type View = 'diff' | 'code' | 'preview';

const STATUS: Record<TikzPatchProposal['status'], { label: string; className: string }> = {
  pending: { label: '待审核', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  applied: { label: '已应用', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: '已忽略', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/** A reviewable TikZ change, applied manually or immediately by auto mode. */
export const CanvasPatchCard: React.FC<{ messageId: string; patch: TikzPatchProposal }> = ({ messageId, patch }) => {
  const { apply, revert, reject, restore, visualReviewEnabled, isStreaming } = useAgentStore(useShallow((s) => ({
    apply: s.applyPatchProposal, revert: s.revertPatchProposal,
    reject: s.rejectPatchProposal, restore: s.restorePatchProposal,
    visualReviewEnabled: s.visualReviewEnabled, isStreaming: s.isStreaming,
  })));
  // Subscribed only so the conflict check below re-runs when the canvas moves on.
  useWorkspaceStore(useShallow((s) => ({ code: s.tikzCode, revision: s.sourceRevision })));
  useProjectStore(useShallow((s) => ({ dir: s.projectDir, canvas: s.activeCanvasFileName })));
  const setLeftTab = useWorkspaceStore((s) => s.setLeftTab);
  const imageProvider = useSettingsStore((s) => s.imageGenProvider);
  const openSettings = useSettingsStore((s) => s.openSettings);

  const diffLines = patch.diffLines ?? [];
  const [view, setView] = useState<View | null>(diffLines.length ? 'diff' : null);
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState<{ tone: 'info' | 'ok' | 'error'; text: string } | null>(null);
  const directives = useMemo(() => parseTikzDocument(patch.newTikzCode).imageDirectives ?? [], [patch.newTikzCode]);

  const applied = patch.status === 'applied';
  const rejected = patch.status === 'rejected';
  const conflict = rejected ? undefined : proposalConflict(patch, applied);
  const onOtherCanvas = !!patch.targetCanvas && !sameCanvas(patch.targetCanvas);
  const blocked = conflict
    ? (onOtherCanvas ? conflict
      : applied ? '应用后画布又有改动，无法整体撤回这份提案。'
      : '画布在提案生成后已变化，直接应用会覆盖你的修改。请让 Agent 基于当前画布重新生成。')
    : undefined;

  const runImages = async () => {
    if (!directives.length || imageBusy) return;
    if (patch.targetCanvas && !sameCanvas(patch.targetCanvas)) {
      setImageStatus({ tone: 'error', text: '请先切回提案所属的画布。' });
      return;
    }
    const settings = useSettingsStore.getState();
    const { projectDir, registerGeneratedAsset } = useProjectStore.getState();
    const themeId = useWorkspaceStore.getState().activeThemeId;
    const target = currentCanvasTarget(useAgentStore.getState().activeSessionId);
    const projectVersion = getPaperWorkspaceVersion();
    let expectedSource = useWorkspaceStore.getState().tikzCode;
    // Generation takes a while; never write a result into a canvas the user has since left or edited.
    const assertSameTarget = () => {
      if (getPaperWorkspaceVersion() !== projectVersion || !sameCanvas(target) ||
          useWorkspaceStore.getState().tikzCode !== expectedSource) {
        throw new Error('画布或源码已变化，已停止将生成结果写入画布。');
      }
    };
    setImageBusy(true);
    setImageStatus({ tone: 'info', text: `正在用 ${settings.imageGenProvider} 生成 ${directives.length} 张插图…` });
    try {
      let done = 0;
      let lastError = '';
      for (const directive of directives) {
        assertSameTarget();
        const targetPath = directive.path || `figures/assets/ai/${directive.nodeId}.png`;
        const result = await generateScientificIllustration({
          provider: settings.imageGenProvider,
          apiKey: settings.imageGenApiKey,
          baseUrl: settings.imageGenBaseUrl,
          model: settings.imageGenModel,
          subjectPrompt: directive.prompt,
          themeId,
          aspectRatio: directive.aspectRatio || '1:1',
          transparentBackground: settings.imageGenAutoRemoveWhiteBg,
          autoTrimAlpha: settings.imageGenAutoTrimAlpha,
          projectDir,
          targetRelativePath: targetPath,
          proxyUrl: settings.proxyEnabled ? settings.proxyUrl : undefined,
        });
        if (result.ok && result.dataUrl) {
          assertSameTarget();
          const savedPath = await registerGeneratedAsset(result.savedRelativePath || targetPath, result.dataUrl, projectDir);
          assertSameTarget();
          useWorkspaceStore.getState().updateImageNodePathById(directive.nodeId, savedPath);
          expectedSource = useWorkspaceStore.getState().tikzCode;
          done++;
        } else if (result.error) {
          lastError = result.error;
        }
      }
      setImageStatus(done === directives.length
        ? { tone: 'ok', text: `已生成 ${done} 张插图并嵌入画布。` }
        : { tone: 'error', text: `已生成 ${done}/${directives.length} 张插图。${lastError}` });
    } catch (error) {
      setImageStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setImageBusy(false);
    }
  };

  const applyProposal = () => {
    if (!apply(messageId)) return false;
    if (directives.length) void runImages();
    return true;
  };

  const semantic = patch.semanticItems ?? [];
  const visibleSemantic = showAllChanges ? semantic : semantic.slice(0, 4);
  const tabs: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    ...(diffLines.length ? [{ id: 'diff' as const, label: '变更', icon: <GitCompare className="h-3 w-3" /> }] : []),
    { id: 'code', label: '完整源码', icon: <Code2 className="h-3 w-3" /> },
    ...(patch.renderPreview ? [{ id: 'preview' as const, label: '渲染预览', icon: <Eye className="h-3 w-3" /> }] : []),
  ];

  return (
    <section aria-label="画布修改提案"
      className={`overflow-hidden rounded-xl border bg-white ${rejected ? 'border-slate-200 opacity-75' : 'border-slate-200 shadow-xs'}`}>
      <header className="flex items-start gap-2 border-b border-slate-100 px-3 py-2">
        <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-snug text-slate-900">{patch.summary}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
            <span className={`rounded-full border px-1.5 py-px text-[10.5px] font-medium ${STATUS[patch.status].className}`}>
              {applied && patch.autoApplied ? '已自动应用' : STATUS[patch.status].label}
            </span>
            <DiffStats lines={diffLines} />
            {typeof patch.layoutScore === 'number' && (
              <span title="源码级布局与配色检查评分（不代表真实渲染效果）"
                className={patch.layoutScore >= 90 ? 'text-emerald-700' : 'text-amber-700'}>
                布局 {patch.layoutScore}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-2.5">
        {patch.rationale && <p className="text-[12px] leading-relaxed text-slate-600">{patch.rationale}</p>}

        {semantic.length > 0 && (
          <ul className="space-y-0.5 text-[11.5px]">
            {visibleSemantic.map((item, index) => (
              <li key={index} className="flex gap-1.5">
                <span aria-hidden="true" className={`w-3 shrink-0 text-center font-mono font-semibold ${
                  item.type === 'add' ? 'text-emerald-600' : item.type === 'remove' ? 'text-rose-600' : 'text-blue-600'}`}>
                  {item.type === 'add' ? '+' : item.type === 'remove' ? '−' : '~'}
                </span>
                <span className="min-w-0 break-words text-slate-600">
                  <span className="font-mono text-slate-800">{item.id}</span> {item.detail}
                </span>
              </li>
            ))}
            {semantic.length > 4 && (
              <li>
                <button type="button" onClick={() => setShowAllChanges((value) => !value)}
                  className="pl-[18px] text-[11px] text-blue-600 hover:underline cursor-pointer">
                  {showAllChanges ? '收起' : `还有 ${semantic.length - 4} 项变更`}
                </button>
              </li>
            )}
          </ul>
        )}

        {!!patch.autoRepairs?.length && (
          <details className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-600">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-700">
              <Wand2 className="h-3 w-3 text-blue-600" />已自动修复 {patch.autoRepairs.length} 处布局与配色细节
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 marker:text-slate-400">
              {patch.autoRepairs.map((repair, index) => <li key={index}>{repair}</li>)}
            </ul>
          </details>
        )}

        <div>
          <div role="tablist" aria-label="提案内容" className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id}
                onClick={() => setView(view === tab.id ? null : tab.id)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] cursor-pointer transition-colors ${
                  view === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
          {view === 'diff' && <DiffView lines={diffLines} label="TikZ 变更对比" className="mt-1.5 max-h-64" />}
          {view === 'code' && (
            <pre className="mt-1.5 max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-800 select-text">
              {patch.newTikzCode}
            </pre>
          )}
          {view === 'preview' && patch.renderPreview && (
            <figure className="mt-1.5 rounded-md border border-slate-200 bg-white p-2">
              <img src={patch.renderPreview.dataUrl} alt="画布修改的真实 TeX 渲染" className="w-full object-contain" />
              <figcaption className="mt-1.5 text-[11px] text-slate-500">真实 TeX 渲染结果。编译成功不代表排版无误，请自行确认。</figcaption>
            </figure>
          )}
          {!patch.renderPreview && visualReviewEnabled && !rejected && (
            <p className="mt-1.5 text-[11px] text-slate-400">本提案没有渲染预览，布局评分仅来自源码检查。</p>
          )}
        </div>

        {directives.length > 0 && !rejected && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-800">
                <ImageIcon className="h-3.5 w-3.5 text-violet-600" />需要生成 {directives.length} 张 AI 插图
              </span>
              <button type="button" onClick={() => openSettings('illustration')}
                className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline cursor-pointer" title="打开插图生成设置">
                {imageProvider}
              </button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {directives.map((directive, index) => (
                <li key={index} title={directive.prompt} className="truncate text-[11px] text-slate-600">
                  <span className="font-mono text-slate-800">{directive.nodeId}</span> · {directive.prompt}
                </li>
              ))}
            </ul>
            <button type="button" disabled={imageBusy || (!applied && !!blocked)}
              onClick={() => { if (applied) void runImages(); else applyProposal(); }}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-white px-2 py-1.5 text-[11.5px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
              {imageBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              {imageBusy ? '正在生成…' : applied ? `重新生成 ${directives.length} 张插图` : `应用并生成 ${directives.length} 张插图`}
            </button>
            {imageStatus && (
              <p role="status" className={`mt-1.5 text-[11px] ${
                imageStatus.tone === 'error' ? 'text-rose-700' : imageStatus.tone === 'ok' ? 'text-emerald-700' : 'text-slate-500'}`}>
                {imageStatus.text}
              </p>
            )}
          </div>
        )}

        {blocked && <p role="status" className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-900">{blocked}</p>}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {patch.status === 'pending' && <>
            <button type="button" disabled={!!blocked} onClick={applyProposal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed">
              <Check className="h-3.5 w-3.5" />应用到画布
            </button>
            <button type="button" onClick={() => reject(messageId)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 cursor-pointer">
              <X className="h-3.5 w-3.5" />忽略
            </button>
          </>}
          {applied && (
            <button type="button" disabled={isStreaming || !!blocked} onClick={() => revert(messageId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
              <Undo2 className="h-3.5 w-3.5" />撤回修改
            </button>
          )}
          {rejected && (
            <button type="button" onClick={() => restore(messageId)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 cursor-pointer">
              <Undo2 className="h-3.5 w-3.5" />恢复提案
            </button>
          )}
          {applied && (
            <button type="button" onClick={() => setLeftTab('code')}
              className="ml-auto rounded-lg px-2 py-1.5 text-[11.5px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer">
              在代码面板查看
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
