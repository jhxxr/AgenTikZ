import { JournalThemeId } from '../../types/theme';

export type FigureArchetype =
  | 'quantitative_grid'
  | 'schematic_led_composite'
  | 'image_plate_plus_quant'
  | 'asymmetric_mixed_modality';

export type PanelEvidenceRole =
  | 'mechanism'            // 机制/架构示意图 (Setup / Schematic)
  | 'representative_case'  // 代表性定性样本 (Representative Example)
  | 'primary_quant'        // 主定量证据 (Primary Quantitative Evidence)
  | 'baseline_control'     // 对照与基线对比 (Baseline / Control)
  | 'ablation'             // 消融与模块分解 (Decomposition / Ablation)
  | 'stratification'       // 子群体/尺度分层 (Stratification / Scaling)
  | 'orthogonal_val'       // 正交验证 (Orthogonal Validation)
  | 'stress_test'          // 扰动/压力测试 (Perturbation / Stress Test)
  | 'failure_boundary'     // 边界/失败案例分析 (Boundary / Failure Case)
  | 'mechanistic_probe';   // 内部机理探针 (Mechanistic Attention/Feature Probe)

export interface TikzPanelRegion {
  id: string;
  label: string;           // e.g. 'a', 'b', '(a)'
  role: PanelEvidenceRole;
  title: string;
  bbox?: [number, number, number, number]; // [minX, minY, maxX, maxY] in TikZ cm
}

export interface FigureContract {
  claim: string;                       // 一句话核心科学结论
  archetype: FigureArchetype;          // 构图原型
  columnMode: 'single' | 'double';     // 单栏 (89mm) 或 双栏 (183mm)
  heroIds: string[];                   // 本文核心创新模块节点 ID (Ours)
  uncertaintyNote?: string;            // 误差定义说明 e.g. "Mean ± SD across 5 seeds"
}

export interface AgentImageDirective {
  nodeId: string;
  path: string;
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '4:3' | '3:2';
  stylePreset?: 'flat_vector' | 'isometric_3d' | 'bio_medical' | 'hardware_render';
}

export interface ParsedPragmaMetadata {
  contract?: FigureContract;
  panels: TikzPanelRegion[];
  imageDirectives: AgentImageDirective[];
}

/**
 * 从 TikZ 源码或 Agent 回复文本中无损解析 `% @figure-contract`、`% @panel`、`% @agent-image` 指令
 */
export function parsePragmaDirectivesFromSource(text: string): ParsedPragmaMetadata {
  let contract: FigureContract | undefined;
  const panels: TikzPanelRegion[] = [];
  const imageDirectives: AgentImageDirective[] = [];
  const seenImageNodes = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // 1. % @figure-contract {...}
    const contractMatch = /^%?\s*@figure-contract\s+(\{[\s\S]+\})$/i.exec(trimmed);
    if (contractMatch) {
      try {
        const parsed = JSON.parse(contractMatch[1]);
        if (parsed && typeof parsed === 'object') {
          contract = {
            claim: String(parsed.claim || 'Core scientific claim of this figure'),
            archetype: (parsed.archetype as FigureArchetype) || 'schematic_led_composite',
            columnMode: parsed.columnMode === 'single' ? 'single' : 'double',
            heroIds: Array.isArray(parsed.heroIds) ? parsed.heroIds.map(String) : [],
            uncertaintyNote: parsed.uncertaintyNote ? String(parsed.uncertaintyNote) : undefined,
          };
        }
      } catch {
        // Ignore malformed JSON pragma
      }
      continue;
    }

    // 2. % @panel {...}
    const panelMatch = /^%?\s*@panel\s+(\{[\s\S]+\})$/i.exec(trimmed);
    if (panelMatch) {
      try {
        const parsed = JSON.parse(panelMatch[1]);
        if (parsed && typeof parsed === 'object' && parsed.id) {
          panels.push({
            id: String(parsed.id),
            label: String(parsed.label || parsed.id),
            role: (parsed.role as PanelEvidenceRole) || 'mechanism',
            title: String(parsed.title || ''),
            bbox:
              Array.isArray(parsed.bbox) && parsed.bbox.length === 4
                ? [
                    Number(parsed.bbox[0]),
                    Number(parsed.bbox[1]),
                    Number(parsed.bbox[2]),
                    Number(parsed.bbox[3]),
                  ]
                : undefined,
          });
        }
      } catch {
        // Ignore malformed JSON pragma
      }
      continue;
    }

    // 3. % @agent-image {...} or @agent-image {...}
    const imgMatch = /^%?\s*@agent-image\s+(\{[\s\S]+\})$/i.exec(trimmed);
    if (imgMatch) {
      try {
        const parsed = JSON.parse(imgMatch[1]);
        if (parsed && typeof parsed === 'object' && parsed.prompt) {
          const nodeId = String(parsed.nodeId || `illust_${imageDirectives.length + 1}`);
          const path = String(parsed.path || `figures/assets/ai/${nodeId}.png`);
          if (!seenImageNodes.has(nodeId)) {
            seenImageNodes.add(nodeId);
            imageDirectives.push({
              nodeId,
              path,
              prompt: String(parsed.prompt),
              aspectRatio: parsed.aspectRatio || '1:1',
              stylePreset: parsed.stylePreset || 'flat_vector',
            });
          }
        }
      } catch {
        // Ignore malformed JSON pragma
      }
    }
  }

  return { contract, panels, imageDirectives };
}

/**
 * 将 FigureContract 格式化为可无损插入 `\begin{tikzpicture}` 顶部的标准 LaTeX 注释
 */
export function formatFigureContractComments(
  contract: FigureContract,
  panels: TikzPanelRegion[] = []
): string {
  const lines: string[] = [
    `  % @figure-contract ${JSON.stringify(contract)}`,
  ];
  for (const p of panels) {
    lines.push(`  % @panel ${JSON.stringify(p)}`);
  }
  return lines.join('\n');
}

/**
 * Agent 面板内置的「图件契约与顶刊绘图」一键快捷提示词模板（借鉴 nature-skills）
 */
export interface PublicationWorkflowPromptTemplate {
  id: string;
  label: string;
  badge: string;
  description: string;
  buildPrompt: (themeId: JournalThemeId) => string;
}

export const PUBLICATION_WORKFLOW_TEMPLATES: PublicationWorkflowPromptTemplate[] = [
  {
    id: 'contract_first',
    label: '📋 先写 Figure Contract 再画',
    badge: 'Nature Skills',
    description: '先规划五步图件契约（核心主张、构图原型、面板分工、Hero焦点），再生成完整 TikZ',
    buildPrompt: (themeId) =>
      `请严格遵循当前 ${themeId.toUpperCase()} 顶刊规范与五步图件契约（Figure Contract）：
1. 先在 \\begin{tikzpicture} 顶部输出 \`% @figure-contract {...}\` 和 \`% @panel {...}\` 契约注释（明确一句话核心科学结论、构图原型、Hero 核心创新模块 ID 以及各面板证据角色分工）；
2. 遵循「1 Neutral + 1 Signal + 1 Hero Accent」焦点配色原则，将高饱和强调色仅留给核心创新模块（标记 role=hero），分组框用 dashed 时跨层反馈流改用 dotted；
3. 生成零重叠、出版级对齐的完整 TikZ 代码。`,
  },
  {
    id: 'hero_redesign',
    label: '🏆 重绘为投稿级 (Hero + 从属证据)',
    badge: '焦点重构',
    description: '收敛画布杂乱配色，突出唯一核心创新模块（Hero Panel），建立主次证据视觉层级',
    buildPrompt: (themeId) =>
      `请将当前画布重绘升级为 ${themeId.toUpperCase()} 投稿级图件（Hero Panel + 从属证据层级）：
1. 审查并收敛当前颜色：常规层与已有 Baseline 统一降级为克制的中性浅色（role=neutral），主数据流使用主信号色（role=signal），仅把唯一的高饱和强调色赋给本文最核心的创新模块（标记 role=hero）；
2. 消除一切冗余装饰（去网格线、去多余外框），若容器使用了 dashed 则将辅助/反馈箭头改为 dotted；
3. 优化节点间距确保文字与箭头零碰撞，并在顶部补充 \`% @figure-contract\` 注释。`,
  },
  {
    id: 'nature_multipanel',
    label: '🔬 按顶刊规范生成多面板复合图',
    badge: 'Multi-Panel',
    description: '生成「左/上机制架构图 (Panel a) + 右/下 PGFPlots 定量对比与消融 (Panel b, c)」复合图',
    buildPrompt: (themeId) =>
      `请按 ${themeId.toUpperCase()} 顶刊规范生成一张「机制架构 + 定量实验」多面板复合图（schematic-led composite）：
- **Panel a（左侧，主机制架构）**：包含输入嵌入、分组容器 stage_box、突出的核心创新模块（role=hero）与正交残差连接；
- **Panel b（右上，主定量证据）**：PGFPlots 性能缩放曲线（带误差带、带单位的坐标轴标签、无背景网格线）；
- **Panel c（右下，消融或正交验证）**：柱状或箱线消融对比；
- 所有面板左上角使用标准面板标签（如 \\textbf{a}, \\textbf{b}, \\textbf{c}）严格对齐，并在顶部输出 \`% @figure-contract\` 与 \`% @panel\` 声明。`,
  },
  {
    id: 'hybrid_ai_illustration',
    label: '🎨 矢量骨架 + AI 透明插图混合绘图',
    badge: 'GPT-Image-2 / Gemini',
    description: '用 TikZ 绘制严谨矢量框图与公式，对具象物体自动放置 \\includegraphics + @agent-image',
    buildPrompt: (themeId) =>
      `请采用「TikZ 矢量骨架 + AI 透明抠图插画节点」混合架构绘制当前 ${themeId.toUpperCase()} 科研图：
1. 结构框、正交箭头、数学公式与 PGFPlots 坐标轴全部使用原生 TikZ 矢量绘制；
2. 对于图中的具象科学对象（如传感器/机器人硬件、生物细胞/分子结构、3D 场景样本），请放置无边框图片节点 \`\\node[draw=none, fill=none, inner sep=0pt] (illust_1) at (x, y) {\\includegraphics[width=2.4cm, height=2.0cm]{figures/assets/ai/illust_1.png}};\`，并在回复末尾附上 \`@agent-image {"nodeId":"illust_1","path":"figures/assets/ai/illust_1.png","prompt":"..."}\` 指令以便一键生成透明抠图。`,
  },
];
