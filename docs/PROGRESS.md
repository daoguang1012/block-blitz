# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M0 骨架 & 风险验证（进行中：M0-1 已完成上线，M0-2 与 M0-3 并行开发中）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ （已上线生效）
- **下一步**：等待 Sol（#3 联机 spike）与 Neon（#4 菜单 UI 外壳）各自完成 → 交 Astra 审查并合并 → 派 Astra 做 M0 里程碑验收 → 请产品负责人真机（电脑 + 手机 4G）验证 M0-4

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| #3 | [M0] PeerJS 联机 Spike 与 Transport 抽象 | Sol（`xhigh`） | `node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-2-sol-net-spike` | `feat/3-net-spike` | — | 开发中 |
| #4 | [M0] 菜单 UI 外壳、Hash 路由与本地设置 | Neon（`high`） | `node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-3-neon-ui-shell` | `feat/4-menu-ui-shell` | — | 开发中 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | 🔄 进行中（1/3 代码任务已合入） | — |
| M1 单机核心 | ⏳ | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 并行创建并派发 Issue #3（M0-2 联机 spike → Sol）与 Issue #4（M0-3 菜单 UI 外壳 → Neon）
- 2026-11-24 PR #2（Issue #1 工程脚手架与部署管线）经 Astra 第 2 轮复审 APPROVE 后合并入 `main`，GitHub Pages 首次自动部署成功
- 2026-11-24 Sol 完成 PR #2 第 1 轮审查修复（动态导入跨层拦截 + Pages 工作流最小权限拆分）
- 2026-11-24 创建 Issue #1（M0-1 工程脚手架与部署管线）并由 Sol 提交 PR #2
- 2026-11-24 仓库初始化：GDD v0.1 定稿、调度手册、协作规范、GitHub 仓库/标签/里程碑/Pages 配置

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | Issue #3（`?spike=net`）作为位于 `src/net/` 的开发者诊断页，特批其诊断文案置于 `src/net/` 内部常量、独立样式置于 `src/styles/net-spike.css` | 遵守 ESLint 禁止 `src/net/**` 导入 `src/ui/**` 的架构防线，同时与并行修改 `src/ui/strings.ts` 和 `src/styles/main.css` 的 Issue #4 实现零文件重叠 |
| 2026-11-24 | 在 M0-1 中预置 `src/ui/index.ts`（`initUI`）与 `src/net/spike.ts`（`initNetSpike`，通过 `?spike=net` 分流）挂载入口 | 让 M0-2（Sol）与 M0-3（Neon）并行开发时无需同时修改 `src/main.ts` 或 `index.html`，消除合并冲突 |
| 2026-11-24 | 采纳 GDD §16 全部建议，v1 支持手机 | 产品负责人确认 |

## 阻塞 / 待用户处理

- 无
