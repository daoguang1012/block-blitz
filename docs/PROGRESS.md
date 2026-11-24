# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M0 骨架 & 风险验证（定时等待中：Codex 额度预计 14:23 恢复，已设定 **2026-11-24 14:28:30 (+08:00)** 自动唤醒继续推进）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ （M0-1 已上线生效）
- **下一步**：14:28:30 定时任务触发后，保持原模型配置（Sol = `codex/gpt-6.2-sol`，Astra = `codex/gpt-6.2-astra`）：① `t3_thread_send` 恢复 Sol 原线程完成 #3 并提 PR；② 新建 `delegate_task` 派 Astra 审查 PR #5 → 合并两项 PR → Astra（`xhigh`）M0 里程碑验收 → 找产品负责人真机测试（M0-4）

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| #3 | [M0] PeerJS 联机 Spike 与 Transport 抽象 | Sol（`codex / gpt-6.2-sol`） | `node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-2-sol-net-spike`（线程：`thread:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-2-sol-net-spike`） | `feat/3-net-spike` | — | ⏰ 待 14:28 唤醒续跑（代码与双通道实测已就绪，差报告与提 PR） |
| #4 | [M0] 菜单 UI 外壳、Hash 路由与本地设置 | Neon（作者）/ Astra（审查） | 作者：`node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-3-neon-ui-shell`（已完成）<br>原审查（已中断）：`node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-3-astra-review-r1` | `feat/4-menu-ui-shell` | [#5](https://github.com/daoguang1012/block-blitz/pull/5)（CI ✅） | ⏰ 待 14:28 重新派发 Astra 第 1 轮审查 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | ⏰ 等待额度恢复（14:28 自动续跑） | — |
| M1 单机核心 | ⏳ | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 按产品负责人指示保留原模型阵容，创建一次性定时任务于 `2026-11-24 14:28:30+08:00`（3h15m 后）自动恢复推进
- 2026-11-24 Neon 完成 Issue #4（M0-3 菜单 UI 外壳）并提交 PR #5（CI 全绿，25/25 单测通过）
- 2026-11-24 并行创建并派发 Issue #3（M0-2 联机 spike → Sol）与 Issue #4（M0-3 菜单 UI 外壳 → Neon）
- 2026-11-24 PR #2（Issue #1 工程脚手架与部署管线）经 Astra 第 2 轮复审 APPROVE 后合并入 `main`，GitHub Pages 首次自动部署成功
- 2026-11-24 Sol 完成 PR #2 第 1 轮审查修复（动态导入跨层拦截 + Pages 工作流最小权限拆分）

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | 不切换替代模型，保持 Sol（`gpt-6.2-sol`）/ Neon（`gemini-4-neon`）/ Astra（`gpt-6.2-astra`）原定分工，定时 3h15m 后自动续跑 | 产品负责人确认：保持团队模型一致性，等待 Codex 额度恢复 |
| 2026-11-24 | 采纳 PR #5 中 `#ui-root > :not(.bb-ui) { pointer-events: auto; }` 的兼容规则；后续 M1/M2 在 `src/shared/types.ts` 定义全局事件契约供 UI 与核心层通过 `EventBus` 解耦通信 | 既保持菜单空白区透传 3D 背景，又确保同样挂载于 `#ui-root` 的 `?spike=net` 诊断页无需额外样式即可点击交互 |
| 2026-11-24 | Issue #3（`?spike=net`）作为位于 `src/net/` 的开发者诊断页，特批其诊断文案置于 `src/net/` 内部常量、独立样式置于 `src/styles/net-spike.css` | 遵守 ESLint 禁止 `src/net/**` 导入 `src/ui/**` 的架构防线，同时与并行修改 `src/ui/strings.ts` 和 `src/styles/main.css` 的 Issue #4 实现零文件重叠 |
| 2026-11-24 | 在 M0-1 中预置 `src/ui/index.ts`（`initUI`）与 `src/net/spike.ts`（`initNetSpike`，通过 `?spike=net` 分流）挂载入口 | 让 M0-2（Sol）与 M0-3（Neon）并行开发时无需同时修改 `src/main.ts` 或 `index.html`，消除合并冲突 |
| 2026-11-24 | 采纳 GDD §16 全部建议，v1 支持手机 | 产品负责人确认 |

## 阻塞 / 待用户处理

- 无（已设置 2026-11-24 14:28:30+08:00 自动唤醒续跑，无需人工介入）
