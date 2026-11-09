# Agent 重置测试的并发导入问题

## 失败与触发条件

v0.6.0 发版验证间歇失败于
`useAgentStore.test.ts` 的“切换项目后先重置 Pi，再发送下一项目”测试：
预期调用 `pi_reset_runtime`，实际记录只有两次 `pi_send_prompt`。
同一提交在独立 verify 流程通过、在 release 内嵌验证失败；调整测试顺序后也能改变结果。
不能将它视为稳定的 Linux 产品故障，也不能用一次重跑通过证明已解决。

生产代码存在两条并发的动态导入：

1. 项目订阅回调把重置排入 Promise 队列，随后导入 `@tauri-apps/api/core`。
2. 紧接着发送下一条消息的 `sendViaRealAcp` 也先导入该模块，再等待重置队列。

测试原先用 `vi.mock('@tauri-apps/api/core', factory)` 替换整个 JS 模块，
而模拟的 `window.__TAURI_INTERNALS__` 只是空对象。

锁定依赖中的 Vitest 3.2.7 `VitestMocker.requestWithMock` 使用可变的
`callstack` 判断是否递归进入手工 mock。其实现包含对
`Promise.all(import(), import())` 不适用的注释：某些并发路径会绕过
手工 mock，加载真实模块。
真实 Tauri `invoke` 包装层会调用 `window.__TAURI_INTERNALS__.invoke`，
在旧测试环境里该函数不存在。Pi 重置代码捕获此异常并记录状态，
所以测试最终看到的是“没收到 reset 调用”，而不是最初的 TypeError。

## 为什么前几次修改不充分

原测试只保存最后一个项目订阅，改为订阅集合是必要的模拟修正；
保留模块实例、改为重置 Zustand 快照，也减少了模块重载干扰。
但这些都没有移除动态导入模块上的手工 mock，只改变了竞争条件的触发概率。
仓库已有的项目持久化测试此前也处理过同一种 IPC mock 边界问题。

## 最终修复与验证

- 保留真实的 Tauri JS 包装层，移除对 `@tauri-apps/api/core` 的模块 mock。
- 只在 `window.__TAURI_INTERNALS__.invoke` 原生 IPC 边界接入测试 spy，
  不启动桌面后端或模型服务。
- 保留多订阅语义和隔离状态；继续断言 reset 完成前不能发送下一项目。
- 增加 32 路并发调用回归，同时使用动态导入和 `vi.importActual`。
  后者**显式模拟**绕过模块 mock 的加载路径，不依赖碰巧触发 Vitest 竞争。
- 修复前，这条回归稳定报告 16 次
  `TypeError: window.__TAURI_INTERNALS__.invoke is not a function`；
  修复后，两种加载路径均到达同一个 IPC spy，32 个结果按序返回。
- CI 的五轮乱序检查同时覆盖项目与 Agent 状态库，不增加自动重试、
  不跳过测试，也不放宽断言来掩盖问题。
