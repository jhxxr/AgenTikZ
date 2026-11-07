import React, { useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { FULL_FIGURE_TEMPLATES } from '../../core/templates/dl-templates';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { AcpAgentId } from '../../types/acp';
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
  Layers,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  ScanSearch,
  Send,
  Settings,
  Sparkles,
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
  } = useAgentStore();

  const {
    selectedIds,
    parsedDoc,
    activeThemeId,
    setLeftTab,
    isAgentPanelCollapsed,
    toggleAgentPanel,
  } = useWorkspaceStore();
  const { openSettings } = useSettingsStore();

  const [inputText, setInputText] = useState('');
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [previewTabByMsgId, setPreviewTabByMsgId] = useState<
    Record<string, 'closed' | 'diff' | 'code'>
  >({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const historyDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistoryDropdown) return;
    const handler = (e: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showHistoryDropdown]);

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
    <aside className="w-[360px] h-full bg-sidebar-gradient border-l border-slate-200/80 flex flex-col shrink-0 select-none">
      {/* 1. Top Agent Header & BYOA / ACP Switcher */}
      <div className="px-3 py-2.5 border-b border-slate-200/80 bg-white/70 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900">
                  Agent 协作窗口
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  AST · Diff · ACP
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => openSettings('agent')}
              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
              title="打开 Agent 设置 (适配器探测 / 握手测试 / 代理 / 提示词)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={createNewSession}
              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors"
              title="新建对话"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="relative" ref={historyDropdownRef}>
              <button
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors"
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
              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
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
              className="w-full appearance-none pl-6 pr-6 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
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
            <span>{autoLayoutRepairEnabled ? '自愈引擎 ON' : '自愈 OFF'}</span>
          </button>

          <button
            onClick={() => setShowAgentConfig(!showAgentConfig)}
            className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
            title="查看 ACP 协议命令详情"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 1-Click Agent Skills Bar (Local AST + Layout + Theme Palette Engine) */}
        <div className="pt-0.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => runLocalAgentSkill('full_optimize')}
            disabled={isStreaming}
            className="px-2 py-1 rounded-md bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-[10.5px] font-medium flex items-center gap-1 shrink-0 shadow-2xs transition-all cursor-pointer disabled:opacity-40"
            title="一键执行：垂直间距防遮挡 + 顶刊语义配色 + 无框标签修复 + 容器自适应"
          >
            <Wand2 className="w-3 h-3" />
            <span>一键综合精修</span>
          </button>
          <button
            type="button"
            onClick={() => runLocalAgentSkill('theme_colorize')}
            disabled={isStreaming}
            className="px-2 py-1 rounded-md bg-white hover:bg-blue-50/70 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 text-[10.5px] font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer disabled:opacity-40"
            title={`按当前顶刊主题 (${activeTheme.name}) 自动设计模块语义配色`}
          >
            <Palette className="w-3 h-3 text-indigo-600" />
            <span>顶刊配色</span>
          </button>
          <button
            type="button"
            onClick={() => runLocalAgentSkill('diagnose_canvas')}
            disabled={isStreaming}
            className="px-2 py-1 rounded-md bg-white hover:bg-blue-50/70 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 text-[10.5px] font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer disabled:opacity-40"
            title="检查节点重叠、箭头遮挡、无框公式与配色一致性"
          >
            <ScanSearch className="w-3 h-3 text-emerald-600" />
            <span>布局诊断</span>
          </button>
        </div>

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
                            ({tc.argsSummary})
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

                      {/* Action Buttons: Apply / Revert / Open Code Tab */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {patch.status !== 'applied' ? (
                          <button
                            onClick={() => applyPatchProposal(msg.id)}
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

      {/* 3. Quick Prompt Chips + Bottom Context & Chat Input Area */}
      <div className="border-t border-slate-200/80 bg-white/60 p-2.5 space-y-2">
        {/* Quick Suggestion Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {quickPrompts.map((qp, i) => (
            <button
              key={i}
              onClick={() => sendPromptToAgent(qp)}
              disabled={isStreaming}
              className="text-[10.5px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700 shrink-0 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Context Pills Row (@canvas & @selection & active theme) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-400">上下文:</span>
          <button
            onClick={() => setAttachCanvasContext(!attachCanvasContext)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 cursor-pointer ${
              attachCanvasContext
                ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            <Layers className="w-2.5 h-2.5" />
            @canvas({parsedDoc.nodes.length}节点)
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
            {selectedIds.length > 0 ? selectedIds.slice(0, 2).join(',') : '无'})
          </button>

          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50/80 text-indigo-700 border border-indigo-200"
            title={`当前激活顶刊配色主题：${activeTheme.name}`}
          >
            @{activeThemeId}色板
          </span>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-blue-800 truncate" title={referenceTemplate?.title}>
              {referenceTemplate ? `构图参考：${referenceTemplate.title}` : '已挂载组件库 · 顶刊配色 · 增量 Diff 引擎'}
            </span>
            {referenceTemplate && (
              <button onClick={() => setTemplateReference()} className="shrink-0 text-slate-500 hover:text-blue-700 cursor-pointer">清除</button>
            )}
          </div>
          <p className="mt-1 text-slate-500">
            支持局部 SEARCH/REPLACE 增量修改、自动防重叠间距计算与 {activeTheme.name.split(' ')[0]} 语义配色。
          </p>
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
              增量 Diff · 组件库 · 防重叠自愈
            </span>
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isStreaming}
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-200 disabled:to-slate-200 text-white text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm"
            >
              <span>发送</span>
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
