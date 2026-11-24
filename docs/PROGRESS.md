# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M0 骨架 & 风险验证（进行中）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ （M0-1 合并后生效）
- **下一步**：等待 Astra 完成 PR #2（#1）审查 → 若通过则合并 PR #2 → 并行创建并派发 M0-2（联机 spike）与 M0-3（菜单 UI 外壳）

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| #1 | [M0] 工程脚手架与部署管线 | Sol（作者）/ Astra（审查） | 作者：`node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-1-sol-scaffold`（已完成）<br>审查：`node:delegated-task:command%3Amcp%3A18e34d0e-73ec-4f7e-b61c-6d962258b714%3Adelegate-task%3Am0-1-astra-review-r1` | `feat/1-project-scaffold` | [#2](https://github.com/daoguang1012/block-blitz/pull/2)（CI ✅） | Astra 第 1 轮审查中 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | 🔄 进行中 | — |
| M1 单机核心 | ⏳ | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 Sol 完成 Issue #1 开发并提交 PR #2（CI 全绿），已派发 Astra 进行第 1 轮审查
- 2026-11-24 创建 Issue #1（M0-1 工程脚手架与部署管线）并派发给 Sol
- 2026-11-24 仓库初始化：GDD v0.1 定稿、调度手册、协作规范、GitHub 仓库/标签/里程碑/Pages 配置

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | 在 M0-1 中预置 `src/ui/index.ts`（`initUI`）与 `src/net/spike.ts`（`initNetSpike`，通过 `?spike=net` 分流）挂载入口 | 让后续 M0-2（Sol）与 M0-3（Neon）并行开发时无需同时修改 `src/main.ts` 或 `index.html`，消除合并冲突 |
| 2026-11-24 | 采纳 GDD §16 全部建议，v1 支持手机 | 产品负责人确认 |

## 阻塞 / 待用户处理

- 无
