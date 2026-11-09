# 内置 Pi 项目 Agent

## 配置与使用

1. 使用 Tauri 桌面端，并安装 Node.js 22.19 或更新版本。无需安装 Pi CLI。
2. 打开设置 → Agent → 内置 Pi，点击“检测运行时 / 加载模型”。
3. 从内置 SDK 目录选择 provider 与模型，并设置推理强度（默认中，可选关闭/低/中/高）。SDK 按模型能力调整实际推理级别。没有默认替代模型，也不会自动切换服务商。
4. 输入对应模型服务的 API Key，保存到系统凭据库。模型 API 单独计费；不复用 Claude/Codex 等 CLI 登录。
5. 点击“使用内置 Pi”（也可在右侧引擎列表选择“内置 Pi · 项目 Agent”），启用 AgenTikZ 内置 MCP 工具，然后发送任务。

检测只启动 SDK、握手并读取本地模型目录，不调用模型或验证密钥。实际任务才发送项目上下文到所选模型服务。纯浏览器不运行本地进程，不生成模拟模型回复。

首版仅显示可使用独立 API Key 的接入范围：Anthropic、OpenAI、Google、OpenRouter、Groq、Mistral、xAI 和 DeepSeek，以固定 SDK 实际提供的模型目录为准。OAuth、CLI 订阅登录、Azure/Vertex/Bedrock 等额外云认证及自定义 endpoint 暂不支持，也不会读取本机云账号配置作为回退。

API Key 不写入 localStorage、项目文件或命令行参数。Rust 从系统凭据库取出后，通过私有 stdin 交给 Pi 的内存凭据存储。保存或删除密钥会重置当前窗口的 Pi 进程。用户可以随时删除凭据。凭据库不可用时会明确失败，不降级为明文文件。

## 会话与任务

Pi SDK 固定为 `@earendil-works/pi-coding-agent@1.5.0`，npm 依赖树由 `runtime/pi/package-lock.json` 锁定。Rust 维护每个窗口的长驻 worker；正常多轮对话复用 SDK 的真实消息、工具调用和工具结果，而非重新拼接每轮完整历史。

会话按项目、聊天、provider、模型、推理强度、密钥和工具清单隔离，最多保留 8 个会话，使用最近使用顺序淘汰。15 分钟空闲后下一轮会重建 worker。模型上下文压缩由 Pi SDK 管理。单任务限制为 24 个模型 turn 和 10 分钟；输出也有大小限制。

“停止”撤销当前请求的项目工具授权并结束当前 worker；下一轮新建运行时，仅恢复界面可见的聊天记录，不声称恢复旧工具历史。切换项目、关闭窗口、手动重置或进程失败也会使运行时失效。恢复提示区分“新会话”与“长驻会话已复用”。应用重启后不恢复内存会话；当前聊天记录本身也未实现持久化。

切换同一项目的绘图/论文视图不会重建 Pi 会话。每轮仍刷新最新上下文、提案审核状态和桥接令牌，历史工具结果不能作为最新文件版本使用。

## 工具与审阅

Pi 仅注册 AgenTikZ 清单中的 15 个工具：画布读取/诊断/提案/真实 TeX 预览、内置绘图 skill 参考库，以及论文读取/多文件提案/编译诊断。工具经过同一 Rust 本机桥接、前端版本/hash 校验、项目身份校验和审阅 UI。

没有内置 shell、read/write 文件工具、web 工具、个人插件、自动发现的 AGENTS.md、技能或可执行扩展。第三方 MCP、ACP 的“完整本机访问”、代理和 User-Agent 配置不应用于 Pi。外部 MCP 配置界面因此不提供 Pi 选择。

Pi 返回的代码块不会自动提升为画布修改，必须调用提案工具。用户可审核、整组应用、拒绝、撤回；桌面端可“应用并编译”。论文工具读取最近的编译诊断，不自主启动整篇论文编译。

绘图任务与 ACP 共用内置 `tikz-diagram-reproduction` 设计策略，按任务注入构图、图形选择、算子语义配色、复刻保真规则，以及最多两个相关论文参考族。需要细节时用 `get_diagram_design_skill` 逐页读取原始指南和四组宏模板；不会一次塞入完整模板库，也不提供执行原 Python 脚本的权限。

绘图开启「视觉复核」时，Pi 可使用 `render_canvas_preview` 编译待审草稿，接收原生图片工具结果，按图修改再渲染；每轮最多 3 个不同版本，相同输入复用结果。提案保持待审核，不自动应用。文本模型会跳过图片渲染并明确报告未做视觉验证。

输入框支持粘贴或选择参考图片；仅接受支持图片输入的模型。图片以 SDK 原生 image block 传递，不拼成 base64 文本。正常会话只发送本轮新图；恢复会话时附带最近最多 4 张参考图。图片和聊天均只保留在当前应用内存中。

## 构建

```sh
npm ci
npm run pi:stage
npm run test:pi
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

`pi:stage` 只在开发/构建时运行 `npm ci --ignore-scripts`，在临时资源目录完成真实 SDK 启动与模型目录检查，然后替换资源；失败时保留原资源。桌面构建会自动执行。运行中的应用不安装 npm 包。

Pi SDK 保留其完整依赖资源与许可证，独立于已有精简 ACP 适配器；当前大约增加 109 MiB 的未压缩资源（以实际安装依赖为准）。尚未对 Pi 做裁剪，不捆绑 Node 可执行文件。Tauri 资源目录为 `pi-runtime/`。

## 验证范围

`test:pi` 包含隔离/取消/资源限制测试，以及使用真实 Pi SDK 对接本机测试模型服务的集成测试，覆盖工具回合、模型流式输出与第二轮原生历史复用。测试模型输出仅存在测试目录中，不进入产品运行时。

另有实际 worker 启动及模型目录检查；不会读取用户模型密钥或发起付费测试。真实服务商认证、计费模型行为仍需使用用户自己配置的服务验收。

## 上游依据

- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/12-full-control.ts
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/09-api-keys-and-oauth.ts

代码以已安装的 1.5.0 SDK 导出与实际集成测试为准，不跟随上游主分支隐式升级。
