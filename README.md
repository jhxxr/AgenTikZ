<p align="center">
  <img src="public/icon.svg" width="128" height="128" alt="AgenTikZ logo">
</p>

<h1 align="center">AgenTikZ</h1>

<p align="center">
  <strong>Visual TikZ &amp; PGFPlots studio for scientific figures, powered by your own local AI agents.</strong><br>
  Lossless AST surgical patching · BYOA via ACP v1 · Dedicated paper writing &amp; scientific drawing
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
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#interface--workflow-tour">Screenshots</a> ·
  <a href="#key-features">Key Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#paper-templates--themes">Paper Templates &amp; Themes</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#byoa-acp-setup--prompting-guide">BYOA &amp; Prompt Guide</a> ·
  <a href="#project-structure">Project Structure</a> ·
  <a href="#development--verification">Verification</a> ·
  <a href="#security--license">Security &amp; License</a>
</p>

<p align="center">
  <img src="docs/screenshots/studio-overview.png" width="100%" alt="AgenTikZ Studio Overview — Lossless AST Code Sync, Interactive Vector Canvas, and BYOA Agent Diff Review">
</p>

---

**AgenTikZ** is a visual TikZ and PGFPlots editor built for machine learning researchers and scientific authors preparing figures for **NeurIPS**, **ICLR**, **ICML**, **CVPR**, and **Nature (NPG)**. It pairs an interactive vector canvas with a lossless Concrete/Abstract Syntax Tree (**CST/AST**) parser and surgical patcher—dragging a module, resizing a 3D feature volume, routing an orthogonal residual bypass, or repositioning a PGFPlots legend updates only the exact character span in your `.tex` source while preserving every user comment, `\tikzset` macro, and indentation space.

Instead of locking you into a proprietary cloud model or asking for raw API keys, AgenTikZ adopts **Bring Your Own Agent (BYOA)** over the official [Agent Client Protocol (ACP)](https://agentclientprotocol.com) (`stdio`). Connect your locally installed **Claude Code**, **Codex CLI**, **OpenCode**, **Gemini CLI**, **Cursor Agent**, or **Kimi Code** directly to the canvas, attach `@canvas` and `@selection` context, and review proposed LaTeX replacements before applying them.

An optional **embedded Pi SDK backend** now shares the same project tools and proposal review workflow. Select it under **Settings → Agent**, load the pinned model catalog and store a provider API key in the OS credential store. Pi retains tool history in a long-lived process, without requiring Pi CLI. Node.js 22.19+ is still user-provided; model usage is billed by the selected provider. Pi currently exposes only AgenTikZ tools, not native shell/file tools or third-party MCP servers. Cancellation, project switches, runtime resets and restarts discard runtime history; the visible chat is replayed on recovery. See [Pi runtime notes](docs/pi-runtime.zh-CN.md).

**Image references and visual review:** paste screenshots into Agent chat, inspect removable thumbnails, or send an image without text. Pi and ACP receive actual image blocks. The `render_canvas_preview` tool returns a real TeX rendering of a pending figure proposal so a vision-capable agent can inspect and refine it before human review. Each request allows up to three distinct renders and caches identical inputs. Local TeX Live and dvisvgm are required; a successful compile or layout score is not visual verification.

**Built-in scientific drawing skill:** `tikz-diagram-reproduction` guides composition, data-state shapes, semantic colors and faithful reference reproduction. Its four reference families (SWSA, multi-stream GNN, masked autoencoders, and Riemannian/temporal pipelines) are available through paged `get_diagram_design_skill` calls. Complete templates are not injected into every prompt. Reference colors/layouts are protected from automatic repair, and complex shapes/macros use exact TeX preview. See [v0.6.0 release notes](docs/releases/v0.6.0.md).

## Interface & Workflow Tour

### 1. Visual Studio, Lossless AST Code Sync & BYOA Agent Diff Review
Real-time bidirectional synchronization between the CodeMirror 6 TikZ editor (left, with surgical `SourceSpan` value highlights), the interactive SVG + KaTeX vector canvas with floating selection bar (center), and the BYOA / ACP Agent collaboration panel with semantic AST change pills, layout health scoring, and inline diff preview (right).

![Visual Studio, Lossless AST Code Sync & BYOA Agent Diff Review](docs/screenshots/studio-overview.png)

### 2. Drawing Primitives & 3D Feature Inspector
Start from a blank canvas and add nodes, 3D feature volumes, and PGFPlots charts using the toolbar or primitives. The full-figure template gallery and template loader remain removed. Agents can consult the built-in drawing skill's paged references for relevant visual patterns while constructing the user's actual method. Existing drawings remain editable.

### 3. Nature (NPG) Multi-Panel Scientific Charts, Project Assets & AI Cutout Generator
Manage manuscript files (`main.tex`, `sections/*.tex`), multi-canvas figures (`figures/*.tikz`), and transparent AI scientific illustrations on the left, while editing multi-panel PGFPlots error-band curves, ablation bar charts, and data series tables on the right.

![Nature Multi-Panel PGFPlots Dashboard & Interactive Data Series Inspector](docs/screenshots/nature-pgfplots-dashboard.png)

### 4. Dedicated Paper Workspace: Files, Outline, Source & PDF
Writing and drawing have separate workspaces. The paper workspace includes a file tree, section outline, CodeMirror editor, and resizable PDF preview. Creating papers, opening chapters, or inserting figures never opens the drawing canvas automatically. Paper starters remain available (blank, Nature, NeurIPS, CVPR, IEEE, arXiv). PDF compilation requires the desktop app and local TeX Live; browser mode does not simulate compilation.

The divider includes source → PDF and PDF → source SyncTeX controls; `Ctrl/⌘ + click` on the PDF also returns to the corresponding source line. Desktop builds enable `-synctex=1` and require the `synctex` binary from your TeX installation. Recompile after source edits to refresh the map.

### 5. Agentero-Style BYOA (ACP v1) & 5-Point Figure Contract Settings Center
Configure local ACP agents (**Claude Code**, **OpenCode**, **Codex CLI**, **Gemini CLI**, **Cursor Agent**, **Kimi Code**) with dual-tier PATH + bundled adapter detection, one-click `stdio` handshake verification, and Nature Skills 5-Point Figure Contract enforcement.

![BYOA ACP v1 & 5-Point Figure Contract Settings Center](docs/screenshots/settings-acp-byoa.png)

## Key Features

| Lossless Source & Publication Quality | BYOA Collaboration & Scientific Workflow |
| --- | --- |
| **Surgical Span Patching**: Depth-aware CST/AST parser tracks exact `SourceSpan` offsets for coordinates, option brackets, labels, and `axis` blocks—zero formatting drift or whitespace inflation across continuous 60fps dragging. | **Native ACP v1 over `stdio`**: Built on the official Rust `agent-client-protocol` SDK. Streams live reasoning (`thought`), tool calls, and text chunks from local agent CLIs without third-party cloud relays. |
| **Venue-Calibrated Aesthetics**: Built-in color tokens, line widths, arrow tips, and typography presets tailored for **NeurIPS / ICLR**, **CVPR / ICCV**, **Nature (NPG)**, and **IEEE / ACM**. | **Review-First Patch Proposals**: Agent responses never overwrite your figure blindly. Complete `\begin{tikzpicture}...\end{tikzpicture}` blocks are extracted as pending proposals with one-click apply and revert. |
| **Deep Learning & PGFPlots Primitives**: First-class support for Pre-LN Transformer blocks, 3D feature map cuboids ($C\times H\times W$), $\oplus/\otimes$ operators, dashed stage containers, error-band scaling curves, grouped ablation bars, heatmaps, and boxplots. | **Dual-Engine Rendering & Export**: Instant interactive SVG + KaTeX canvas paired with local TeX Live (`latex` + `dvisvgm`) compilation preview and one-click export to `.tikz`, `\begin{figure}`, standalone `.tex`, `.svg`, or `.pdf`. |

## Architecture

```mermaid
flowchart TB
    subgraph Frontend["React 19 + Zustand + CodeMirror 6"]
        Canvas["Interactive SVG + KaTeX Canvas\n(2D Nodes · 3D Cuboids · PGFPlots)"]
        Editor["Live TikZ Code Panel\n(Line & Value-Span Diff Highlight)"]
        Parser["Lossless CST/AST Parser & Surgical Patcher\n(Depth-Aware Span Slicing)"]
        AgentUI["Right BYOA / ACP Chat Panel\n(@canvas · @selection · Patch Review)"]
    end

    subgraph Backend["Tauri v2 Rust Core"]
        AcpBridge["ACP v1 Client Bridge (stdio)\nBounded Timeouts · Fail-Closed Permissions"]
        TexEngine["Async Local TeX Compiler\n(latex + dvisvgm · Isolated Temp Dir)"]
        McpManifest["Canvas MCP Bridge\nScoped Targets · Reviewed Proposals"]
    end

    Canvas <-->|"Exact SourceSpan Patch"| Parser
    Editor <-->|"Bidirectional Sync"| Parser
    AgentUI <-->|"Tauri IPC + acp:stream Events"| AcpBridge
    Canvas -->|"Standalone .tex"| TexEngine
    AcpBridge <-->|"JSON-RPC 2.0 over stdio"| LocalAgents["Local ACP Agents\n(Claude Code · Codex · OpenCode · Gemini · Cursor · Kimi)"]
    LocalAgents <-->|"MCP stdio"| McpSidecar["Bundled Rust MCP Server"]
    McpSidecar <-->|"Authenticated Loopback Bridge"| McpManifest
    McpManifest <-->|"Targeted Tool Requests"| Parser
    LocalAgents <-->|"MCP stdio / Streamable HTTP"| ExternalMcp["User-Configured MCP Services"]
```

- **Lossless CST/AST Engine**: Located in `src/core/parser/`, the parser resolves `\tikzset` style definitions, `\node` statements, orthogonal/curved/residual `\draw` edges, and `\begin{axis}...\end{axis}` PGFPlots environments using depth-aware bracket `[]` and brace `{}` matching so math expressions like `$p(x;\theta)$` never truncate statement boundaries.
- **Official ACP v1 Transport**: Located in `src-tauri/src/acp/mod.rs`, the desktop backend launches locally installed ACP adapters over `stdio` with bounded initialization (`20s`), session creation (`20s`), prompt execution (`180s`), and transport shutdown timeouts.
- **Release Scope**: **v0.7.0** adds multi-channel Pi configuration with custom API URLs, independent keychain credentials and model management, plus agent-advertised ACP model selection, alongside the shared project assistant, manuscript review, visual review and scientific drawing skills. Pi exposes AgenTikZ tools only; external MCP and full-local-access settings apply to ACP. Draft compilation sandboxes and fully automatic repair loops are not yet implemented. See [v0.7.0 release notes](docs/releases/v0.7.0.md).

## Paper Templates & Themes

### Paper Starters

Blank, Nature, NeurIPS, CVPR, IEEE, and arXiv writing starters are retained. They generate manuscript sources and chapters without example figures or fabricated experiment data. These generic article-based starters are not official submission styles; use the venue's official style before submission.

### 4 Journal Color & Typography Presets

- **NeurIPS / ICLR Modern** (`neurips`): Oxford blue (`nips_blue`), warm attention amber (`nips_amber`), sage residual green (`nips_sage`), latent purple (`nips_purple`), `0.7pt` lines, `-Stealth` arrows.
- **CVPR / ICCV Vision** (`cvpr`): Backbone navy (`cvpr_navy`), neck coral (`cvpr_coral`), feature teal (`cvpr_teal`), `0.75pt` lines, 3D cuboid volume presets.
- **Nature / Science Minimal** (`nature`): Canonical NPG palette (`#E64B35`, `#4DBBD5`, `#00A087`, `#3C5488`), `0.55pt` ultra-fine axes, `-Latex` arrows.
- **IEEE / ACM Monochrome-Ready** (`ieee`): High-contrast royal blue (`#00629B`) and grayscale-safe fills with crisp `1.0pt` corners.

## Quick Start

| Mode | Best For | Requirements |
| --- | --- | --- |
| **Desktop App (`tauri dev` / build)** | Full experience: Visual Canvas + Embedded Pi / Local ACP Agents + Local TeX Live compilation | **Node.js >= 22.19.0**, **Rust (stable)**, WebView2 (Windows) / webkit2gtk (Linux) |
| **Web Studio (`npm run dev`)** | Instant browser trial of the visual TikZ/PGFPlots canvas, lossless code sync, and exports | **Node.js >= 22.19.0** and npm |

### 1. Clone & Install Dependencies

```sh
git clone https://github.com/jhxxr/AgenTikZ.git
cd AgenTikZ
npm ci
```

### 2. Run in Browser Mode (Visual Canvas & Code Sync)

```sh
npm run dev
```

Open `http://localhost:1420` in your browser. You can edit paper sources, start a blank drawing, drag nodes and 3D cuboids, edit PGFPlots data series, switch journal themes, and export `.tikz` / `.tex` / `.svg` / `.pdf`.

> **Note**: Browser mode intentionally does not connect to local `stdio` processes or generate simulated AI responses. Use the Tauri desktop app below to connect real local ACP agents.

### 3. Run the Desktop App (BYOA ACP + Local TeX Live)

```sh
npm run tauri dev
```

- **Local TeX Live Preview (Optional)**: If `latex` and `dvisvgm` (from TeX Live or MiKTeX) are on your system `PATH`, clicking **TeX** in the top toolbar compiles your standalone document asynchronously in an isolated temp directory and opens a side-by-side vector comparison view.
- **Production Desktop Bundle**:
  ```sh
  npm run tauri build
  ```

### Desktop package layout

The application remains a native Rust/Tauri executable. npm/Vite are build tools, not a development environment shipped to users. esbuild combines the Claude/Codex ACP adapters into standalone `.mjs` files. Only those bundles, their manifest, the Linux browser-launch helper, and third-party notices are packaged—not a full `node_modules` tree, type declarations, or source maps.

```text
adapters/
├── manifest.json
├── THIRD_PARTY_NOTICES.txt
├── claude-code/index.mjs
└── codex-cli/
    ├── index.mjs
    └── xdg-open
```

This reduces adapter resources; it does **not** embed a Node runtime. The bundled adapters still require local Node.js (22+ required for Claude, 22+ recommended for both) and an installed, authenticated Claude Code or Codex CLI. A standalone ACP adapter on PATH takes precedence. Otherwise, the desktop launcher uses the bundled adapter and supplies `CLAUDE_CODE_EXECUTABLE` / `CODEX_PATH` pointing to the user's CLI. Non-AI editing, rendering, and export do not depend on these adapters.

```sh
npm run adapters:stage           # Install pinned adapters, bundle, verify; automatic during builds
npm run adapters:stage -- --force
npm run adapters:verify          # Relocated version + ACP initialize tests; no model calls
npm run test:packaging           # Cache, resource, size-limit, and rollback tests
```

The manifest records a build fingerprint and per-file SHA-256 hashes. Corrupt resources or changed build scripts invalidate the cache. Bundles are verified in an isolated location without user credentials before replacing existing resources. Adapter upgrades must review dynamic assets and third-party terms, not simply remove files absent from static imports.

After a successful Windows NSIS reinstall/update, the installer recognizes and removes the legacy packaged `adapters/node_modules` tree, without deleting user projects, configuration, or globally installed CLIs.

## BYOA (ACP) Setup & Prompting Guide

AgenTikZ connects to external coding agents over `stdio` using the Agent Client Protocol (`v1`). AgenTikZ never downloads packages implicitly at runtime (`npx -y` is not used) and never stores model API keys—install and authenticate your preferred agent CLI first. Claude/Codex can use the bundled adapters; other agents must provide ACP support locally.

### Supported Local ACP Agents

| Agent Provider | Expected Executable on `PATH` | Default Args | Setup Notes |
| --- | --- | --- | --- |
| **Claude Code (ACP)** | `claude-agent-acp`, or `claude` + `node` | *(none)* | Standalone ACP adapter takes precedence; otherwise use the bundled adapter with Node.js 22+ and authenticate Claude Code |
| **OpenCode (ACP)** | `opencode` | `acp` | Install OpenCode CLI (`opencode acp`) |
| **Codex CLI (ACP)** | `codex-acp`, or `codex` + `node` | *(none)* | Standalone ACP adapter takes precedence; otherwise use the bundled adapter with Node.js (22+ recommended) and authenticate Codex CLI |
| **Gemini CLI (ACP)** | `gemini` | `--acp` | Install Gemini CLI with `--acp` support |
| **Cursor Agent (ACP)** | `cursor-agent` | `acp` | Install Cursor Agent CLI |
| **Kimi Code (ACP)** | `kimi` | `acp` | Install Kimi CLI with `acp` subcommand |
| **Custom ACP Agent** | User-configured executable | User-configured | Click the terminal icon in the right panel and enter `<executable> <args>` or `{"command":"...","args":[],"env":{}}` |

**Model selection:** connect to an ACP agent to load its advertised model options, then select a model in settings or chat. Each prompt session applies and verifies that selection before sending context. Embedded Pi supports multiple independent channels with custom base URLs/API protocols, OS-keychain credentials, fetched or manually added/deleted models, and quick channel/model switching in chat. See [Pi configuration](docs/pi-runtime.zh-CN.md) and [ACP model selection / gateway troubleshooting](docs/mcp-guide.zh-CN.md#acp-连接与模型选择).

### Ready-to-Use Scientific Figure Prompts

Select elements on the canvas (or toggle `@canvas` and `@选中` context pills in the right panel) and paste any of the prompts below:

#### 1. Add a Cross-Attention Branch to Selected Modules

```text
Based on the currently selected nodes (@selection) and @canvas:
1. Add a parallel Cross-Modal Attention branch to the right of the selected layer (x offset +3.8cm) using the current venue theme's color tokens.
2. Connect its output back into the main stream via a centered \oplus operator node (op_circle).
3. Preserve all existing comments, \tikzset styles, and node IDs, and return the complete updated \begin{tikzpicture}...\end{tikzpicture} block.
```

#### 2. Convert an Architecture Diagram to a Joint Architecture + PGFPlots Figure

```text
Keep the existing architecture on the left side of @canvas and add a publication-grade PGFPlots \begin{axis} panel on the right (shifted to x=8.2cm):
- Chart type: line plot with error bars (+- (0, err)) comparing "Ours" vs. "Baseline" across 4 compute scales.
- Match the active journal theme palette and keep axis dimensions at width=5.8cm, height=4.5cm.
- Add aligned (a) and (b) subcaption nodes underneath both panels.
```

#### 3. Refine Layout Grid & Orthogonal Residual Routing

```text
Inspect @canvas and clean up the geometric alignment without changing any scientific labels or math formulas:
1. Snap all main-stream vertical backbone layers to a uniform 1.2cm vertical grid step.
2. Convert any diagonal skip connections into symmetric orthogonal residual bypasses (-- ++(1.1, 0) |-) with midway {\scriptsize Residual} labels.
```

## Project Structure

```text
src/
  components/
    agent/          # Right docked BYOA / ACP chat panel, stream status, and patch review cards
    canvas/         # Interactive SVG + KaTeX canvas, 3D cuboid projection, and PGFPlots renderer
    editor/         # CodeMirror 6 TikZ editor with real-time line & value-span diff banners
    inspector/      # Floating property inspector for geometry, styles, routing, and chart series
    sidebar/        # Drawing sidebar: project assets, primitives, and code
    toolbar/        # Top toolbar: tool groups, alignment helpers, theme switcher, TeX preview, exports
  core/
    parser/         # Lossless CST/AST TikZ & PGFPlots parser, surgical span patcher, and unit tests
    tikz/           # Modular drawing and chart primitives
    paper/          # Paper starters and figure-insertion LaTeX utilities
    themes/         # NeurIPS, CVPR, Nature (NPG), and IEEE color tokens and preamble generators
  store/            # Zustand workspace store (undo/redo, AST sync) and ACP agent store + tests
  types/            # TypeScript contracts for TikZ AST spans, themes, and ACP streaming events
src-tauri/
  src/
    acp/            # Official ACP v1 stdio client bridge, executable resolution, and unit tests
    mcp/            # MCP configuration, credentials, authenticated bridge and canvas tool routing
    tex/            # Async local TeX Live (latex + dvisvgm) preview compiler
```

## Development & Verification

Run the frontend unit tests, TypeScript/Vite production build, and Rust backend test suite before submitting changes:

```sh
# 1. Run Vitest unit tests (50-frame zero-whitespace-drift stress tests + ACP store contract tests)
npm test

# 2. Run TypeScript typecheck and Vite production bundle build
npm run build

# 3. Run Rust ACP & Tauri backend unit tests
npm run mcp:stage
npm run test:mcp
cargo test --manifest-path src-tauri/Cargo.toml
```

## Security & License

- **Trust & Execution Boundary**:
  - **No Implicit Downloads**: AgenTikZ resolves ACP executables strictly from your local `PATH` (or explicit custom command path) and never invokes `npx -y` to download unverified packages behind the scenes.
  - **Configurable Local Access**: **Settings → Agent → 完整本机访问 (Full local access)** is off by default. Enabling it allows the agent to read and modify files outside the project and execute its native commands. This preference is saved locally and takes effect on the next message, including in an existing chat.
  - **Working Directory**: Restricted sessions use `app_data_dir()/agent-workspace`. With full access enabled, the working directory follows the current project, or a folder selected in Agent settings; without either, it uses the application workspace. Relative or missing custom directories produce an actionable error. A working directory is not an OS sandbox.
  - **Tool Permissions**: Restricted sessions cancel native filesystem/command permission requests; explicitly enabled MCP tools are authorized independently. Full access selects the agent's advertised full-access mode when available and enables ACP text-file read/write capabilities. Permission responses select `allow_once`; requests offering only persistent permission are cancelled. Native CLI tools retain their own capabilities and OS permissions. Canvas proposals still require clicking Apply.
  - **MCP Services**: **Settings → MCP 服务** manages the bundled 9-tool canvas server and external stdio/Streamable HTTP services. Sensitive values use OS credentials or explicit session-only memory; exports omit them. Canvas proposals bind to their original canvas and source revision. See the [MCP guide](docs/mcp-guide.zh-CN.md).
  - **External Agent Privileges**: Note that an ACP agent CLI process you launch still runs under your OS user account and sends prompt context to the model provider configured in that CLI.
- **License**: Released under the [MIT License](LICENSE).
