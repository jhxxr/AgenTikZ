import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertCircle, FileText, Layers, Loader2, MousePointer2, PanelRightClose, PanelRightOpen, Sparkles, SquarePen, Zap,
} from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProjectStore } from '../../store/useProjectStore';
import { usePaperBuildStore } from '../../store/usePaperBuildStore';
import { PUBLICATION_WORKFLOW_TEMPLATES } from '../../core/agent/figure-contract';
import { AgentComposer, EMPTY_DRAFT, type ComposerDraft } from './AgentComposer';
import { AgentPicker } from './AgentPicker';
import { MessageList, type Suggestion } from './MessageList';
import { SessionMenu } from './SessionMenu';
import { SkillMenu, type SkillItem } from './SkillMenu';
import { formatElapsed, isDesktop, shortAgentName, useElapsedSeconds } from './agent-ui';

const WIDTH_KEY = 'agentikz.agentPanelWidth';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const clampWidth = (width: number) => {
  const room = typeof window === 'undefined' ? MAX_WIDTH : Math.max(MIN_WIDTH, window.innerWidth - 480);
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.min(MAX_WIDTH, room)));
};
const readWidth = () => {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};

const PAPER_PROMPTS: Suggestion[] = [
  { title: '润色当前章节', detail: '保留科学含义、数值与引用，生成待审核的修改集',
    prompt: '请先读取当前论文章节，在保留科学含义、数值和引用的前提下润色，生成待审核的论文修改集。' },
  { title: '同步图注与正文', detail: '检查图注、label 与正文引用是否一致',
    prompt: '请读取当前项目的配图和相关论文章节，检查图注、label 与正文引用是否一致，将有依据的修正合并为一个待审核修改集。不要编造结论。' },
  { title: '分析编译诊断', detail: '定位报错对应的源码并给出修改建议',
    prompt: '请读取最近的论文编译诊断，先确认是否过期，再定位相关源码；如需修改，请生成待审核修改集，不要声称已修复或已编译。' },
];
const NEW_FIGURE_PROMPTS: Suggestion[] = [
  { title: '绘制模型架构图', detail: '双流 Encoder-Decoder，分组清晰、配色符合投稿规范',
    prompt: '绘制双流 Encoder-Decoder 架构图，使用 stage_box 分组与顶刊语义配色。' },
  { title: '绘制视觉主干网络', detail: '包含 3D 特征张量与多头注意力模块',
    prompt: '画一个带 3D 特征张量 (feature_cube) 与多头注意力 (mha_block) 的视觉主干图。' },
  { title: '架构图 + 实验曲线组合面板', detail: '左侧机制图，右侧 PGFPlots 消融对比',
    prompt: '绘制左侧架构图 + 右侧 PGFPlots 消融实验折线对比图的组合面板。' },
];
const EDIT_FIGURE_PROMPTS: Suggestion[] = [
  { title: '修复重叠并统一配色', detail: '用增量补丁调整当前画布，不重画整张图',
    prompt: '用 SEARCH/REPLACE 增量补丁修复当前画布重叠并应用顶刊语义配色。' },
  { title: '为选中模块添加残差连接', detail: '右侧正交跳线与 Add & Norm 模块',
    prompt: '为当前选中模块添加右侧正交残差跳线与 Add & Norm 模块。' },
  { title: '补充特征张量示意', detail: '在选中模块旁添加 3D 立方体并连线',
    prompt: '在选中模块旁添加 3D 特征张量立方体 (feature_cube) 并连接箭头。' },
];

/** Template labels carry decorative emoji for other surfaces; this list is text-only. */
const plainLabel = (label: string) => label.replace(/^[^\p{L}\p{N}]+/u, '').trim();

const ContextChip: React.FC<{
  active: boolean; icon: React.ReactNode; label: string; title: string; onToggle?: () => void;
}> = ({ active, icon, label, title, onToggle }) => {
  const className = `inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
    active ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-400 line-through decoration-slate-300'}`;
  return onToggle
    ? <button type="button" aria-pressed={active} title={title} onClick={onToggle} className={`${className} cursor-pointer hover:border-blue-300`}>
        {icon}<span className="truncate">{label}</span>
      </button>
    : <span title={title} className={className}>{icon}<span className="truncate">{label}</span></span>;
};

export const RightAgentPanel: React.FC = () => {
  const {
    providers, activeAgentId, sessions, activeSessionId, isStreaming, streamingStartedAt, streamingSessionId,
    streamingMessageId, activeRequestId, attachCanvasContext, attachSelectionContext,
  } = useAgentStore(useShallow((s) => ({
    providers: s.providers, activeAgentId: s.activeAgentId, sessions: s.sessions, activeSessionId: s.activeSessionId,
    isStreaming: s.isStreaming, streamingStartedAt: s.streamingStartedAt, streamingSessionId: s.streamingSessionId,
    streamingMessageId: s.streamingMessageId, activeRequestId: s.activeRequestId,
    attachCanvasContext: s.attachCanvasContext, attachSelectionContext: s.attachSelectionContext,
  })));
  const actions = useAgentStore(useShallow((s) => ({
    send: s.sendPromptToAgent, cancel: s.cancelPrompt, retry: s.retryLastPrompt, runSkill: s.runLocalAgentSkill,
    createSession: s.createNewSession, switchSession: s.switchSession, renameSession: s.renameSession,
    deleteSession: s.deleteSession, probe: s.probeLocalAgents,
    setAttachCanvas: s.setAttachCanvasContext, setAttachSelection: s.setAttachSelectionContext,
  })));
  const { selectedIds, nodeCount, isEmptyCanvas, activeThemeId, collapsed, togglePanel, setCollapsed } = useWorkspaceStore(useShallow((s) => ({
    selectedIds: s.selectedIds, nodeCount: s.parsedDoc.nodes.length, isEmptyCanvas: s.parsedDoc.elements.length === 0,
    activeThemeId: s.activeThemeId, collapsed: s.isAgentPanelCollapsed, togglePanel: s.toggleAgentPanel,
    setCollapsed: s.setAgentPanelCollapsed,
  })));
  const { projectDir, paperMode, activePaperFilePath, paperDirty } = useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir, paperMode: s.workbenchMode === 'paper', activePaperFilePath: s.activePaperFilePath,
    paperDirty: !!s.paperDirtyFiles[s.activePaperFilePath],
  })));
  const { piChannels, piActiveChannelId, piModel, acpModelSelections, openSettings, autoMode, updateSettings } = useSettingsStore(useShallow((s) => ({
    piChannels: s.piChannels, piActiveChannelId: s.piActiveChannelId, piModel: s.piModel,
    acpModelSelections: s.acpModelSelections, openSettings: s.openSettings,
    autoMode: s.agentAutoMode, updateSettings: s.updateSettings,
  })));
  const buildMessage = usePaperBuildStore((s) => s.projectId === projectDir
    ? (s.status === 'running' ? '正在编译论文…' : s.result?.message) : undefined);

  const [drafts, setDrafts] = useState<Record<string, ComposerDraft>>({});
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [probing, setProbing] = useState(false);
  const [width, setWidth] = useState(readWidth);
  const [resizing, setResizing] = useState(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const activeProvider = providers.find((provider) => provider.id === activeAgentId) ?? providers[0];
  const running = isStreaming && streamingSessionId === activeSession?.id;
  const runningElsewhere = isStreaming && !running;
  const otherSession = runningElsewhere ? sessions.find((session) => session.id === streamingSessionId) : undefined;
  const elapsed = useElapsedSeconds(isStreaming ? streamingStartedAt : null);
  const draft = drafts[activeSessionId] ?? EMPTY_DRAFT;

  const setDraft = useCallback((next: ComposerDraft) => {
    setDrafts((previous) => ({ ...previous, [activeSessionId]: next }));
  }, [activeSessionId]);
  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = textarea.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    });
  }, []);
  const fillComposer = useCallback((text: string) => {
    setDrafts((previous) => ({ ...previous, [activeSessionId]: { ...(previous[activeSessionId] ?? EMPTY_DRAFT), text } }));
    focusComposer();
  }, [activeSessionId, focusComposer]);

  const probe = useCallback(async () => {
    setProbing(true);
    try { await actions.probe(); } finally { setProbing(false); }
  }, [actions]);
  useEffect(() => { void probe(); }, [probe]);

  // Ctrl/Cmd+L jumps to the composer from anywhere, opening the panel if needed.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mac = /mac/i.test(navigator.platform);
      if (event.key.toLowerCase() !== 'l' || event.altKey || event.shiftKey || !(mac ? event.metaKey : event.ctrlKey)) return;
      event.preventDefault();
      setCollapsed(false);
      focusComposer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusComposer, setCollapsed]);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampWidth(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    setResizing(true);
    const onMove = (move: PointerEvent) => {
      latest = clampWidth(startWidth + startX - move.clientX);
      setWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizing(false);
      try { window.localStorage.setItem(WIDTH_KEY, String(latest)); } catch { /* Width is a convenience only. */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const activePiChannel = piChannels.find((item) => item.id === piActiveChannelId) ?? (!piActiveChannelId ? piChannels[0] : undefined);
  const piModelId = piModel || activePiChannel?.defaultModelId || activePiChannel?.models[0]?.id || '';
  const modelLabel = activeProvider.id === 'pi'
    ? (activePiChannel?.models.find((model) => model.id === piModelId)?.name || piModelId)
    : (() => {
      const id = acpModelSelections[activeProvider.id] || activeProvider.currentModelId || '';
      return activeProvider.models?.find((model) => model.id === id)?.name || id;
    })();

  const setupIssue = !isDesktop()
    ? { text: '浏览器预览无法连接本地 Agent，请在桌面应用中使用。', action: undefined }
    : activeProvider.id === 'pi' && (!activePiChannel || !piModelId)
      ? { text: '内置 Pi 还没有配置渠道和模型。', action: '去配置' }
      : !activeProvider.detected && !probing
        ? { text: `未检测到 ${shortAgentName(activeProvider)}，发送前请先安装并登录，或换用其他 Agent。`, action: '查看设置' }
        : undefined;

  const suggestions = paperMode ? PAPER_PROMPTS : isEmptyCanvas ? NEW_FIGURE_PROMPTS : EDIT_FIGURE_PROMPTS;
  const greeting = paperMode
    ? { title: '一起打磨这篇论文', detail: '我可以读取当前章节、图注和编译诊断，并把修改整理成可审核的修改集。' }
    : isEmptyCanvas
      ? { title: '想画一张什么图？', detail: '描述你的方法或粘贴一张参考图，我会生成可编辑的 TikZ 图。' }
      : { title: '需要怎么调整这张图？', detail: '我能看到当前画布和你选中的元素，可以精修布局、配色，或添加新模块。' };

  const skills = useMemo<SkillItem[]>(() => paperMode
    ? PAPER_PROMPTS.map((item) => ({ id: item.title, label: item.title, detail: item.detail, kind: 'template', run: () => fillComposer(item.prompt) }))
    : [
      { id: 'full_optimize', label: '综合精修', detail: '消除重叠、对齐层级并应用主题配色，生成一份待审核补丁', kind: 'local', run: () => actions.runSkill('full_optimize') },
      { id: 'auto_layout', label: '自动排布', detail: '只调整间距与箭头留白，不改配色', kind: 'local', run: () => actions.runSkill('auto_layout') },
      { id: 'theme_colorize', label: '主题配色', detail: '按当前期刊主题重新分配语义色', kind: 'local', run: () => actions.runSkill('theme_colorize') },
      { id: 'diagnose_canvas', label: '布局体检', detail: '列出重叠、遮挡与配色问题，不修改画布', kind: 'local', run: () => actions.runSkill('diagnose_canvas') },
      ...PUBLICATION_WORKFLOW_TEMPLATES.map((template): SkillItem => ({
        id: template.id, label: plainLabel(template.label), detail: template.description, kind: 'template',
        run: () => fillComposer(template.buildPrompt(activeThemeId)),
      })),
    ], [paperMode, actions, fillComposer, activeThemeId]);

  const lastPrompt = useMemo(
    () => [...(activeSession?.messages ?? [])].reverse().find((message) => message.role === 'user')?.content,
    [activeSession?.messages]);
  const canRetry = !isStreaming && !!lastPrompt;

  if (collapsed) {
    return (
      <aside aria-label="项目助手（已折叠）" className="flex h-full w-11 shrink-0 select-none flex-col items-center gap-2 border-l border-slate-200 bg-white py-2.5">
        <button type="button" onClick={togglePanel} title="展开项目助手 (Ctrl+L)" aria-label="展开项目助手"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <button type="button" onClick={togglePanel} title={isStreaming ? '正在运行，点击查看' : '展开项目助手'}
          className="flex flex-1 flex-col items-center gap-2 rounded-lg px-1 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900 cursor-pointer">
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <Sparkles className="h-4 w-4" />}
          <span className="text-[11px] font-medium tracking-widest" style={{ writingMode: 'vertical-rl' }}>
            {isStreaming ? `运行中 ${formatElapsed(elapsed)}` : '项目助手'}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="项目助手" style={{ width }}
      className={`relative flex h-full shrink-0 flex-col border-l border-slate-200 bg-white ${resizing ? 'select-none' : ''}`}>
      <div role="separator" aria-orientation="vertical" aria-label="调整助手面板宽度" title="拖动调整宽度，双击恢复默认"
        onPointerDown={startResize}
        onDoubleClick={() => {
          setWidth(clampWidth(DEFAULT_WIDTH));
          try { window.localStorage.removeItem(WIDTH_KEY); } catch { /* Width is a convenience only. */ }
        }}
        className={`absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize transition-colors ${resizing ? 'bg-blue-400/50' : 'hover:bg-blue-300/40'}`} />

      <header className="flex shrink-0 items-center gap-1 border-b border-slate-200/80 px-2 py-1.5 select-none">
        <SessionMenu sessions={sessions} activeSession={activeSession} currentProjectId={projectDir || 'temporary'}
          streamingSessionId={isStreaming ? streamingSessionId : null}
          onSwitch={(id) => { actions.switchSession(id); focusComposer(); }}
          onRename={actions.renameSession} onDelete={actions.deleteSession}
          onNew={() => { actions.createSession(); focusComposer(); }} />
        <button type="button" role="switch" aria-label="自动模式" aria-checked={autoMode} disabled={isStreaming}
          onClick={() => updateSettings({ agentAutoMode: !autoMode })}
          title={isStreaming ? '本轮运行结束后可切换模式' : '自动模式：免确认应用最终提案，并放行 ACP 本机文件读写与命令权限；Pi 仍仅使用项目工具'}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
            autoMode ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
          <Zap className="h-3 w-3" />{autoMode ? '自动模式' : '手动审核'}
        </button>
        <button type="button" onClick={() => { actions.createSession(); focusComposer(); }} title="新对话" aria-label="新对话"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
          <SquarePen className="h-4 w-4" />
        </button>
        <button type="button" onClick={togglePanel} title="折叠项目助手" aria-label="折叠项目助手"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>

      {autoMode && (
        <div role="status" className="shrink-0 border-b border-amber-100 bg-amber-50/60 px-3 py-1.5 text-[11px] leading-relaxed text-amber-800">
          {activeAgentId === 'pi'
            ? '自动模式 · 本轮成功完成后自动应用提案，可撤回；Pi 仍仅使用项目工具。'
            : '自动模式 · 自动应用最终提案，并允许本机文件读写、命令执行。仅对信任的 Agent 开启。'}
        </div>
      )}

      <MessageList session={activeSession} providers={providers} running={running}
        streamingMessageId={running ? streamingMessageId : null} startedAt={running ? streamingStartedAt : null}
        canRetry={canRetry} suggestions={suggestions} greeting={greeting}
        onRetry={() => void actions.retry()} onOpenSettings={() => openSettings('agent')} onPickSuggestion={fillComposer} />

      <div className="shrink-0 space-y-2 px-2.5 pb-2.5 pt-1.5">
        {runningElsewhere && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11.5px] text-slate-700">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
            <span className="min-w-0 flex-1 truncate">「{otherSession?.title ?? '另一个对话'}」正在运行 · {formatElapsed(elapsed)}</span>
            {otherSession && (
              <button type="button" onClick={() => actions.switchSession(otherSession.id)}
                className="shrink-0 font-medium text-blue-700 hover:underline cursor-pointer">查看</button>
            )}
            <button type="button" disabled={!activeRequestId} onClick={() => void actions.cancel()}
              className="shrink-0 text-slate-600 hover:text-rose-700 hover:underline disabled:opacity-40 cursor-pointer">停止</button>
          </div>
        )}
        {!isStreaming && setupIssue && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-900">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1">{setupIssue.text}</span>
            {setupIssue.action && (
              <button type="button" onClick={() => openSettings('agent')}
                className="shrink-0 font-medium text-blue-700 hover:underline cursor-pointer">{setupIssue.action}</button>
            )}
          </div>
        )}
        {paperMode && buildMessage && <p role="status" className="truncate px-1 text-[11px] text-slate-500" title={buildMessage}>{buildMessage}</p>}

        <AgentComposer key={activeSessionId} draft={draft} onDraftChange={setDraft} textareaRef={textarea}
          onSend={actions.send} onStop={() => void actions.cancel()} running={running} canStop={!!activeRequestId}
          blockedReason={runningElsewhere ? '另一个对话正在运行，结束后才能发送' : undefined}
          placeholder={paperMode ? '描述论文任务，Enter 发送，Shift+Enter 换行' : '描述绘图需求，Enter 发送，Shift+Enter 换行'}
          lastPrompt={lastPrompt} onSlash={() => setSkillsOpen(true)}
          context={paperMode ? (
            <ContextChip active icon={<FileText className="h-3 w-3 shrink-0" />}
              label={`${activePaperFilePath || '未打开文件'}${paperDirty ? ' · 未保存' : ''}`}
              title="Agent 会读取当前论文文件（包含未保存的编辑）以及项目信息" />
          ) : <>
            <ContextChip active={attachCanvasContext} icon={<Layers className="h-3 w-3 shrink-0" />}
              label={`画布 · ${nodeCount} 个节点`}
              title={attachCanvasContext ? '本轮会附带当前画布源码，点击改为不附带' : '本轮不附带画布源码（适合从零开始画新图），点击附带'}
              onToggle={() => actions.setAttachCanvas(!attachCanvasContext)} />
            {selectedIds.length > 0 && (
              <ContextChip active={attachSelectionContext} icon={<MousePointer2 className="h-3 w-3 shrink-0" />}
                label={`选中 ${selectedIds.length} 个`}
                title={`${attachSelectionContext ? '本轮会告诉 Agent 你选中了' : '本轮不告知选中项'}：${selectedIds.slice(0, 6).join('、')}${selectedIds.length > 6 ? ' 等' : ''}`}
                onToggle={() => actions.setAttachSelection(!attachSelectionContext)} />
            )}
          </>}
          actions={<>
            <SkillMenu open={skillsOpen} onOpenChange={setSkillsOpen} items={skills} disabled={isStreaming} />
            <AgentPicker providers={providers} activeProvider={activeProvider} modelLabel={modelLabel}
              paperMode={paperMode} probing={probing} onReprobe={() => void probe()} />
          </>} />
      </div>
    </aside>
  );
};
