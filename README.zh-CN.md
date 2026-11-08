<p align="center">
  <img src="public/icon.svg" width="128" height="128" alt="AgenTikZ 图标">
</p>

<h1 align="center">AgenTikZ</h1>

<p align="center">
  <strong>面向科研论文与深度学习顶会的 AI 原生 TikZ &amp; PGFPlots 可视化工作室。</strong><br>
  无损 AST 外科手术级代码同步 · 原生 BYOA (ACP v1) 本地智能体协同 · 顶刊级预设模板与配色规范
</p>

<p align="center">
  <a href="https://github.com/jhxxr/AgenTikZ/actions/workflows/ci.yml"><img src="https://github.com/jhxxr/AgenTikZ/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/jhxxr/AgenTikZ/actions/workflows/release.yml"><img src="https://github.com/jhxxr/AgenTikZ/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-147a57" alt="MIT License"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/React-19-087ea4" alt="React 19"></a>
  <a href="src-tauri/Cargo.toml"><img src="https://img.shields.io/badge/Tauri-v2-24c8db" alt="Tauri v2"></a>
  <a href="src-tauri/Cargo.toml"><img src="https://img.shields.io/badge/ACP_SDK-v1_(stdio)-2563eb" alt="Agent Client Protocol v1"></a>
  <a href="tsconfig.json"><img src="https://img.shields.io/badge/TypeScript-5.7-3178c6" alt="TypeScript 5.7"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#界面与核心工作流预览">界面预览</a> ·
  <a href="#核心特性">核心特性</a> ·
  <a href="#工作原理与架构">工作原理</a> ·
  <a href="#顶刊模板与学术主题">顶刊模板与主题</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#byoa-智能体接入与提示词指南">BYOA 与提示词指南</a> ·
  <a href="#项目结构">项目结构</a> ·
  <a href="#开发与验证">开发与验证</a> ·
  <a href="#安全边界与许可证">安全与许可证</a>
</p>

<p align="center">
  <img src="docs/screenshots/studio-overview.png" width="100%" alt="AgenTikZ 工作台全景 — 无损 AST 源码同步、交互式矢量画布与 BYOA 智能体增量 Diff 审阅">
</p>

---

**AgenTikZ** 是一款专为机器学习与自然科学研究者打造的 **TikZ 与 PGFPlots 可视化编辑器**，面向 **NeurIPS**、**ICLR**、**ICML**、**CVPR** 与 **Nature (NPG)** 论文插图标准设计。系统底层采用基于字符级源码跨度（`SourceSpan`）的 **无损 CST/AST 解析器与外科手术式补丁引擎（Surgical Patcher）**——在画布上拖拽网络层、调整 3D 特征图（$C\times H\times W$）通道厚度、拉动正交残差跳线或移动 PGFPlots 图例时，仅精准替换 `.tex` 源码中对应的数值区间，100% 保留手写注释、`\tikzset` 宏定义与原有缩进格式。

在 AI 协同方面，AgenTikZ 采用 **自带智能体（BYOA, Bring Your Own Agent）** 架构，基于官方 [Agent Client Protocol (ACP)](https://agentclientprotocol.com)（`stdio`）直接连接你本机已安装并登录的 **Claude Code**、**Codex CLI**、**OpenCode**、**Gemini CLI**、**Cursor Agent** 或 **Kimi Code**。无需在软件内配置模型 API Key，无需经过第三方云端中继；支持一键附加 `@canvas` 与 `@选中` 图元上下文，所有 AI 生成的 TikZ 代码均需人工预览确认后才会应用到画布。

## 界面与核心工作流预览

### 1. 可视化工作室全景：无损 AST 源码同步与 BYOA 智能体增量 Diff 审阅
左侧 CodeMirror 6 编辑器实时高亮选中图元对应的源码行与精确修改区间（`minimum width=3.5cm`），中间交互式 SVG + KaTeX 矢量画布支持多配图标签页与浮动属性快捷栏，右侧 BYOA / ACP 智能体面板展示 AST 推理过程、语义变更标签、几何健康度评分（`100分`）与内联 Diff 对比预览。

![可视化工作室全景：无损 AST 源码同步与 BYOA 智能体增量 Diff 审阅](docs/screenshots/studio-overview.png)

### 2. 顶刊构图模板库、实时 SVG 拓扑缩略图与 3D 特征张量检查器
左侧内置 6 套顶会整图模板（带 AST 实时渲染的 SVG 拓扑缩略图）与 13 种深度学习 / PGFPlots 原语组件；中间画布展示 **CVPR / ICCV** 多尺度 3D 视觉特征金字塔（$\mathbf{C}_2 \rightarrow \mathbf{C}_5$），右侧属性抽屉支持实时微调 3D 通道厚度、张量维度标注、视觉显著性角色与期刊色板。

![顶刊构图模板库与 3D 特征张量检查器](docs/screenshots/templates-and-3d-vision.png)

### 3. Nature (NPG) 多面板科研实验图表、项目目录管理与 AI 透明抠图生成器
左侧统一管理论文手稿（`main.tex`、`sections/*.tex`）、科研配图（`figures/*.tikz`）与 AI 透明抠图科研插图生成器；中间画布呈现符合 **Nature (NPG)** 规范的双联实验图（误差带收敛折线图 + 跨领域消融柱状图），右侧面板支持交互式编辑 `\addplot` 数据序列、误差棒与图例布局。

![Nature 多面板科研实验图表与交互式数据表编辑](docs/screenshots/nature-pgfplots-dashboard.png)

### 4. 一站式 LaTeX 论文手稿与科研配图同屏联动工作台（`⚖️ 同屏` 模式）
左屏直接编写论文 LaTeX 手稿并自动识别文中引用的 `\input{figures/*.tikz}` 配图标签，支持「📌 一键插图」将当前活动配图与 `\usepackage{styles/agentikz-macros}` 色彩宏同步插入至论文光标处，实现论文写作与顶会插图设计的零切换协同。

![一站式 LaTeX 论文手稿与科研配图同屏联动工作台](docs/screenshots/paper-split-workbench.png)

### 5. Agentero 风格 BYOA (ACP v1) 与顶刊 5 点图件契约设置中心
支持本机 `PATH` 与内置适配器双层探测（**Claude Code**、**OpenCode**、**Codex CLI**、**Gemini CLI**、**Cursor Agent**、**Kimi Code**），提供一键 `stdio` 握手延时测试，并可开启 **Nature Skills 常驻风格规范**与 **5 点图件契约（`% @figure-contract`）**。

![BYOA ACP v1 与顶刊图件契约设置中心](docs/screenshots/settings-acp-byoa.png)

## 核心特性

| 无损源码级精修与顶刊审美 | 原生 BYOA 智能体协同与科研工作流 |
| --- | --- |
| **外科手术级 AST 双向同步**：深度感知括号/花括号解析器精准定位每个节点坐标、样式参数、文本标签与 `axis` 图表区间，连续拖拽 50+ 帧零空格膨胀、零注释丢失。 | **官方 ACP v1 协议直连（`stdio`）**：Rust 后端集成官方 `agent-client-protocol` SDK，实时流式展示本地 Agent 的推理过程（`thought`）、工具状态与回复文本。 |
| **四大顶会/顶刊视觉规范**：内置 **NeurIPS / ICLR**、**CVPR / ICCV**、**Nature (NPG)** 与 **IEEE / ACM** 专属色板、线宽（`0.55pt`–`0.75pt`）、箭头样式与字体规范。 | **先审阅后应用的补丁机制**：Agent 返回的完整 `\begin{tikzpicture}...\end{tikzpicture}` 代码自动提取为待确认卡片，支持源码折叠预览、一键应用与随时撤回。 |
| **深度学习与 PGFPlots 原生图元**：内置 Pre-LN 注意力块、3D 特征立方体、$\oplus/\otimes$ 算子、虚线 Stage 容器，以及带误差带折线图、消融分组柱状图、热力图与箱线图。 | **双引擎渲染与全格式导出**：内置 60fps 交互式 SVG + KaTeX 矢量画布，支持调用本机 TeX Live（`latex` + `dvisvgm`）分屏对比编译，一键导出 `.tikz`、`figure` 环境、Standalone `.tex`、`.svg` 与 `.pdf`。 |

## 工作原理与架构

```mermaid
flowchart TB
    subgraph Frontend["前端工作台 (React 19 + Zustand + CodeMirror 6)"]
        Canvas["交互式 SVG + KaTeX 矢量画布\n(2D 模块 · 3D 特征图 · PGFPlots 图表)"]
        Editor["实时 TikZ 代码面板\n(关联行高亮 · 修改数值区间闪烁)"]
        Parser["无损 CST/AST 解析与 Surgical Patcher\n(深度感知括号匹配 · 精确 SourceSpan 替换)"]
        AgentUI["右侧 BYOA / ACP 智能体协作窗\n(@canvas · @选中 · 补丁预览与撤回)"]
    end

    subgraph Backend["Tauri v2 Rust 桌面核心"]
        AcpBridge["ACP v1 客户端桥接 (stdio)\n严格超时控制 · 权限默认拒绝 (Fail-Closed)"]
        TexEngine["异步本地 TeX 编译引擎\n(latex + dvisvgm · 独立临时目录隔离)"]
        McpManifest["内置 MCP 工具契约定义\n(AST / 选中图元 / 补丁 Schema)"]
    end

    Canvas <-->|"精确 SourceSpan 局部替换"| Parser
    Editor <-->|"双向实时同步"| Parser
    AgentUI <-->|"Tauri IPC + acp:stream 流事件"| AcpBridge
    Canvas -->|"完整 Standalone .tex"| TexEngine
    AcpBridge <-->|"JSON-RPC 2.0 over stdio"| LocalAgents["本机 ACP 智能体 CLI\n(Claude Code · Codex · OpenCode · Gemini · Cursor · Kimi)"]
```

- **无损 CST/AST 解析引擎**：位于 `src/core/parser/`，通过深度感知括号 `[]` 与花括号 `{}` 匹配解析 `\tikzset` 样式、`\node` 节点、正交/弧线/残差 `\draw` 连线以及 `\begin{axis}...\end{axis}` 实验图表，确保含分号的数学公式（如 `$p(x;\theta)$`）或含括号文本绝不误截断语句。
- **官方 ACP v1 通信实现**：位于 `src-tauri/src/acp/mod.rs`，桌面端通过 `stdio` 启动本地已安装的 ACP 适配器，对初始化握手（`20s`）、会话创建（`20s`）、提示词生成（`180s`）及子进程退出均设有严格超时边界。
- **当前版本边界**：当前版本 **v0.1.0** 完整支持可视化画布交互、6 套顶会整图模板、4 套学术主题、本机 TeX Live 编译预览以及基于 `stdio` 的 ACP v1 实时流式对话与代码补丁审阅。外部 Agent 发起的文件系统写入或终端命令权限请求默认拒绝（Fail-Closed）。

## 顶刊模板与学术主题

### 6 套内置顶刊整图模板（带实时 SVG 拓扑缩略图）

| 模板名称 | 适用顶会/期刊 | 分类 | 核心包含结构 |
| --- | --- | --- | --- |
| **Pre-LN Transformer 架构 + Scaling 实验联合图** | NeurIPS / ICLR | `transformer` | RoPE 嵌入、RMSNorm、Multi-Head Attention、SwiGLU FFN、左右对称正交残差跳线 + 右侧三曲线误差带 PGFPlots 实验图 |
| **并行三分支 Q-K-V 注意力与门控融合细节图** | ICLR / ICML | `transformer` | 等距并行 $\mathbf{Q}/\mathbf{K}/\mathbf{V}$ 投影分支、居中 $\otimes$ 点积算子、Causal Softmax 路由与公式标注 |
| **多尺度 3D 视觉特征金字塔 (FPN / U-Net)** | CVPR / ICCV | `vision_multimodal` | 渐进缩放 3D 特征图立方体（$\mathbf{C}_2 \rightarrow \mathbf{C}_5$）、空间下采样、自顶向下 FPN Neck 与横向跳线融合 |
| **视觉-语言双流多模态对齐 + 相似度热力图** | CVPR / NeurIPS | `vision_multimodal` | 严格对称 ViT 视觉编码流与 Text Transformer 编码流、居中 InfoNCE 损失公式 + 右侧跨模态余弦相似度热力图 |
| **Latent Diffusion / Flow Matching 去噪管线 (DiT)** | ICML / NeurIPS | `generative` | 噪声潜变量 3D 张量 $\mathbf{z}_t$、时空自注意力、上方 AdaLN-Zero $\gamma,\beta$ 条件调制注入与流匹配目标函数 |
| **Nature 风格多面板科研实验图表** | Nature / Science | `data_charts` | 严格等宽等高（`5.8cm × 4.4cm`）双联图：(a) 三曲线误差带收敛对比 + (b) 跨领域三组消融分组柱状图 |

### 4 套学术期刊配色与排版预设

- **NeurIPS / ICLR Modern** (`neurips`)：牛津科研蓝（`nips_blue`）、暖杏注意力橙（`nips_amber`）、鼠尾草残差绿（`nips_sage`）、潜空间紫（`nips_purple`），`0.7pt` 细线与 `2.5pt` 圆角。
- **CVPR / ICCV Vision** (`cvpr`)：Backbone 深蓝（`cvpr_navy`）、Neck 珊瑚橙（`cvpr_coral`）、Feature 青绿（`cvpr_teal`），`0.75pt` 线宽，专为多尺度 3D 特征体积优化。
- **Nature / Science Minimal** (`nature`)：NPG 经典高对比度色板（`#E64B35`、`#4DBBD5`、`#00A087`、`#3C5488`），`0.55pt` 纤细轴线与 `-Latex` 箭头。
- **IEEE / ACM Monochrome-Ready** (`ieee`)：兼顾彩色电子版与黑白印刷灰度层次的皇家蓝（`#00629B`）与工程灰阶预设。

## 快速开始

| 运行模式 | 适用场景 | 环境要求 |
| --- | --- | --- |
| **Tauri 桌面应用 (`tauri dev` / build)** | 完整功能体验：可视化画布 + 本地 ACP 智能体直连 + 本机 TeX Live 编译对比 | **Node.js >= 20**、**Rust (stable)**、WebView2 (Windows) / webkit2gtk (Linux) |
| **Web 浏览器模式 (`npm run dev`)** | 快速体验可视化 TikZ/PGFPlots 画布、双向无损源码同步与多格式插图导出 | **Node.js >= 20** 与 npm |

### 1. 克隆仓库并安装依赖

```sh
git clone https://github.com/jhxxr/AgenTikZ.git
cd AgenTikZ
npm ci
```

### 2. 启动 Web 浏览器模式（画布与源码同步）

```sh
npm run dev
```

浏览器打开 `http://localhost:1420` 即可使用全部 6 套顶会模板、13 种深度学习与 PGFPlots 组件、实时代码行高亮对比以及 `.tikz` / `.tex` / `.svg` / `.pdf` 导出。

> **说明**：纯浏览器环境无法直接调用本机 `stdio` 子进程，且 AgenTikZ 坚持**不生成假冒模拟回复**。如需连接本地 ACP 智能体或调用本机 TeX Live 编译，请使用下方的 Tauri 桌面模式。

### 3. 启动 Tauri 桌面应用（支持本地 ACP 智能体与 TeX Live）

```sh
npm run tauri dev
```

- **本机 TeX Live 矢量编译对比（可选）**：若本机 `PATH` 中已安装 `latex` 与 `dvisvgm`（来自 TeX Live 或 MiKTeX），点击顶部工具栏的 **TeX** 按钮即可在独立临时目录中异步编译完整文档，并开启左右分屏对比预览。
- **构建桌面端安装包**：
  ```sh
  npm run tauri build
  ```

## BYOA 智能体接入与提示词指南

AgenTikZ 通过标准输入输出（`stdio`）使用 ACP v1 协议与本机安装的智能体 CLI 通信。**AgenTikZ 不会隐式下载任何外部程序（不使用 `npx -y`），也不代管模型 API Key**——请先在本机安装对应适配器并完成 CLI 登录。

### 支持的本地 ACP 智能体列表

| 智能体选项 | 本机 `PATH` 需存在的可执行文件 | 默认启动参数 | 安装与配置说明 |
| --- | --- | --- | --- |
| **Claude Code (ACP)** | `claude-agent-acp` | *(无)* | 全局安装 `@agentclientprotocol/claude-agent-acp` 并完成 Claude CLI 登录 |
| **OpenCode (ACP)** | `opencode` | `acp` | 安装 OpenCode CLI（支持 `opencode acp` 子命令） |
| **Codex CLI (ACP)** | `codex-acp` | *(无)* | 全局安装 `@zed-industries/codex-acp` 并完成 Codex CLI 登录 |
| **Gemini CLI (ACP)** | `gemini` | `--acp` | 安装支持 `--acp` 参数的 Gemini CLI |
| **Cursor Agent (ACP)** | `cursor-agent` | `acp` | 安装支持 `acp` 子命令的 Cursor Agent CLI |
| **Kimi Code (ACP)** | `kimi` | `acp` | 安装支持 `acp` 子命令的 Kimi CLI |
| **自定义 ACP Agent** | 用户自定义路径与命令 | 用户自定义 | 点击右侧面板终端图标，输入可执行文件与参数或 JSON 配置 `{"command":"...","args":[],"env":{}}` |

### 常用科研绘图提示词模板（可直接复制）

在画布上框选目标模块（并在右侧面板开启 `@canvas` 与 `@选中` 上下文标签），即可复制以下提示词发送给本地 ACP 智能体：

#### 1. 为选中网络层添加跨模态注意力分支

```text
请基于当前画布 (@canvas) 与我选中的模块 (@selection)：
1. 在选中模块右侧（水平偏移 +3.8cm）添加一个并行的 Cross-Modal Attention 分支，配色遵循当前顶会主题的色板宏。
2. 在主干流上方添加一个居中的 \oplus 算子圆节点（op_circle），将跨模态分支输出汇入主干。
3. 严格保留原有的所有注释、\tikzset 样式定义与节点 ID，返回完整可替换的 \begin{tikzpicture}...\end{tikzpicture} 代码块。
```

#### 2. 构建“左模型架构 + 右实验曲线”顶会 Figure 1 联合图

```text
请保留当前 @canvas 左侧的模型架构不变，在右侧（shift={(8.2, 2.5)}）新增一个符合 NeurIPS 规范的 PGFPlots \begin{axis} 实验对比图：
- 图表类型：带标准差误差棒 (+- (0, err)) 的折线图，对比 Ours 与 Baseline 在 4 个训练规模下的准确率。
- 尺寸设为 width=5.8cm, height=4.5cm，并在左、右两个面板正下方添加对齐的 (a) 与 (b) 子图图注节点。
```

#### 3. 规范化网格间距与正交残差跳线

```text
请检查当前 @canvas 的几何排版，在不改变任何数学公式与模块语义的前提下进行排版精修：
1. 将纵向主干上的所有模块按 1.2cm 垂直网格步进严格对齐。
2. 将跨层跳跃连接统一规范为左右对称的正交残差跳线（-- ++(1.1, 0) |-），并在跳线中段添加白底 {\scriptsize Residual} 标签。
```

## 项目结构

```text
src/
  components/
    agent/          # 右侧 BYOA / ACP 智能体协作面板、流式状态展示与代码补丁审阅卡片
    canvas/         # 交互式 SVG + KaTeX 矢量画布、3D 特征图投影与 PGFPlots 图表渲染器
    editor/         # CodeMirror 6 TikZ 代码编辑器、关联行高亮与修改数值区间实时闪烁横幅
    inspector/      # 浮动属性检查器（几何坐标、顶刊色板、残差跳线跨度、PGFPlots 数据表编辑）
    sidebar/        # 左侧双标签栏：带 SVG 拓扑缩略图的顶刊模板库、深度学习图元库与代码面板
    toolbar/        # 顶部工具栏：分组绘图工具、多选对齐、期刊主题切换、TeX 编译预览与多格式导出
  core/
    parser/         # 无损 CST/AST TikZ & PGFPlots 解析器、外科手术式 Span 补丁引擎及单元测试
    templates/      # 6 套顶会整图模板与 13 种深度学习/科研图表组件定义
    themes/         # NeurIPS、CVPR、Nature (NPG) 与 IEEE 色彩 Token 及 LaTeX 导言区生成器
  store/            # Zustand 画布状态管理（Undo/Redo、AST 同步）与 ACP 智能体状态管理及测试
  types/            # TikZ AST 源码跨度、主题规范与 ACP 流式事件 TypeScript 类型定义
src-tauri/
  src/
    acp/            # 官方 ACP v1 stdio 客户端桥接、PATH 可执行文件解析与 Rust 单元测试
    mcp/            # 内置 MCP 画布工具契约定义（AST 查询、选中元素与补丁 Schema）
    tex/            # 异步本地 TeX Live (latex + dvisvgm) 独立临时目录编译模块
```

## 开发与验证

提交代码或打包发布前，请运行完整的前端单元测试、TypeScript/Vite 生产构建以及 Rust 后端测试套件：

```sh
# 1. 运行 Vitest 单元测试（含连续 50 帧拖拽零空格膨胀压力测试 + ACP 状态契约测试）
npm test

# 2. 运行 TypeScript 类型检查与 Vite 生产环境打包验证
npm run build

# 3. 运行 Rust Tauri / ACP 后端单元测试
cargo test --manifest-path src-tauri/Cargo.toml
```

## 安全边界与许可证

- **执行与信任边界说明**：
  - **拒绝隐式下载**：AgenTikZ 仅从本机 `PATH`（或你在自定义面板中显式配置的路径）查找并启动 ACP 可执行文件，绝不在后台调用 `npx -y` 隐式下载未验证的远程包。
  - **独立工作目录隔离**：ACP 会话启动时使用独立的 `app_data_dir()/agent-workspace` 空工作目录，不会将你的个人主目录或无关代码仓库暴露为 Agent 的项目根目录。
  - **权限请求默认拒绝（Fail-Closed）**：当前客户端不包含高危操作审批弹窗，Agent 发起的任何文件读写或终端命令权限请求（`RequestPermissionRequest`）均会被自动拒绝（`Cancelled`），仅允许 Agent 以纯文本代码提案形式返回修改建议。
  - **外部 CLI 权限提示**：请注意，由你安装并启动的本地 ACP Agent 进程仍运行在你的操作系统用户权限下，且你附加的画布上下文会发送给该 Agent CLI 所配置的模型服务商。
- **开源许可证**：项目源码采用 [MIT License](LICENSE) 授权。
