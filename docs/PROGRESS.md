# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M0 骨架 & 风险验证（M0-1、M0-3 已合入 `main`；仅剩 M0-2 PR #6 第 2 轮增量复审 + M0 里程碑验收，已设定时任务于 `19:33` 自动续跑）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ （M0-1、M0-3 已合入自动部署中）
- **下一步**：`2026-11-24 19:33` 定时唤醒 → `gpt-6.2-astra` 复审 PR #6（R2 增量复审）→ 合并 PR #6 部署 Pages → `gpt-6.2-astra`（`xhigh`）执行 M0 里程碑验收 → 请产品负责人真机测试（M0-4）

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| #3 | [M0] PeerJS 联机 Spike 与 Transport 抽象 | Sol（作者）/ Astra（复审） | 作者线程：`thread:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-2-sol-net-spike`<br>作者修复：`node:delegated-task:command%3Amcp%3Ab3e6a1f3-ff35-4166-bfb8-6164abff03ea%3Athread-send%3Am0-2-sol-fix-r1`（已完成） | `feat/3-net-spike` | [#6](https://github.com/daoguang1012/block-blitz/pull/6)（`7911803`，CI ✅，36 单测 ✅） | ⏰ 第 1 轮 4 项修复已就绪，定于 `19:33` Codex 额度恢复后自动发起 Astra R2 增量复审 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | 🔄 M0-1、M0-3 已合并，19:33 自动续跑 M0-2 复审与里程碑验收 | — |
| M1 单机核心 | ⏳ | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 合并 PR #5（[#4] 菜单 UI 外壳、Hash 路由与本地设置，`5d66b65`）：核实 Astra 第 3 轮终审已于额度触顶前在 PR #5 发表 `VERDICT: APPROVE`（0 Blocker / 0 Major / 0 Minor）且 CI 全绿
- 2026-11-24 Sol 完成 PR #6 第 1 轮审查全部 4 项修复并推送（`7911803`，CI 全绿，36/36 单测通过）
- 2026-11-24 Neon 完成 PR #5 第 2 轮审查全部 2 项修复并推送（`fb682a7`，CI 全绿，29/29 单测通过）
- 2026-11-24 Astra 完成 PR #5 第 2 轮复审（确认第 1 轮 5 项全过，检出横屏版本徽标样式覆盖问题）
- 2026-11-24 Astra 完成 PR #6 第 1 轮审查（REQUEST_CHANGES：4 项改进建议）
- 2026-11-24 14:28 定时任务按期触发：Sol 提交 PR #6，Astra 完成 PR #5 第 1 轮审查，Neon 完成第 1 轮 5 项修复

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | 设定 `2026-11-24T19:33:00+08:00` 一次性定时任务自动唤醒续跑 M0 收尾 | 产品负责人于 19:03 确认选方案 B（保持原装 `gpt-6.2-astra` 模型，28 分钟后恢复额度） |
| 2026-11-24 | 后续派发 Astra 复审（R2/R3）时明确限定只做增量 diff 与问题点回归验证，避免重复全量浏览器套件以节约 Codex 额度 | 14:28–15:03 期间连续 5 个高强度 Codex 任务快速耗尽单窗口配额 |
| 2026-11-24 | 针对 PeerJS 1.5.5 `reliable: false` 实测仅设 `ordered: false`（未限重传）：M2 继续使用 PeerJS 双通道方案，并在应用层对高频 `state`/`snap` 按 `seq`/`tick` 丢弃旧包 | `ordered: false` 已消除队头阻塞，6 人小包场景无需引入自建信令/SDP 协商复杂度 |
| 2026-11-24 | 不切换替代模型，保持 Sol（`gpt-6.2-sol`）/ Neon（`gemini-4-neon`）/ Astra（`gpt-6.2-astra`）原定分工 | 产品负责人确认：保持团队模型一致性 |
| 2026-11-24 | 采纳 PR #5 中 `#ui-root > :not(.bb-ui) { pointer-events: auto; }` 的兼容规则 | 兼顾 3D 背景透传与 `?spike=net` 诊断页点击交互 |
| 2026-11-24 | 在 M0-1 中预置 `src/ui/index.ts` 与 `src/net/spike.ts` 挂载入口 | 消除 M0-2 与 M0-3 并行开发的合并冲突 |

## 阻塞 / 待用户处理

- 暂无待用户操作事项：已设定 `2026-11-24 19:33`（+08:00）一次性定时唤醒，待 Codex 额度恢复后自动完成 PR #6 复审、合并部署与 M0 里程碑验收，就绪后再请产品负责人进行真机测试（M0-4）。
