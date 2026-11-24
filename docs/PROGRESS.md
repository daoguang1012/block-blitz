# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M0 骨架 & 风险验证（进行中：M0-1 已上线；M0-2 已提 PR #6 审查中；M0-3 PR #5 第 1 轮修复中）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ （M0-1 已上线生效）
- **下一步**：等待 Astra 完成 PR #6（#3）第 1 轮审查并等待 Neon 完成 PR #5（#4）修复后复审 → 合并两项 PR → 派 Astra（`xhigh`）做 M0 里程碑验收 → 请产品负责人真机测试（M0-4）

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| #3 | [M0] PeerJS 联机 Spike 与 Transport 抽象 | Sol（作者）/ Astra（审查） | 作者：`node:delegated-task:command%3Amcp%3Ab3e6a1f3-ff35-4166-bfb8-6164abff03ea%3Athread-send%3Am0-2-sol-net-spike-resume`（已完成）<br>审查：`node:delegated-task:command%3Amcp%3Ab3e6a1f3-ff35-4166-bfb8-6164abff03ea%3Adelegate-task%3Am0-2-astra-review-r1` | `feat/3-net-spike` | [#6](https://github.com/daoguang1012/block-blitz/pull/6)（CI ✅） | Astra 第 1 轮审查中 |
| #4 | [M0] 菜单 UI 外壳、Hash 路由与本地设置 | Neon（`antigravity / gemini-4-neon`） | `node:delegated-task:command%3Amcp%3Ab3e6a1f3-ff35-4166-bfb8-6164abff03ea%3Athread-send%3Am0-3-neon-fix-r1` | `feat/4-menu-ui-shell` | [#5](https://github.com/daoguang1012/block-blitz/pull/5) | 第 1 轮审查修复中 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | 🔄 进行中（1/3 已合入，2/3 审查/修复中） | — |
| M1 单机核心 | ⏳ | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 Sol 完成 Issue #3（M0-2 PeerJS 联机 Spike 与 Transport 抽象）并提交 PR #6（CI 全绿，26/26 单测通过，含 `docs/NET_SPIKE.md`），已派发 Astra 审查
- 2026-11-24 Astra 完成 PR #5 第 1 轮审查（REQUEST_CHANGES），已转交 Neon 修复
- 2026-11-24 14:28 定时任务按期触发：唤醒 Sol 续跑 #3 并新派 Astra 审查 PR #5
- 2026-11-24 Neon 完成 Issue #4（M0-3 菜单 UI 外壳）并提交 PR #5（CI 全绿）
- 2026-11-24 PR #2（Issue #1 工程脚手架与部署管线）合并入 `main`，GitHub Pages 自动部署成功

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | 针对 PeerJS 1.5.5 `reliable: false` 实测仅设 `ordered: false`（未限重传）：M2 继续使用 PeerJS 双通道方案，并在应用层对高频 `state`/`snap` 按 `seq`/`tick` 丢弃旧包；保留 `Transport` 抽象以便后续按需在内部切换原生 `maxRetransmits: 0` | `ordered: false` 已消除队头阻塞（主要卡顿来源），6 人小包场景无需引入自建信令/SDP 协商复杂度 |
| 2026-11-24 | 不切换替代模型，保持 Sol（`gpt-6.2-sol`）/ Neon（`gemini-4-neon`）/ Astra（`gpt-6.2-astra`）原定分工，定时 3h15m 后自动续跑 | 产品负责人确认：保持团队模型一致性，等待 Codex 额度恢复 |
| 2026-11-24 | 采纳 PR #5 中 `#ui-root > :not(.bb-ui) { pointer-events: auto; }` 的兼容规则；后续 M1/M2 在 `src/shared/types.ts` 定义全局事件契约供 UI 与核心层通过 `EventBus` 解耦通信 | 既保持菜单空白区透传 3D 背景，又确保同样挂载于 `#ui-root` 的 `?spike=net` 诊断页无需额外样式即可点击交互 |
| 2026-11-24 | Issue #3（`?spike=net`）作为位于 `src/net/` 的开发者诊断页，特批其诊断文案置于 `src/net/` 内部常量、独立样式置于 `src/styles/net-spike.css` | 遵守 ESLint 禁止 `src/net/**` 导入 `src/ui/**` 的架构防线，同时与并行修改 `src/ui/strings.ts` 和 `src/styles/main.css` 的 Issue #4 实现零文件重叠 |
| 2026-11-24 | 在 M0-1 中预置 `src/ui/index.ts`（`initUI`）与 `src/net/spike.ts`（`initNetSpike`，通过 `?spike=net` 分流）挂载入口 | 让 M0-2（Sol）与 M0-3（Neon）并行开发时无需同时修改 `src/main.ts` 或 `index.html`，消除合并冲突 |

## 阻塞 / 待用户处理

- 无
