import React, { useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { AcpAgentId } from '../../types/acp';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  History,
  Layers,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  Wrench,
} from 'lucide-react';

export const RightAgentPanel: React.FC = () => {
  const {
    providers,
    activeAgentId,
    mcpServerEnabled,
    attachCanvasContext,
    attachSelectionContext,
    isStreaming,
    sessions,
    activeSessionId,
    setActiveAgentId,
    setMcpServerEnabled,
    setAttachCanvasContext,
    setAttachSelectionContext,
    createNewSession,
    switchSession,
    probeLocalAgents,
    sendPromptToAgent,
    applyPatchProposal,
    revertPatchProposal,
  } = useAgentStore();

  const { selectedIds, parsedDoc, setLeftTab } = useWorkspaceStore();

  const [inputText, setInputText] = useState('');
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [expandedCodeIds, setExpandedCodeIds] = useState<Record<string, boolean>>({});
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
  const activeProvider =
    providers.find((p) => p.id === activeAgentId) || providers[0];

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

  const quickPrompts = [
    '为当前选中节点添加正交残差跳线',
    '在选中模块旁添加跨模态注意力分支',
    '在右侧添加 Cross-Attention 注意力热力图',
    '生成 CVPR 多尺度 3D 视觉特征金字塔',
  ];

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
                  BYOA · ACP
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
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
          </div>
        </div>

        {/* Agent CLI Selector + MCP Status Row */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <select
              value={activeAgentId}
              onChange={(e) => setActiveAgentId(e.target.value as AcpAgentId)}
              className="w-full appearance-none pl-6 pr-6 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
            onClick={() => setMcpServerEnabled(!mcpServerEnabled)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium border flex items-center gap-1 shrink-0 ${
              mcpServerEnabled
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
            title="内置 AgentTikZ MCP Server（暴露画布 AST 与局部修补工具）"
          >
            <Cpu className="w-3 h-3" />
            <span>MCP</span>
          </button>

          <button
            onClick={() => setShowAgentConfig(!showAgentConfig)}
            className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="查看 ACP 协议命令详情"
          >
            <Terminal className="w-3.5 h-3.5" />
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
            <div className="px-2 py-1 rounded bg-slate-50 font-mono text-[10px] text-slate-700 border border-slate-100 truncate">
              $ {activeProvider.command} {activeProvider.args.join(' ')}
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              {activeProvider.description}。凭证由本地 Agent CLI 自身管理，上下文 100% 留在本地。
            </p>
          </div>
        )}
      </div>

      {/* 2. Middle Scrollable Chat Conversation Window */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white select-text">
        {activeSession?.messages.map((msg) => (
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
                          {tc.toolName.replace('mcp__agenttikz__', '')}
                        </strong>
                        <span className="text-slate-400 truncate">
                          ({tc.argsSummary})
                        </span>
                      </span>
                      <Check className="w-3 h-3 text-emerald-600 shrink-0 ml-1" />
                    </div>
                  ))}
                </div>
              )}

              {/* Message Text */}
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* TikZ Code Patch Proposal Card */}
              {msg.patchProposal && (
                <div className="mt-2 bg-white border border-blue-200 rounded-lg overflow-hidden shadow-2xs">
                  <div className="px-2.5 py-1.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-blue-900 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-blue-600" />
                      {msg.patchProposal.summary}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                        msg.patchProposal.status === 'applied'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {msg.patchProposal.status === 'applied' ? '已应用' : '待确认'}
                    </span>
                  </div>

                  <div className="p-2.5 space-y-2">
                    <p className="text-[11px] text-slate-500">
                      {msg.patchProposal.rationale}
                    </p>

                    {/* Expandable TikZ Code Preview */}
                    <button
                      onClick={() =>
                        setExpandedCodeIds((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="text-[10.5px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Code2 className="w-3 h-3" />
                      <span>
                        {expandedCodeIds[msg.id]
                          ? '收起生成的 TikZ 源码'
                          : '预览生成的干净 TikZ 源码'}
                      </span>
                    </button>

                    {expandedCodeIds[msg.id] && (
                      <pre className="p-2 rounded bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-700 max-h-40 overflow-auto leading-snug">
                        {msg.patchProposal.newTikzCode}
                      </pre>
                    )}

                    {/* Action Buttons: Apply / Revert / Open Code Tab */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {msg.patchProposal.status !== 'applied' ? (
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
                        className="py-1.5 px-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-[11px]"
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
        ))}

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

        {/* Context Pills Row (@canvas & @selection) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-400">附加上下文:</span>
          <button
            onClick={() => setAttachCanvasContext(!attachCanvasContext)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
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
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
              attachSelectionContext && selectedIds.length > 0
                ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            @选中(
            {selectedIds.length > 0 ? selectedIds.slice(0, 2).join(',') : '无'})
          </button>
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
            placeholder="输入自然语言指令生成或修改选中图元 (Enter 发送)..."
            className="w-full px-3 pt-2 pb-7 text-xs text-slate-800 bg-transparent resize-none focus:outline-none"
          />
          <div className="absolute bottom-1.5 left-2.5 right-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              生成语义化 TikZ · 保留注释
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
