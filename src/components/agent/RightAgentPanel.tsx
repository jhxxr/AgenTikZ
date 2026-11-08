import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProjectStore } from '../../store/useProjectStore';
import { FULL_FIGURE_TEMPLATES } from '../../core/templates/dl-templates';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { PUBLICATION_WORKFLOW_TEMPLATES } from '../../core/agent/figure-contract';
import { parseTikzDocument } from '../../core/parser/parser';
import { generateScientificIllustration } from '../../core/agent/illustration-prompt';
import { AcpAgentId } from '../../types/acp';
import { currentCanvasTarget, sameCanvas } from '../../core/mcp/context';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Cpu,
  GitCompare,
  History,
  Image as ImageIcon,
  Layers,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Plug,
  RotateCcw,
  ScanSearch,
  Send,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Wand2,
  Wrench,
} from 'lucide-react';

export const RightAgentPanel: React.FC = () => {
  const {
    providers,
    activeAgentId,
    customCommand,
    setCustomCommand,
    attachCanvasContext,
    attachSelectionContext,
    autoLayoutRepairEnabled,
    isStreaming,
    activeRequestId,
    cancelPrompt,
    sessions,
    activeSessionId,
    setActiveAgentId,
    setAttachCanvasContext,
    setAttachSelectionContext,
    setAutoLayoutRepairEnabled,
    setTemplateReference,
    createNewSession,
    switchSession,
    probeLocalAgents,
    sendPromptToAgent,
    runLocalAgentSkill,
    applyPatchProposal,
    revertPatchProposal,
  } = useAgentStore(useShallow((s) => ({
    providers: s.providers,
    activeAgentId: s.activeAgentId,
    customCommand: s.customCommand,
    setCustomCommand: s.setCustomCommand,
    attachCanvasContext: s.attachCanvasContext,
    attachSelectionContext: s.attachSelectionContext,
    autoLayoutRepairEnabled: s.autoLayoutRepairEnabled,
    isStreaming: s.isStreaming,
    activeRequestId: s.activeRequestId,
    cancelPrompt: s.cancelPrompt,
    sessions: s.sessions,
    activeSessionId: s.activeSessionId,
    setActiveAgentId: s.setActiveAgentId,
    setAttachCanvasContext: s.setAttachCanvasContext,
    setAttachSelectionContext: s.setAttachSelectionContext,
    setAutoLayoutRepairEnabled: s.setAutoLayoutRepairEnabled,
    setTemplateReference: s.setTemplateReference,
    createNewSession: s.createNewSession,
    switchSession: s.switchSession,
    probeLocalAgents: s.probeLocalAgents,
    sendPromptToAgent: s.sendPromptToAgent,
    runLocalAgentSkill: s.runLocalAgentSkill,
    applyPatchProposal: s.applyPatchProposal,
    revertPatchProposal: s.revertPatchProposal,
  })));

  const {
    selectedIds,
    parsedDoc,
    activeThemeId,
    setLeftTab,
    isAgentPanelCollapsed,
    toggleAgentPanel,
  } = useWorkspaceStore(useShallow((s) => ({
    selectedIds: s.selectedIds,
    parsedDoc: s.parsedDoc,
    activeThemeId: s.activeThemeId,
    setLeftTab: s.setLeftTab,
    isAgentPanelCollapsed: s.isAgentPanelCollapsed,
    toggleAgentPanel: s.toggleAgentPanel,
  })));
  const settings = useSettingsStore();
  const { openSettings } = settings;
  const { projectDir, registerGeneratedAsset } = useProjectStore(useShallow((s) => ({ projectDir: s.projectDir, registerGeneratedAsset: s.registerGeneratedAsset })));

  const [inputText, setInputText] = useState('');
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [previewTabByMsgId, setPreviewTabByMsgId] = useState<
    Record<string, 'closed' | 'diff' | 'code'>
  >({});
  const [generatingImgMsgId, setGeneratingImgMsgId] = useState<string | null>(
    null
  );
  const [imgGenStatusByMsgId, setImgGenStatusByMsgId] = useState<
    Record<string, string>
  >({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const historyDropdownRef = useRef<HTMLDivElement | null>(null);
  const workflowMenuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showHistoryDropdown && !showWorkflowMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        showHistoryDropdown &&
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(e.target as Node)
      ) {
        setShowHistoryDropdown(false);
      }
      if (
        showWorkflowMenu &&
        workflowMenuRef.current &&
        !workflowMenuRef.current.contains(e.target as Node)
      ) {
        setShowWorkflowMenu(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showHistoryDropdown, showWorkflowMenu]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const referenceTemplate = FULL_FIGURE_TEMPLATES.find((template) => template.id === activeSession?.templateReferenceId);
  const activeProvider =
    providers.find((p) => p.id === activeAgentId) || providers[0];
  const activeTheme = JOURNAL_THEMES[activeThemeId] || JOURNAL_THEMES.neurips;

  useEffect(() => {
    probeLocalAgents();
  }, [probeLocalAgents]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isStreaming]);

  const handleSend = async () => {
    if (!inputText.trim() || isStreaming) return;
    const text = inputText;
    setInputText('');
    await sendPromptToAgent(text);
  };

  const executeAgentImageDirectives = async (
    msgId: string,
    tikzSource: string
  ) => {
    const directives = parseTikzDocument(tikzSource).imageDirectives || [];
    if (directives.length === 0 || generatingImgMsgId === msgId) return;
    const imageTarget = currentCanvasTarget(activeSessionId);
    const proposalTarget = activeSession?.messages.find((message) => message.id === msgId)?.patchProposal?.targetCanvas;
    if (proposalTarget && !sameCanvas(proposalTarget)) {
      setImgGenStatusByMsgId((prev) => ({ ...prev, [msgId]: '请先切回提案所属的画布。' }));
      return;
    }
    let expectedSource = useWorkspaceStore.getState().tikzCode;
    const checkImageTarget = () => {
      if (!sameCanvas(imageTarget) || useWorkspaceStore.getState().tikzCode !== expectedSource) {
        throw new Error('画布或源码已变化，已停止将生成结果写入画布。');
      }
    };
    setGeneratingImgMsgId(msgId);
    setImgGenStatusByMsgId((prev) => ({
      ...prev,
      [msgId]: `正在后台自动调用 ${settings.imageGenProvider} 生成并抠图 (${directives.length} 张)...`,
    }));
    try {
      let okCount = 0;
      for (const dir of directives) {
        checkImageTarget();
        const targetRel = dir.path || `figures/assets/ai/${dir.nodeId}.png`;
        const res = await generateScientificIllustration({
          provider: settings.imageGenProvider,
          apiKey: settings.imageGenApiKey,
          baseUrl: settings.imageGenBaseUrl,
          model: settings.imageGenModel,
          subjectPrompt: dir.prompt,
          themeId: activeThemeId,
          aspectRatio: dir.aspectRatio || '1:1',
          transparentBackground: settings.imageGenAutoRemoveWhiteBg,
          autoTrimAlpha: settings.imageGenAutoTrimAlpha,
          projectDir,
          targetRelativePath: targetRel,
          proxyUrl: settings.proxyEnabled ? settings.proxyUrl : undefined,
        });
        if (res.ok && res.dataUrl) {
          checkImageTarget();
          const savedRel = await registerGeneratedAsset(
            res.savedRelativePath || targetRel,
            res.dataUrl
          );
          checkImageTarget();
          useWorkspaceStore
            .getState()
            .updateImageNodePathById(dir.nodeId, savedRel);
          expectedSource = useWorkspaceStore.getState().tikzCode;
          okCount++;
        }
      }
      setImgGenStatusByMsgId((prev) => ({
        ...prev,
        [msgId]: `✅ 已自动生成 ${okCount}/${directives.length} 张透明抠图插图并嵌入画布`,
      }));
    } catch (err) {
      setImgGenStatusByMsgId((prev) => ({
        ...prev,
        [msgId]: `❌ 生成出错: ${String(err)}`,
      }));
    } finally {
      setGeneratingImgMsgId(null);
    }
  };

  const handleApplyPatchAndAutoCutout = (msgId: string, newTikzCode: string) => {
    if (!applyPatchProposal(msgId)) return;
    const directives = parseTikzDocument(newTikzCode).imageDirectives || [];
    if (directives.length > 0) {
      void executeAgentImageDirectives(msgId, newTikzCode);
    }
  };

  const quickPrompts = parsedDoc.elements.length === 0 ? [
    '绘制双流 Encoder-Decoder 架构图，使用 stage_box 分组与顶刊语义配色',
    '画一个带 3D 特征张量 (feature_cube) 与多头注意力 (mha_block) 的视觉主干图',
    '绘制左侧架构图 + 右侧 PGFPlots 消融实验折线对比图的组合面板',
  ] : [
    '用 SEARCH/REPLACE 增量补丁修复当前画布重叠并应用顶刊语义配色',
    '为当前选中模块添加右侧正交残差跳线与 Add & Norm 模块',
    '在选中模块旁添加 3D 特征张量立方体 (feature_cube) 并连接箭头',
  ];

  if (isAgentPanelCollapsed) {
    return (
      <aside className="w-11 h-full bg-slate-50/95 border-l border-slate-200/80 flex flex-col items-center py-3 justify-between shrink-0 select-none">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={toggleAgentPanel}
            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
            title="展开 AI 绘图助手面板"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Bot className="w-3.5 h-3.5" />
          </div>
        </div>

        <button
          onClick={toggleAgentPanel}
          className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 tracking-widest cursor-pointer py-2"
          style={{ writingMode: 'vertical-rl' }}
          title="展开 AI 绘图助手面板"
        >
          AI 绘图助手
        </button>

        <div className="flex flex-col items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: activeProvider.badgeColor }}
            title={`${activeProvider.name}${activeProvider.detected ? ' · 已就绪' : ''}`}
          />
          <button
            onClick={toggleAgentPanel}
            className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
            title="展开 AI 绘图助手面板"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[335px] h-full bg-sidebar-gradient border-l border-slate-200/80 flex flex-col shrink-0 select-none">
      {/* 1. Streamlined Top Agent Header & BYOA / ACP Switcher */}
      <div className="px-3 py-2 border-b border-slate-200/80 bg-white/70 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-3 h-3" />
            </div>
            <span className="text-xs font-semibold text-slate-900">
              Agent 协作
            </span>
            <span
              className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium"
              title={`已自动注入 ${activeTheme.name} 常驻投稿规范`}
            >
              🛡️ {activeTheme.venueBadge}规范
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => openSettings('agent')}
              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md transition-colors cursor-pointer"
              title="打开 Agent 设置 (适配器探测 / 握手测试 / 代理 / 提示词)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={createNewSession}
              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md transition-colors cursor-pointer"
              title="新建对话"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="relative" ref={historyDropdownRef}>
              <button
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md transition-colors cursor-pointer"
                title="历史会话记录"
              >
                <History className="w-3.5 h-3.5" />
              </button>
              {showHistoryDropdown && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                    本地会话历史 ({sessions.length})
                  </div>
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        switchSession(s.id);
                        setShowHistoryDropdown(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 ${
                        s.id === activeSessionId
                          ? 'bg-blue-50/60 text-blue-700 font-medium'
                          : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{s.title}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {s.messages.length}条
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={toggleAgentPanel}
              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md transition-colors cursor-pointer"
              title="折叠 AI 绘图助手面板"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Agent CLI Selector + Auto-Heal Engine Toggle Row */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <select
              value={activeAgentId}
              onChange={(e) => setActiveAgentId(e.target.value as AcpAgentId)}
              className="w-full appearance-none pl-6 pr-6 py-1 text-[11px] font-medium bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.detected ? ' · 已就绪' : ''}
                </option>
              ))}
            </select>
            <span
              className="w-2 h-2 rounded-full absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ backgroundColor: activeProvider.badgeColor }}
            />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => setAutoLayoutRepairEnabled(!autoLayoutRepairEnabled)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium border flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
              autoLayoutRepairEnabled
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/70'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title="智能几何防重叠与顶刊配色自愈引擎（自动修复间距遮挡、无框公式与单调白框）"
          >
            <Cpu className="w-3 h-3" />
            <span>{autoLayoutRepairEnabled ? '自愈 ON' : '自愈 OFF'}</span>
          </button>

          <button
            onClick={() => setShowAgentConfig(!showAgentConfig)}
            className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
            title="查看 ACP 协议命令详情"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => openSettings('agent')}
          title={settings.agentFullAccess
            ? `工作目录：${settings.agentWorkingDirectory.trim() || projectDir || '应用工作目录'}`
            : '打开设置可开启跨文件夹访问和命令执行'}
          className={`text-[10.5px] cursor-pointer ${settings.agentFullAccess ? 'text-amber-700' : 'text-slate-500'}`}
        >
          {settings.agentFullAccess ? '完整本机访问已开启' : '受限模式 · 配置本机访问'}
        </button>
        <button type="button" onClick={() => openSettings('mcp')}
          className="inline-flex items-center gap-1 text-[10.5px] text-blue-600 hover:text-blue-700 cursor-pointer">
          <Plug className="h-3 w-3" />MCP 服务
        </button>

        {/* Collapsible ACP Command Inspector (Agentero style BYOA transparency) */}
        {showAgentConfig && (
          <div className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-slate-700 font-medium">
              <span>stdio 启动命令:</span>
              <span className="text-[10px] text-emerald-600 font-mono">
                {activeProvider.protocol}
              </span>
            </div>
            {activeAgentId === 'custom-acp' ? (
              <input
                value={customCommand}
                onChange={(event) => setCustomCommand(event.target.value)}
                onBlur={() => void probeLocalAgents()}
                aria-label="Custom ACP command"
                placeholder={'Executable and args, or {"command":"...","args":[]}'}
                className="w-full px-2 py-1 rounded bg-slate-50 font-mono text-[10px] text-slate-700 border border-slate-200"
              />
            ) : (
              <div className="px-2 py-1 rounded bg-slate-50 font-mono text-[10px] text-slate-700 border border-slate-100 truncate">
                $ {activeProvider.command} {activeProvider.args.join(' ')}
              </div>
            )}
            <p className="text-[10px] text-slate-500 leading-snug">
              {activeProvider.detected
                ? `已就绪${activeProvider.version ? ` (${activeProvider.version})` : ''} — 发送时建立 ACP 会话`
                : '未检测到本地 Agent CLI 或 ACP 适配器，请先安装并登录对应 CLI'}
            </p>
            <div className="pt-1 flex items-center justify-between border-t border-slate-100">
              <span className="text-[10px] text-slate-400">
                {activeProvider.resolvedPath
                  ? `路径: ${activeProvider.resolvedPath}`
                  : '支持双层检测与内置适配器'}
              </span>
              <button
                type="button"
                onClick={() => openSettings('agent')}
                className="text-[10.5px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                打开完整 Agent 设置 →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Middle Scrollable Chat Conversation Window */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white select-text">
        {activeSession?.messages.map((msg) => {
          const patch = msg.patchProposal;
          const previewMode =
            previewTabByMsgId[msg.id] ||
            (patch?.mode === 'surgical_diff' ? 'diff' : 'closed');

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {/* Sender Meta Header */}
              <div className="flex items-center gap-1.5 mb-1 px-0.5">
                <span className="text-[10px] font-semibold text-slate-500">
                  {msg.role === 'user'
                    ? '你 (Researcher)'
                    : msg.role === 'system'
                    ? 'AgenTikZ 状态'
                    : providers.find((p) => p.id === msg.agentId)?.name ||
                      'ACP Agent'}
                </span>
                <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
              </div>

              {/* Context Pills attached to user message */}
              {msg.role === 'user' &&
                ((msg.contextSelectionIds && msg.contextSelectionIds.length > 0) ||
                  msg.includeFullCanvas) && (
                  <div className="flex flex-wrap gap-1 mb-1 justify-end">
                    {msg.includeFullCanvas && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                        @canvas
                      </span>
                    )}
                    {msg.contextSelectionIds?.map((id) => (
                      <span
                        key={id}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono"
                      >
                        @选中({id})
                      </span>
                    ))}
                  </div>
                )}

              {/* Message Bubble */}
              <div
                className={`max-w-[95%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-xs shadow-2xs'
                    : 'bg-slate-50/90 text-slate-800 border border-slate-200/90 rounded-bl-xs space-y-2'
                }`}
              >
                {/* ACP Thought Stream */}
                {msg.thoughtProcess && (
                  <details className="group bg-white rounded-lg border border-slate-200/80 px-2.5 py-1.5 text-[11px] text-slate-500">
                    <summary className="cursor-pointer font-medium text-slate-600 flex items-center gap-1 list-none">
                      <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                      <span>ACP 推理与 AST 分析过程</span>
                    </summary>
                    <p className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10.5px] font-mono text-slate-500 leading-normal">
                      {msg.thoughtProcess}
                    </p>
                  </details>
                )}

                {/* MCP Tool Calls */}
                {msg.mcpToolCalls && msg.mcpToolCalls.length > 0 && (
                  <div className="space-y-1">
                    {msg.mcpToolCalls.map((tc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-2 py-1 rounded bg-white border border-slate-200/80 text-[10px] font-mono text-slate-600"
                      >
                        <span className="flex items-center gap-1 truncate">
                          <Wrench className="w-3 h-3 text-blue-600 shrink-0" />
                          <strong className="text-slate-800">
                            {tc.toolName.replace(/^mcp__agen?tikz__/, '')}
                          </strong>
                          <span className="text-slate-400 truncate">
                            ({tc.source === 'local' ? '本地快捷操作' : tc.source === 'mcp' ? 'MCP' : 'Agent 工具'} · {tc.argsSummary}{tc.durationMs !== undefined ? ` · ${tc.durationMs} ms` : ''})
                          </span>
                        </span>
                        {tc.status === 'completed' ? (
                          <Check className="w-3 h-3 text-emerald-600 shrink-0 ml-1" />
                        ) : (
                          <span
                            className={
                              tc.status === 'failed'
                                ? 'text-red-600 shrink-0 ml-1'
                                : 'text-slate-400 shrink-0 ml-1'
                            }
                          >
                            {tc.status === 'failed' ? '失败' : '运行中'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Text */}
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* TikZ Code Patch Proposal Card with Diff & Semantic Change Preview */}
                {patch && (
                  <div className="mt-2 bg-white border border-blue-200 rounded-lg overflow-hidden shadow-2xs">
                    <div className="px-2.5 py-1.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-blue-900 flex items-center gap-1 truncate">
                        <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate">{patch.summary}</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {typeof patch.layoutScore === 'number' && (
                          <span
                            className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                              patch.layoutScore >= 90
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                            title="AST 2D 几何防重叠与配色健康度评分"
                          >
                            {patch.layoutScore}分
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            patch.status === 'applied'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {patch.status === 'applied' ? '已应用' : '待确认'}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 space-y-2">
                      <p className="text-[11px] text-slate-500">
                        {patch.rationale}
                      </p>

                      {/* Semantic AST Change Summary Pills */}
                      {patch.semanticItems && patch.semanticItems.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {patch.semanticItems.slice(0, 6).map((item, idx) => (
                            <span
                              key={idx}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                                item.type === 'add'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : item.type === 'remove'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {item.type === 'add'
                                ? '+'
                                : item.type === 'remove'
                                ? '-'
                                : '~'}{' '}
                              {item.id}: {item.detail}
                            </span>
                          ))}
                          {patch.semanticItems.length > 6 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                              +{patch.semanticItems.length - 6} 项变更
                            </span>
                          )}
                        </div>
                      )}

                      {/* Auto-Repairs Summary */}
                      {patch.autoRepairs && patch.autoRepairs.length > 0 && (
                        <div className="p-1.5 rounded bg-indigo-50/60 border border-indigo-100 text-[10px] text-indigo-800 space-y-0.5">
                          <div className="font-semibold flex items-center gap-1">
                            <Wand2 className="w-3 h-3 text-indigo-600" />
                            <span>智能自愈已优化 ({patch.autoRepairs.length} 项)：</span>
                          </div>
                          {patch.autoRepairs.slice(0, 3).map((rep, i) => (
                            <div key={i} className="truncate pl-4 text-slate-600">
                              • {rep}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* View Toggle: Diff View vs Full TikZ Code Preview */}
                      <div className="flex items-center gap-2 pt-0.5">
                        {patch.diffLines && patch.diffLines.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewTabByMsgId((prev) => ({
                                ...prev,
                                [msg.id]: previewMode === 'diff' ? 'closed' : 'diff',
                              }))
                            }
                            className={`text-[10.5px] flex items-center gap-1 font-medium cursor-pointer ${
                              previewMode === 'diff'
                                ? 'text-indigo-700 underline'
                                : 'text-slate-600 hover:text-indigo-600'
                            }`}
                          >
                            <GitCompare className="w-3 h-3" />
                            <span>
                              {previewMode === 'diff' ? '收起 Diff 对比' : '查看 Diff 变更对比'}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setPreviewTabByMsgId((prev) => ({
                              ...prev,
                              [msg.id]: previewMode === 'code' ? 'closed' : 'code',
                            }))
                          }
                          className="text-[10.5px] text-blue-600 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <Code2 className="w-3 h-3" />
                          <span>
                            {previewMode === 'code'
                              ? '收起生成的 TikZ 源码'
                              : '预览生成的干净 TikZ 源码'}
                          </span>
                        </button>
                      </div>

                      {previewMode === 'diff' &&
                        patch.diffLines &&
                        patch.diffLines.length > 0 && (
                          <div className="rounded bg-slate-900 border border-slate-800 text-[10px] font-mono max-h-48 overflow-auto py-1">
                            {patch.diffLines.map((dl, idx) => (
                              <div
                                key={idx}
                                className={`px-2 py-0.5 whitespace-pre flex items-start gap-1.5 ${
                                  dl.type === 'add'
                                    ? 'bg-emerald-950/80 text-emerald-300'
                                    : dl.type === 'remove'
                                    ? 'bg-rose-950/80 text-rose-300'
                                    : dl.text === '@@ ... @@'
                                    ? 'bg-slate-800/80 text-slate-400 italic'
                                    : 'text-slate-300'
                                }`}
                              >
                                <span className="w-4 shrink-0 select-none text-right opacity-60">
                                  {dl.type === 'add'
                                    ? '+'
                                    : dl.type === 'remove'
                                    ? '-'
                                    : ' '}
                                </span>
                                <span className="truncate">{dl.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                      {previewMode === 'code' && (
                        <pre className="p-2 rounded bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-700 max-h-44 overflow-auto leading-snug">
                          {patch.newTikzCode}
                        </pre>
                      )}

                      {/* @agent-image Hybrid Vector + AI Cutout Directives */}
                      {(() => {
                        const directives =
                          parseTikzDocument(patch.newTikzCode)
                            .imageDirectives || [];
                        if (directives.length === 0) return null;
                        const isBusy = generatingImgMsgId === msg.id;
                        const statusText = imgGenStatusByMsgId[msg.id];
                        return (
                          <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10.5px] font-semibold text-emerald-950 flex items-center gap-1">
                                <ImageIcon className="w-3 h-3 text-emerald-600" />
                                检测到 {directives.length} 个 @agent-image 透明插图指令
                              </span>
                              <button
                                type="button"
                                onClick={() => openSettings('illustration')}
                                className="text-[9.5px] text-emerald-700 hover:underline cursor-pointer"
                              >
                                {settings.imageGenProvider}
                              </button>
                            </div>
                            <div className="space-y-1">
                              {directives.map((d, di) => (
                                <div
                                  key={di}
                                  className="text-[10px] font-mono text-emerald-900 bg-white/80 px-1.5 py-0.5 rounded border border-emerald-100 truncate"
                                  title={d.prompt}
                                >
                                  • ({d.nodeId}) {d.prompt}
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                if (patch.status !== 'applied') {
                                  if (!applyPatchProposal(msg.id)) return;
                                }
                                await executeAgentImageDirectives(
                                  msg.id,
                                  patch.newTikzCode
                                );
                              }}
                              className="w-full py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-[10.5px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>
                                {isBusy
                                  ? '正在生成并抠图...'
                                  : `✨ 重新生成 ${directives.length} 张 AI 透明插图`}
                              </span>
                            </button>
                            {statusText && (
                              <div className="text-[10px] text-emerald-900">
                                {statusText}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Action Buttons: Apply (Auto-Cutout if @agent-image exists) / Revert / Open Code Tab */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {patch.status !== 'applied' ? (
                          <button
                            onClick={() =>
                              handleApplyPatchAndAutoCutout(
                                msg.id,
                                patch.newTikzCode
                              )
                            }
                            className="flex-1 py-1.5 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>应用到画布与代码</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => revertPatchProposal(msg.id)}
                            className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>撤回此修改</span>
                          </button>
                        )}
                        <button
                          onClick={() => setLeftTab('code')}
                          className="py-1.5 px-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-[11px] cursor-pointer"
                          title="在左侧 TikZ 代码标签页查看"
                        >
                          查看源码
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/80 border border-slate-200/70 rounded-2xl px-3 py-2 w-fit animate-shimmer">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse-dot" />
            <span>{activeProvider.name} 正在通过 ACP 生成结构化 TikZ...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 3. Progressive-Disclosure Workflow Bar + Context & Chat Input Area */}
      <div className="border-t border-slate-200/80 bg-white/75 p-2.5 space-y-2 relative">
        {/* Single Compact Workflow & Skill Row + Popover */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => runLocalAgentSkill('full_optimize')}
              disabled={isStreaming}
              className="text-[10.5px] px-2 py-1 rounded-full bg-indigo-50/90 border border-indigo-200 text-indigo-800 hover:bg-indigo-600 hover:text-white font-medium shrink-0 transition-colors cursor-pointer disabled:opacity-40"
              title="一键执行零重叠、层级对齐、顶刊色板、5点契约综合精修"
            >
              ✨ 综合精修
            </button>
            <button
              type="button"
              onClick={() =>
                setInputText(
                  PUBLICATION_WORKFLOW_TEMPLATES[0].buildPrompt(activeThemeId)
                )
              }
              disabled={isStreaming}
              className="text-[10.5px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 shrink-0 transition-colors cursor-pointer disabled:opacity-40"
              title={PUBLICATION_WORKFLOW_TEMPLATES[0].description}
            >
              📐 {PUBLICATION_WORKFLOW_TEMPLATES[0].label}
            </button>
            <button
              type="button"
              onClick={() => runLocalAgentSkill('theme_colorize')}
              disabled={isStreaming}
              className="text-[10.5px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 shrink-0 transition-colors cursor-pointer disabled:opacity-40"
              title="按主证据层级重绘顶刊语义色板"
            >
              🎯 主证据着色
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowWorkflowMenu((v) => !v)}
            className={`px-2 py-1 rounded-full text-[10.5px] font-medium border flex items-center gap-0.5 shrink-0 cursor-pointer transition-colors ${
              showWorkflowMenu
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <span>更多模板</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Popover Menu for Full Skills, Publication Templates & Quick Prompts */}
        {showWorkflowMenu && (
          <div
            ref={workflowMenuRef}
            className="absolute bottom-full left-2 right-2 mb-1.5 bg-white rounded-xl border border-slate-200 shadow-xl p-2.5 z-30 space-y-2.5 max-h-72 overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-[10.5px] font-semibold text-slate-700">
                ✦ 顶刊契约模板与单项规范体检
              </span>
              <button
                type="button"
                onClick={() => setShowWorkflowMenu(false)}
                className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                收起
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-medium text-slate-400">
                Nature Skills 5点契约工作流模板
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PUBLICATION_WORKFLOW_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setInputText(tpl.buildPrompt(activeThemeId));
                      setShowWorkflowMenu(false);
                    }}
                    className="text-left p-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100/70 transition-colors cursor-pointer"
                  >
                    <div className="text-[10.5px] font-semibold text-indigo-900">
                      ✦ {tpl.label}
                    </div>
                    <div className="text-[9.5px] text-slate-500 truncate mt-0.5">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-medium text-slate-400">
                单项规范体检与快捷指令
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    runLocalAgentSkill('auto_layout');
                    setShowWorkflowMenu(false);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-[10px] cursor-pointer"
                >
                  📐 零重叠自动排布
                </button>
                <button
                  type="button"
                  onClick={() => {
                    runLocalAgentSkill('theme_colorize');
                    setShowWorkflowMenu(false);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-[10px] cursor-pointer"
                >
                  🎨 顶刊色板重绘
                </button>
                <button
                  type="button"
                  onClick={() => {
                    runLocalAgentSkill('diagnose_canvas');
                    setShowWorkflowMenu(false);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-[10px] cursor-pointer"
                >
                  📋 5点契约与规范体检
                </button>
                {quickPrompts.map((qp, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      sendPromptToAgent(qp);
                      setShowWorkflowMenu(false);
                    }}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 text-[10px] cursor-pointer"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Compact Context Pills Row (@canvas & @selection & active theme & optional reference template) */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setAttachCanvasContext(!attachCanvasContext)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 cursor-pointer ${
                attachCanvasContext
                  ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <Layers className="w-2.5 h-2.5" />
              @canvas({parsedDoc.nodes.length})
            </button>

            <button
              onClick={() => setAttachSelectionContext(!attachSelectionContext)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                attachSelectionContext && selectedIds.length > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              @选中(
              {selectedIds.length > 0
                ? selectedIds.slice(0, 2).join(',')
                : '无'}
              )
            </button>

            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50/80 text-indigo-700 border border-indigo-200"
              title={`当前激活顶刊配色主题：${activeTheme.name}`}
            >
              @{activeThemeId}
            </span>
          </div>

          {referenceTemplate && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] text-blue-800 max-w-[140px]">
              <span className="truncate" title={referenceTemplate.title}>
                参考:{referenceTemplate.title}
              </span>
              <button
                onClick={() => setTemplateReference()}
                className="text-slate-400 hover:text-blue-700 shrink-0 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Multi-line Prompt Input Box */}
        <div className="relative bg-white border border-slate-200/80 rounded-2xl focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100/60 shadow-sm transition-all">
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="描述架构或局部修改需求（如：把注意力模块改为橙色、拉开垂直间距、添加残差跳线）..."
            className="w-full px-3 pt-2 pb-7 text-xs text-slate-800 bg-transparent resize-none focus:outline-none"
          />
          <div className="absolute bottom-1.5 left-2.5 right-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              增量 Diff · 契约自愈 · 透明插图联动
            </span>
            <button
              onClick={isStreaming ? () => void cancelPrompt() : handleSend}
              disabled={isStreaming ? !activeRequestId : !inputText.trim()}
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-200 disabled:to-slate-200 text-white text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm"
            >
              <span>{isStreaming ? '停止' : '发送'}</span>
              {isStreaming ? <Square className="w-3 h-3" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
