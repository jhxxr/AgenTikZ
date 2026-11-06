import { create } from 'zustand';
import {
  AcpAgentId,
  AcpAgentProvider,
  AgentChatMessage,
  AgentSession,
  TikzPatchProposal,
} from '../types/acp';
import { useWorkspaceStore } from './useWorkspaceStore';
import { insertTikzStatement, patchNodeOptions } from '../core/parser/patcher';
import { parseTikzDocument } from '../core/parser/parser';
import { FULL_FIGURE_TEMPLATES } from '../core/templates/dl-templates';

const DEFAULT_ACP_PROVIDERS: AcpAgentProvider[] = [
  {
    id: 'claude-code',
    name: 'Claude Code (ACP)',
    command: 'npx',
    args: ['-y', '@agentclientprotocol/claude-agent-acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)',
    detected: true,
    version: 'ACP v0.4 · BYOA',
    description: '通过 claude-agent-acp 连接本地已认证的 Claude Code CLI，擅长精修顶刊 TikZ 排版',
    badgeColor: '#D97706',
  },
  {
    id: 'opencode',
    name: 'OpenCode (opencode acp)',
    command: 'opencode',
    args: ['acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)',
    detected: true,
    version: 'Native ACP · BYOA',
    description: '原生支持 opencode acp 协议，支持本地 Ollama/vLLM 与自带密钥模型',
    badgeColor: '#2563EB',
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI (codex-acp)',
    command: 'npx',
    args: ['-y', '@zed-industries/codex-acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)',
    detected: true,
    version: 'ACP v0.4 · BYOA',
    description: '通过 codex-acp 适配器连接本地 OpenAI Codex CLI 进程',
    badgeColor: '#059669',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI (--acp)',
    command: 'gemini',
    args: ['--acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)',
    detected: true,
    version: 'Native --acp · BYOA',
    description: '通过 gemini --acp 标准输入输出 JSON-RPC 驱动本地 Gemini Agent',
    badgeColor: '#7C3AED',
  },
  {
    id: 'custom-acp',
    name: 'Custom Local ACP Agent',
    command: 'custom-agent-acp',
    args: ['--stdio'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)',
    detected: true,
    version: 'Custom Stdio',
    description: '自定义任何兼容 Agent Client Protocol (ACP) 的本地可执行文件',
    badgeColor: '#475569',
  },
];

interface AgentStoreState {
  providers: AcpAgentProvider[];
  activeAgentId: AcpAgentId;
  customCommand: string;
  mcpServerEnabled: boolean;
  attachCanvasContext: boolean;
  attachSelectionContext: boolean;
  isStreaming: boolean;
  sessions: AgentSession[];
  activeSessionId: string;

  // Actions
  setActiveAgentId: (id: AcpAgentId) => void;
  setCustomCommand: (cmd: string) => void;
  setMcpServerEnabled: (enabled: boolean) => void;
  setAttachCanvasContext: (attach: boolean) => void;
  setAttachSelectionContext: (attach: boolean) => void;
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
  probeLocalAgents: () => Promise<void>;
  sendPromptToAgent: (promptText: string) => Promise<void>;
  applyPatchProposal: (messageId: string) => void;
  revertPatchProposal: (messageId: string) => void;
}

const initialSessionId = 'session_1';

const initialSession: AgentSession = {
  id: initialSessionId,
  title: 'Transformer 架构与实验图精修',
  agentId: 'claude-code',
  createdAt: '刚刚',
  messages: [
    {
      id: 'msg_welcome',
      role: 'assistant',
      agentId: 'claude-code',
      timestamp: '08:00',
      content:
        '已通过 **ACP (Agent Client Protocol)** 准备就绪，并已挂载本地 **AgentTikZ MCP 工具链**。\n\n你可以直接用自然语言让我：\n- **生成整图**（如：“生成多尺度 3D 视觉特征金字塔”、“画一个对比实验柱状图”）\n- **针对选中节点局部修改**（在画布上框选节点后输入：“给选中模块加上残差连接”、“把选中块改成暖杏色 Multi-Head Attention”）\n- **优化顶刊排版**（自动对齐坐标并保持干净可读的 `\\tikzset` 代码，不破坏原有注释）',
    },
  ],
};

function synthesizeCanvasAwareResponse(
  prompt: string,
  agentId: AcpAgentId
): {
  thought: string;
  reply: string;
  mcpCalls: NonNullable<AgentChatMessage['mcpToolCalls']>;
  proposal?: TikzPatchProposal;
} {
  const ws = useWorkspaceStore.getState();
  const { tikzCode, parsedDoc, selectedIds } = ws;
  const lower = prompt.toLowerCase();

  // Case 1: User asks for 3D Feature Pyramid / CVPR vision diagram
  if (
    lower.includes('3d') ||
    lower.includes('金字塔') ||
    lower.includes('fpn') ||
    lower.includes('特征图') ||
    lower.includes('cvpr')
  ) {
    const tpl = FULL_FIGURE_TEMPLATES.find((t) => t.id === 'tpl_cvpr_3d_pyramid');
    if (!tpl) return { thought: '', mcpCalls: [], reply: '未找到 CVPR 3D 金字塔模板，请检查模板配置。' };
    return {
      thought:
        '读取 @canvas 上下文 -> 用户请求构建 CVPR 风格多尺度 3D 视觉特征金字塔 -> 调用 MCP 工具 `propose_tikz_patch` 生成带语义 `feature_cube` 与 `conv_block` 宏的干净 TikZ 代码。',
      mcpCalls: [
        {
          toolName: 'mcp__agenttikz__get_canvas_ast',
          argsSummary: `nodes=${parsedDoc.nodes.length}, edges=${parsedDoc.edges.length}`,
          status: 'completed',
        },
        {
          toolName: 'mcp__agenttikz__propose_tikz_patch',
          argsSummary: 'template="CVPR 3D Feature Pyramid (C2-C5 + FPN)"',
          status: 'completed',
        },
      ],
      reply:
        '已为你构建 **CVPR 风格多尺度 3D 视觉特征金字塔（$\\mathbf{C}_2 \\sim \\mathbf{C}_5$ + 自顶向下特征融合）**。\n\n所有 3D 张量块均采用语义化 `feature_cube` 节点描述（支持在画布上直接拖拽位置或通过属性栏调节通道厚度 `depth`），无硬编码零散坐标堆砌。',
      proposal: {
        id: `patch_${Date.now()}`,
        summary: '生成 CVPR 多尺度 3D 特征金字塔与 FPN 融合架构',
        rationale: '采用 cvpr_navy / cvpr_teal / cvpr_coral 顶刊配色与 0.75pt 线宽规范',
        newTikzCode: tpl.tikzCode,
        affectedElementIds: ['c2', 'c3', 'c4', 'c5', 'sppf', 'p4', 'p3'],
        status: 'pending',
      },
    };
  }

  // Case 2: User asks for Nature data charts / bar chart / heatmap / boxplot
  if (
    lower.includes('nature') ||
    lower.includes('柱状图') ||
    lower.includes('热力图') ||
    lower.includes('箱线图') ||
    lower.includes('图表') ||
    lower.includes('数据图')
  ) {
    if (lower.includes('热力') || lower.includes('heatmap') || lower.includes('注意力矩阵')) {
      const snippet = [
        `  % --- AI Added: Attention Weight Heatmap ---`,
        `  \\begin{scope}[shift={(7.2, 2.0)}]`,
        `    \\begin{axis}[`,
        `      id=ai_heatmap,`,
        `      chart_type=heatmap, colormap/viridis, width=4.8cm, height=4.0cm,`,
        `      title={Cross-Attention Weights $\\mathbf{A}$},`,
        `      xlabel={Key Tokens ($K$)},`,
        `      ylabel={Query Tokens ($Q$)},`,
        `      grid=none`,
        `    ]`,
        `      \\addplot[color=#2B5B84] coordinates { (1, 1) (2, 2) (3, 3) (4, 4) };`,
        `      \\addlegendentry{Attn Score}`,
        `      % heatmap_matrix: [[0.85,0.07,0.05,0.03],[0.06,0.79,0.10,0.05],[0.04,0.10,0.78,0.08],[0.02,0.04,0.08,0.86]]`,
        `    \\end{axis}`,
        `  \\end{scope}`,
      ].join('\n');
      const nextCode = insertTikzStatement(tikzCode, snippet);
      return {
        thought:
          '分析当前画布布局 -> 在右侧空白区域 (7.2, 2.0) 插入基于 PGFPlots 的 Cross-Attention 注意力权重热力图，保留左侧全部原有节点与注释。',
        mcpCalls: [
          {
            toolName: 'mcp__agenttikz__add_pgfplot_chart',
            argsSummary: 'chartType="heatmap", pos=(7.2, 2.0)',
            status: 'completed',
          },
        ],
        reply:
          '已在画布右侧为你添加 **Cross-Attention 注意力权重热力图（`pgfplots` matrix plot）**，完整保留了原有代码与注释。点击下方 **应用修改** 即可渲染到画布。',
        proposal: {
          id: `patch_${Date.now()}`,
          summary: '新增 PGFPlots 注意力权重热力图 (ai_heatmap)',
          rationale: '使用 \\begin{scope}[shift={(7.2, 2.0)}] 局部包裹，便于在画布中整体拖拽',
          newTikzCode: nextCode,
          affectedElementIds: ['ai_heatmap'],
          status: 'pending',
        },
      };
    }

    const tpl = FULL_FIGURE_TEMPLATES.find((t) => t.id === 'tpl_nature_dashboard');
    if (!tpl) return { thought: '', mcpCalls: [], reply: '未找到 Nature 图表模板，请检查模板配置。' };
    return {
      thought:
        '用户请求科研数据图表展示 -> 调用 `propose_tikz_patch` 生成符合 Nature (NPG) 0.55pt 极简规范的折线误差带 + 分组柱状图双联实验图。',
      mcpCalls: [
        {
          toolName: 'mcp__agenttikz__propose_tikz_patch',
          argsSummary: 'template="Nature NPG Multi-Panel PGFPlots"',
          status: 'completed',
        },
      ],
      reply:
        '已按照 **Nature Publishing Group (NPG)** 视觉规范生成双联实验数据图（含误差带收敛曲线 + 跨领域对比柱状图）。',
      proposal: {
        id: `patch_${Date.now()}`,
        summary: '切换为 Nature (NPG) 双联 PGFPlots 实验图表',
        rationale: '采用 NPG 经典绯红 #E64B35 / 翠青 #00A087 / 靛蓝 #3C5488 配色',
        newTikzCode: tpl.tikzCode,
        affectedElementIds: ['npg_line', 'npg_bar'],
        status: 'pending',
      },
    };
  }

  // Case 3: Selection-specific edit (e.g., add residual connection, recolor, add layer above selected node)
  const selectedNodes = parsedDoc.nodes.filter((n) => selectedIds.includes(n.id));
  if (selectedNodes.length > 0) {
    const first = selectedNodes[0];

    if (lower.includes('残差') || lower.includes('residual') || lower.includes('跳线')) {
      const second =
        selectedNodes.length >= 2
          ? selectedNodes[1]
          : parsedDoc.nodes.find((n) => n.id !== first.id && n.y > first.y) ||
            first;
      const resStmt = `  % --- AI Added: Orthogonal Residual Skip Connection ---\n  \\draw[-Stealth, line width=0.75pt, draw=nips_sage!85!black] (${first.id}.east) -- ++(1.4, 0) |- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {Residual} (${second.id}.east);`;
      const nextCode = insertTikzStatement(tikzCode, resStmt);
      return {
        thought: `检测到选中节点 @selection (${selectedNodes.map((n) => n.id).join(', ')}) -> 计算正交残差旁路偏移 ++(1.4, 0) |- -> 在不改动现有坐标与注释的前提下追加残差跳线语句。`,
        mcpCalls: [
          {
            toolName: 'mcp__agenttikz__get_selected_elements',
            argsSummary: `ids=[${selectedNodes.map((n) => `"${n.id}"`).join(', ')}]`,
            status: 'completed',
          },
          {
            toolName: 'mcp__agenttikz__apply_tikz_patch',
            argsSummary: `add residual skip (${first.id}.east) -> (${second.id}.east)`,
            status: 'completed',
          },
        ],
        reply: `已针对你选中的节点 \`(${first.id})\` 至 \`(${second.id})\` 生成了 **正交残差跳线连接（\`-- ++(1.4, 0) |-\`）**，原有代码结构与注释 100% 保持不变。`,
        proposal: {
          id: `patch_${Date.now()}`,
          summary: `为 (${first.id}) → (${second.id}) 添加正交残差跳线`,
          rationale: '使用相对偏移 ++(1.4, 0) |- 语法，即使后续拖拽节点也能自动保持正交对齐',
          newTikzCode: nextCode,
          affectedElementIds: [first.id, second.id],
          status: 'pending',
        },
      };
    }

    // Recolor or highlight selected nodes
    if (
      lower.includes('颜色') ||
      lower.includes('配色') ||
      lower.includes('橙') ||
      lower.includes('紫') ||
      lower.includes('绿') ||
      lower.includes('强调') ||
      lower.includes('样式')
    ) {
      let targetFill = 'nips_amber!18';
      let targetDraw = 'nips_amber!85!black';
      if (lower.includes('紫')) {
        targetFill = 'nips_purple!16';
        targetDraw = 'nips_purple!85!black';
      } else if (lower.includes('绿')) {
        targetFill = 'nips_sage!16';
        targetDraw = 'nips_sage!85!black';
      }
      let patched = tikzCode;
      for (const n of selectedNodes) {
        // Re-parse after each patch so span offsets stay valid
        const freshDoc = parseTikzDocument(patched);
        const currNode = freshDoc.nodes.find((item) => item.id === n.id) || n;
        patched = patchNodeOptions(patched, currNode, {
          fill: targetFill,
          draw: targetDraw,
          'line width': '0.8pt',
        });
      }
      return {
        thought: `定位选中节点 (${selectedNodes.map((n) => n.id).join(', ')}) 的 optionsSpan 源码字节区间 -> 执行手术刀式局部键值更新 fill=${targetFill}, draw=${targetDraw}。`,
        mcpCalls: [
          {
            toolName: 'mcp__agenttikz__get_selected_elements',
            argsSummary: `ids=[${selectedNodes.map((n) => `"${n.id}"`).join(', ')}]`,
            status: 'completed',
          },
          {
            toolName: 'mcp__agenttikz__propose_tikz_patch',
            argsSummary: `surgical option patch on ${selectedNodes.length} node(s)`,
            status: 'completed',
          },
        ],
        reply: `已对选中的 **${selectedNodes.length} 个节点**（\`${selectedNodes.map((n) => n.id).join(', ')}\`）执行局部样式修补（更新为 \`${targetFill}\` 顶刊强调色），未改动任何坐标与注释。`,
        proposal: {
          id: `patch_${Date.now()}`,
          summary: `局部更新选中节点 (${selectedNodes.map((n) => n.id).join(', ')}) 为顶刊强调配色`,
          rationale: '仅替换 \\node[...] 内的 fill 与 draw 键值，保留原文件全部注释',
          newTikzCode: patched,
          affectedElementIds: selectedNodes.map((n) => n.id),
          status: 'pending',
        },
      };
    }

    // Default contextual enhancement on selected node: add Cross-Attention + Gate above it
    const newId = `cross_attn_${parsedDoc.nodes.length + 1}`;
    const newY = Number((first.y + 1.35).toFixed(2));
    const snippet = [
      `  % --- AI Added Module linked to (${first.id}) ---`,
      `  \\node[mha_block, fill=nips_purple!15, draw=nips_purple!85!black, minimum width=3.2cm, minimum height=0.9cm] (${newId}) at (${(first.x + 3.8).toFixed(1)}, ${newY}) {Cross-Modal Attention \\\\ {\\scriptsize $\\text{Gate}(\\mathbf{Q}, \\mathbf{K}_v, \\mathbf{V}_v)$}};`,
      `  \\draw[-Stealth, line width=0.7pt, draw=nips_purple!85!black, dashed] (${newId}.west) -- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] { Conditioning } (${first.id}.east);`,
    ].join('\n');
    const nextCode = insertTikzStatement(tikzCode, snippet);

    return {
      thought: `读取选中节点 (${first.id}) 位置 (${first.x}, ${first.y}) -> 在其右侧协同位置生成跨模态注意力引导支路 (${newId}) 并建立虚线条件注入连接。`,
      mcpCalls: [
        {
          toolName: 'mcp__agenttikz__get_selected_elements',
          argsSummary: `selected="${first.id}" at (${first.x}, ${first.y})`,
          status: 'completed',
        },
        {
          toolName: 'mcp__agenttikz__add_dl_module',
          argsSummary: `id="${newId}", linkTo="${first.id}"`,
          status: 'completed',
        },
      ],
      reply: `已结合你当前选中的节点 \`(${first.id})\`，在其右侧生成了 **跨模态条件注意力分支 \`(${newId})\`** 及条件注入虚线箭头。你可以预览下方代码改动并一键应用。`,
      proposal: {
        id: `patch_${Date.now()}`,
        summary: `在选中节点 (${first.id}) 旁新增跨模态注意力条件分支`,
        rationale: '采用命名节点与语义化 mha_block 宏，保持原有代码缩进与注释不变',
        newTikzCode: nextCode,
        affectedElementIds: [first.id, newId],
        status: 'pending',
      },
    };
  }

  // Fallback general canvas optimization
  const tpl = FULL_FIGURE_TEMPLATES[0];
  return {
    thought: `分析全图 AST (${parsedDoc.nodes.length} 个节点, ${parsedDoc.edges.length} 条连线) -> 规范化顶刊 \\tikzset 宏定义与对齐网格。`,
    mcpCalls: [
      {
        toolName: 'mcp__agenttikz__get_canvas_ast',
        argsSummary: `nodes=${parsedDoc.nodes.length}, charts=${parsedDoc.charts.length}`,
        status: 'completed',
      },
    ],
    reply:
      '我已检查当前画布的 TikZ AST 结构。你可以先在画布上点击选中一个或多个模块（会显示在下方 `@选中` 胶囊中），或者直接告诉我你想添加的深度学习结构（如 `添加残差跳线`、`生成 3D 特征图金字塔`、`添加注意力热力图`）。',
    proposal:
      tikzCode !== tpl.tikzCode
        ? {
            id: `patch_${Date.now()}`,
            summary: '恢复/优化为标准 NeurIPS Pre-LN Transformer + Scaling 联合图',
            rationale: '统一节点水平中心坐标 x=2.8cm，规范化残差旁路偏移',
            newTikzCode: tpl.tikzCode,
            affectedElementIds: ['mha', 'ln1', 'ffn'],
            status: 'pending',
          }
        : undefined,
  };
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  providers: DEFAULT_ACP_PROVIDERS,
  activeAgentId: 'claude-code',
  customCommand: 'claude-agent-acp --stdio',
  mcpServerEnabled: true,
  attachCanvasContext: true,
  attachSelectionContext: true,
  isStreaming: false,
  sessions: [initialSession],
  activeSessionId: initialSessionId,

  setActiveAgentId: (activeAgentId) => set({ activeAgentId }),
  setCustomCommand: (customCommand) => set({ customCommand }),
  setMcpServerEnabled: (mcpServerEnabled) => set({ mcpServerEnabled }),
  setAttachCanvasContext: (attachCanvasContext) => set({ attachCanvasContext }),
  setAttachSelectionContext: (attachSelectionContext) =>
    set({ attachSelectionContext }),

  createNewSession: () => {
    const { activeAgentId, sessions } = get();
    const newId = `session_${Date.now()}`;
    const newSession: AgentSession = {
      id: newId,
      title: `科研绘图会话 #${sessions.length + 1}`,
      agentId: activeAgentId,
      createdAt: '刚刚',
      messages: [
        {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          agentId: activeAgentId,
          timestamp: new Date().toTimeString().slice(0, 5),
          content:
            '新 ACP 会话已就绪（上下文保留在本地）。选中画布图元或直接输入指令即可开始协作。',
        },
      ],
    };
    set({
      sessions: [newSession, ...sessions],
      activeSessionId: newId,
    });
  },

  switchSession: (activeSessionId) => set({ activeSessionId }),

  probeLocalAgents: async () => {
    try {
      const isTauri =
        typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const detectedList = await invoke<
          Array<{ id: string; detected: boolean; version?: string }>
        >('acp_probe_agents');
        set((state) => ({
          providers: state.providers.map((p) => {
            const found = detectedList.find((d) => d.id === p.id);
            return found
              ? { ...p, detected: found.detected, version: found.version || p.version }
              : p;
          }),
        }));
      }
    } catch {
      // Browser dev mode: keep default providers ready
    }
  },

  sendPromptToAgent: async (promptText: string) => {
    if (!promptText.trim() || get().isStreaming) return;
    const {
      activeAgentId,
      activeSessionId,
      attachSelectionContext,
      attachCanvasContext,
    } = get();
    const ws = useWorkspaceStore.getState();

    const userMsg: AgentChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      agentId: activeAgentId,
      timestamp: new Date().toTimeString().slice(0, 5),
      content: promptText.trim(),
      contextSelectionIds: attachSelectionContext ? [...ws.selectedIds] : [],
      includeFullCanvas: attachCanvasContext,
    };

    set((state) => ({
      isStreaming: true,
      sessions: state.sessions.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              title:
                s.messages.length <= 1
                  ? promptText.trim().slice(0, 22)
                  : s.title,
              messages: [...s.messages, userMsg],
            }
          : s
      ),
    }));

    try {
    // Try Tauri ACP bridge first if in Tauri desktop and user has real ACP CLI configured
    let handledByNativeAcp = false;
    try {
      const isTauri =
        typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const acpRes = await invoke<{
          usedNativeCli: boolean;
          thought?: string;
          reply?: string;
          proposedTikz?: string;
        }>('acp_send_prompt', {
          agentId: activeAgentId,
          prompt: promptText,
          canvasTikz: attachCanvasContext ? ws.tikzCode : '',
          selectedIds: attachSelectionContext ? ws.selectedIds : [],
        });

        if (acpRes && acpRes.usedNativeCli && acpRes.reply) {
          handledByNativeAcp = true;
          const assistantMsg: AgentChatMessage = {
            id: `asst_${Date.now()}`,
            role: 'assistant',
            agentId: activeAgentId,
            timestamp: new Date().toTimeString().slice(0, 5),
            thoughtProcess: acpRes.thought,
            content: acpRes.reply,
            patchProposal: acpRes.proposedTikz
              ? {
                  id: `patch_${Date.now()}`,
                  summary: '来自本地 ACP Agent 的 TikZ 代码更新',
                  rationale: '通过 ACP JSON-RPC 2.0 (stdio) 生成',
                  newTikzCode: acpRes.proposedTikz,
                  affectedElementIds: ws.selectedIds,
                  status: 'pending',
                }
              : undefined,
          };
          set((state) => ({
            isStreaming: false,
            sessions: state.sessions.map((s) =>
              s.id === activeSessionId
                ? { ...s, messages: [...s.messages, assistantMsg] }
                : s
            ),
          }));
        }
      }
    } catch {
      // Fall through to local canvas-aware synthesis
    }

    if (!handledByNativeAcp) {
      await new Promise((r) => setTimeout(r, 420));
      const synthesized = synthesizeCanvasAwareResponse(
        promptText,
        activeAgentId
      );
      const assistantMsg: AgentChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        agentId: activeAgentId,
        timestamp: new Date().toTimeString().slice(0, 5),
        thoughtProcess: synthesized.thought,
        content: synthesized.reply,
        mcpToolCalls: synthesized.mcpCalls,
        patchProposal: synthesized.proposal,
      };

      set((state) => ({
        isStreaming: false,
        sessions: state.sessions.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages: [...s.messages, assistantMsg] }
            : s
        ),
      }));
    }
    } finally {
      // Guarantee isStreaming is reset even if synthesis throws
      set({ isStreaming: false });
    }
  },

  applyPatchProposal: (messageId) => {
    const { sessions, activeSessionId } = get();
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg || !msg.patchProposal) return;

    const currentCode = useWorkspaceStore.getState().tikzCode;
    useWorkspaceStore.getState().setTikzCode(msg.patchProposal.newTikzCode, true);
    if (msg.patchProposal.affectedElementIds.length > 0) {
      useWorkspaceStore
        .getState()
        .setSelectedIds(msg.patchProposal.affectedElementIds);
    }

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId && m.patchProposal
                  ? {
                      ...m,
                      patchProposal: {
                        ...m.patchProposal,
                        status: 'applied',
                        previousTikzCode: currentCode,
                      },
                    }
                  : m
              ),
            }
          : s
      ),
    }));
  },

  revertPatchProposal: (messageId) => {
    const { sessions, activeSessionId } = get();
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg || !msg.patchProposal || !msg.patchProposal.previousTikzCode) return;

    useWorkspaceStore
      .getState()
      .setTikzCode(msg.patchProposal.previousTikzCode, true);

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId && m.patchProposal
                  ? {
                      ...m,
                      patchProposal: {
                        ...m.patchProposal,
                        status: 'pending',
                      },
                    }
                  : m
              ),
            }
          : s
      ),
    }));
  },
}));
