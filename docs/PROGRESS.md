# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M0 骨架 & 风险验证（M0-1、M0-2、M0-3 全部 PR 已合入 `main` `69b3c26`，Astra `xhigh` 正在执行 M0 里程碑集成验收与线上 Pages 校验）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ （含联机诊断页 https://daoguang1012.github.io/block-blitz/?spike=net ，自动部署进行中）
- **下一步**：等待 Astra（`xhigh`）完成 M0 里程碑验收 → 汇总验收结论与线上地址，请产品负责人执行电脑 + 手机（4G）真机测试（M0-4）

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| M0 验收 | M0 骨架 & 风险验证里程碑验收 | Astra（`xhigh`） | `node:delegated-task:command%3Amcp%3A179666c3-774b-4f30-b489-dced119d8ce4%3Adelegate-task%3Am0-astra-milestone-acceptance-69b3c26` | `main`（`69b3c26`） | — | 🔍 M0 全仓集成检查与线上 Pages 验收进行中 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | 🔄 代码已全部合入 `main`，Astra `xhigh` 里程碑验收中（完成后进入 M0-4 真机测试） | — |
| M1 单机核心 | ⏳ | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 合并 PR #6（[#3] PeerJS 联机 Spike 与 Transport 抽象，`69b3c26`）：Astra 第 2 轮复审 `VERDICT: APPROVE`（0 Blocker / 0 Major，2 项 Minor 留入 M2 收口），CI 全绿
- 2026-11-24 合并 PR #5（[#4] 菜单 UI 外壳、Hash 路由与本地设置，`5d66b65`）：Astra 第 3 轮终审 `VERDICT: APPROVE`（0 Blocker / 0 Major / 0 Minor），CI 全绿
- 2026-11-24 Sol 完成 PR #6 第 1 轮审查全部 4 项修复并推送（`7911803`，CI 全绿，36/36 单测通过）
- 2026-11-24 Neon 完成 PR #5 第 2 轮审查全部 2 项修复并推送（`fb682a7`，CI 全绿，29/29 单测通过）
- 2026-11-24 Astra 完成 PR #5 第 2 轮复审（确认第 1 轮 5 项全过，检出横屏版本徽标样式覆盖问题）
- 2026-11-24 Astra 完成 PR #6 第 1 轮审查（REQUEST_CHANGES：4 项改进建议）
- 2026-11-24 14:28 定时任务按期触发：Sol 提交 PR #6，Astra 完成 PR #5 第 1 轮审查，Neon 完成第 1 轮 5 项修复

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | PR #6 R2 复审记录的 2 项 Minor（`PeerJsTransport.sendFrame` 避免双重 JSON 序列化、`spike-pings.test.ts` 补 `expire()` 独立断言）归入 M2 网络模块迭代一并优化 | 不影响当前正确性与安全性，按 `ORCHESTRATION.md` §2.8 不阻塞 M0 合并 |
| 2026-11-24 | 设定 `2026-11-24T19:33:00+08:00` 一次性定时任务自动唤醒续跑 M0 收尾 | 产品负责人于 19:03 确认选方案 B（保持原装 `gpt-6.2-astra` 模型，28 分钟后恢复额度） |
| 2026-11-24 | 后续派发 Astra 复审（R2/R3）时明确限定只做增量 diff 与问题点回归验证，避免重复全量浏览器套件以节约 Codex 额度 | 14:28–15:03 期间连续 5 个高强度 Codex 任务快速耗尽单窗口配额 |
| 2026-11-24 | 针对 PeerJS 1.5.5 `reliable: false` 实测仅设 `ordered: false`（未限重传）：M2 继续使用 PeerJS 双通道方案，并在应用层对高频 `state`/`snap` 按 `seq`/`tick` 丢弃旧包 | `ordered: false` 已消除队头阻塞，6 人小包场景无需引入自建信令/SDP 协商复杂度 |
| 2026-11-24 | 不切换替代模型，保持 Sol（`gpt-6.2-sol`）/ Neon（`gemini-4-neon`）/ Astra（`gpt-6.2-astra`）原定分工 | 产品负责人确认：保持团队模型一致性 |
| 2026-11-24 | 采纳 PR #5 中 `#ui-root > :not(.bb-ui) { pointer-events: auto; }` 的兼容规则 | 兼顾 3D 背景透传与 `?spike=net` 诊断页点击交互 |
| 2026-11-24 | 在 M0-1 中预置 `src/ui/index.ts` 与 `src/net/spike.ts` 挂载入口 | 消除 M0-2 与 M0-3 并行开发的合并冲突 |

## 阻塞 / 待用户处理

- 暂无待用户操作事项：已设定 `2026-11-24 19:33`（+08:00）一次性定时唤醒，待 Codex 额度恢复后自动完成 PR #6 复审、合并部署与 M0 里程碑验收，就绪后再请产品负责人进行真机测试（M0-4）。
