# AGENTS.md — 所有 AI 成员必读

项目：**Block Blitz · 方块闪击** —— 浏览器 3D 第一人称射击（three.js + TypeScript + Vite），PeerJS P2P 联机，部署 GitHub Pages，支持 PC 与手机。

## 必读文档
- `docs/GAME_DESIGN.md`：游戏设计（玩法、数值、架构、协议、里程碑）。**以它为准。**
- `docs/ORCHESTRATION.md`：团队分工与流程（主控 Carbon 必读，其他成员了解即可）。
- `docs/PROGRESS.md`：当前进度。
- `docs/PROTOCOL.md`：联机协议（改协议必须同步更新并提升 `PROTOCOL_VERSION`）。

## 团队
| 成员 | 角色 |
|---|---|
| Carbon | 主控：派活、守接口、合并 |
| Sol | 主力开发：core / world / net / game 核心 |
| Neon | 协助开发：UI / 触屏 / 音效 / 地图 / 特效 / 机器人 / 测试 |
| Astra | 审查：只审查不写功能代码 |

## 开发者硬性规则
1. **只改 Issue 中“允许修改”的文件**。需要改别处时停下来说明。
2. 不要修改 `src/shared/**` 与 `src/net/protocol.ts`，除非任务明确授权。
3. 不要新增 npm 依赖，除非任务明确授权。
4. 所有数值放在 `src/config/`，逻辑代码中不写死。
5. 界面文字放在 `src/ui/strings.ts`。
6. 模拟层（`world/`、`game/`、`net/`）**不得 import 渲染层**（`render/`、`ui/`），保证能在 Node 里单测。
7. 游戏逻辑只读取 `InputState`，不直接监听键盘/触摸。
8. 热循环（每帧/每 tick）中不要分配新对象（复用 `Vector3` 等）；three 资源不用时 `dispose()`。
9. 单位：米、秒、弧度；Y 轴向上。
10. 不启动子代理、不合并 PR、不 watch PR（除非任务明确要求）。

## 命令（M0-1 后可用）
```powershell
npm ci
npm run dev        # 本地开发；加 ?net=local 可用双标签页测联机
npm run typecheck
npm run lint
npm run test
npm run build
```
提交 PR 前四项检查（typecheck / lint / test / build）必须全部通过。

## Git 规范
- 分支：`feat/<issue号>-<slug>`、`fix/<issue号>-<slug>`
- 提交：Conventional Commits，如 `feat(net): add peerjs transport`
- PR：使用 `.github/pull_request_template.md`，正文含 `Closes #<号>`
- Windows 环境，换行统一 LF（见 `.gitattributes`）

## 代码风格
- TypeScript strict，协议/网络相关代码禁止 `any`
- 文件名 `kebab-case.ts`，类 `PascalCase`，常量 `UPPER_SNAKE_CASE`
- 模块间通信用 `core/events.ts` 的类型化事件总线
- 第三方素材只用 CC0 或兼容许可，并登记到 `CREDITS.md`
