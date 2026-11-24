# 进度记录（唯一真相来源）

> 由 Carbon 维护。新会话接手时先读 `docs/ORCHESTRATION.md`，再读本文件。

## 当前状态

- **当前里程碑**：M1 单机核心（6 个子任务已完成 4 个代码开发且全部 CI 全绿：#7 已合入 `main`；PR #11、PR #13、PR #14 均已就绪并通过 GitHub CI，因 22:18 Codex 配额触顶暂停等待 Astra 审查与后续 M1-4/M1-6 开发）
- **线上地址**：https://daoguang1012.github.io/block-blitz/ ｜ 联机诊断页：https://daoguang1012.github.io/block-blitz/?spike=net
- **下一步**：等待产品负责人告知下次 Codex（ChatGPT）配额恢复时间（或换号）→ 设定时自动续跑：Astra 审查合并 PR #11 / #13 / #14 → Sol 开发 M1-4（武器系统 + 移动靶）→ Sol 开发 M1-6（训练场端到端集成 + 视角模型 + 特效，Neon 并行补齐交叉单测）→ Astra `xhigh` M1 验收上线 → 请产品负责人真机试玩训练场

## 进行中

| Issue | 任务 | 负责 | taskId | 分支 | PR | 状态 |
|---|---|---|---|---|---|---|
| #9 | [M1] 世界碰撞、射线检测与第一人称玩家控制器（M1-2） | Sol（作者）/ Astra（待审） | 作者线程：`thread:delegated-task:command%3Amcp%3A6b4d88d3-d80e-4b01-9e7c-695166976cb5%3Adelegate-task%3Am1-2-sol-collision-raycast-controller`（已完成） | `feat/9-collision-raycast-controller` | [#13](https://github.com/daoguang1012/block-blitz/pull/13)（`db1f834`，CI ✅，150 单测 ✅） | ⏸️ 代码与 CI 全绿，待 Codex 额度恢复后 Astra R1 审查 |
| #10 | [M1] Block Plaza 地图数据、画质分档渲染器与静态场景几何合并（M1-3） | Neon（作者）/ Astra（待审） | 作者线程：`thread:delegated-task:command%3Amcp%3A6b4d88d3-d80e-4b01-9e7c-695166976cb5%3Adelegate-task%3Am1-3-neon-block-plaza-renderer-scene`（已完成）<br>R1 审查（中断）：`node:delegated-task:command%3Amcp%3A6b4d88d3-d80e-4b01-9e7c-695166976cb5%3Adelegate-task%3Am1-3-astra-review-r1` | `feat/10-block-plaza-scene-builder` | [#11](https://github.com/daoguang1012/block-blitz/pull/11)（`54e8fe5`，CI ✅，135 单测 ✅） | ⏸️ 本地四项与 CI 全绿，Astra R1 途中遇 Codex 额度触顶，待恢复续审 |
| #12 | [M1] 基础触屏输入（摇杆/视角/联动开火）与战斗 HUD / 暂停菜单（M1-5） | Neon（作者）/ Astra（待审） | 作者线程：`thread:delegated-task:command%3Amcp%3A6b4d88d3-d80e-4b01-9e7c-695166976cb5%3Adelegate-task%3Am1-5-neon-touch-input-hud-pause`（已完成） | `feat/12-touch-input-battle-hud` | [#14](https://github.com/daoguang1012/block-blitz/pull/14)（`bd97728`，CI ✅，133 单测 ✅） | ⏸️ 代码与 CI 全绿，待 Codex 额度恢复后 Astra R1 审查 |

## M1 单机核心拆解计划

| 批次 | 代号 | 任务 | 负责 | 允许修改范围（零重叠） | 依赖 |
|---|---|---|---|---|---|
| Wave 1 | M1-1（#7） | `shared/types.ts`、`shared/math.ts`、60 Hz `FixedStepLoop`、`InputState` + `KeyboardMouseInput`、`map-loader.ts` | Sol（`high`） | `src/shared/**`、`src/core/loop.ts`、`src/core/input/{input-state,keyboard-mouse}.ts`、`src/world/map-loader.ts`、`src/config/{loop,input}.ts`、`tests/{shared,core}/`、`tests/world/map-loader.test.ts` | 无 |
| Wave 2 | M1-2 | 胶囊 vs AABB 碰撞滑移、射线 vs AABB/胶囊（含 +20% 头/+10% 身判定放宽）、第一人称 `PlayerController`（移动/空控/跳/冲刺/跳板冲量） | Sol（`xhigh`） | `src/world/{collision,raycast}.ts`、`src/game/player-controller.ts`、`src/config/player.ts`、`tests/world/{collision,raycast}.test.ts`、`tests/game/player-controller.test.ts` | M1-1 |
| Wave 2 | M1-3 | Block Plaza 地图 JSON（60×60m、中央高台、四角掩体、双跳板、≥8 出生点）+ `renderer.ts` 画质分档 + `scene-builder.ts` 静态几何合并 | Neon（`high`） | `public/maps/block-plaza.json`、`src/render/{renderer,scene-builder}.ts`、`src/config/{render,map}.ts`、`tests/world/block-plaza.test.ts` | M1-1 |
| Wave 3 | M1-4 | 武器状态机框架 + 爆能枪（8 发/s、30 发自动/手动换弹、散布）+ 平底锅（近战 50 伤、2m 击退）+ 移动靶纯模拟（往返移动、受击扣血、3s 复活、瞄敌检测） | Sol（`high`） | `src/game/weapons/**`、`src/game/targets.ts`、`src/config/{weapons,targets}.ts`、`tests/game/{weapons,targets}.test.ts` | M1-2 |
| Wave 3 | M1-5 | 基础触屏输入（左半屏浮动摇杆、右半屏转视角、按住开火同时拖动转视角、跳/冲刺/换弹/切枪 ≥56px 安全区）+ 战斗 HUD（变红准星 + 命中 X、血甲、弹药、冲刺冷却、FPS、暂停弹窗）+ 碰撞边界交叉单测 | Neon（`high`） | `src/core/input/touch.ts`、`src/ui/hud/**`、`src/styles/hud.css`、`src/ui/strings.ts`、`src/config/ui.ts`、`tests/core/touch-input.test.ts`、`tests/ui/hud.test.ts`、`tests/world/collision-edge.test.ts` | M1-1, M1-2 |
| Wave 4 | M1-6 | 训练场端到端集成（`#/train` 生命周期、Pointer Lock / 触屏全屏切换）、第一人称视角武器模型（后坐/挥锅）与弹道/命中火花特效、移动靶方块机器人渲染 | Sol（`high`） | `src/game/training-session.ts`、`src/render/{viewmodel,target-meshes}.ts`、`src/render/effects/**`、`src/ui/index.ts`、`src/ui/train/train-shell.ts`、`src/main.ts`、`tests/game/training-session.test.ts` | M1-2 ~ M1-5 |

## 里程碑总览

| 里程碑 | 状态 | 验收报告 |
|---|---|---|
| M0 骨架 & 风险验证 | ✅ 已完成（自动化验收 + 真机 4G 跨网验证全部 PASS，RTT 41.4 ms） | [docs/M0_ACCEPTANCE.md](M0_ACCEPTANCE.md) · [docs/NET_SPIKE.md](NET_SPIKE.md) |
| M1 单机核心 | ⏸️ 4/6 子任务代码已完成（1 已合入、3 个 PR CI 全绿待审），等 Codex 额度恢复自动续跑 | — |
| M2 联机 MVP | ⏳ | — |
| M3 内容 | ⏳ | — |
| M4 打磨 | ⏳ | — |
| M5 发布 | ⏳ | — |

## 已完成（最近 10 条）

- 2026-11-24 Neon 完成 #12（M1-5 基础触屏输入与战斗 HUD / 暂停菜单）并提交 PR #14（`bd97728`，CI 全绿，133 项单测通过）
- 2026-11-24 Sol 完成 #9（M1-2 世界碰撞、射线检测与第一人称玩家控制器）并提交 PR #13（`db1f834`，CI 全绿，150 项单测通过）
- 2026-11-24 Neon 完成 #10（M1-3 Block Plaza 地图数据、画质渲染器与场景几何合并）并提交 PR #11（`54e8fe5`，CI 全绿，135 项单测通过）
- 2026-11-24 合并 PR #8（[#7] 核心共享契约、固定步长主循环、键鼠输入与地图加载器，`de20f4c`）：Astra 首轮审查 `VERDICT: APPROVE`（0 Blocker / 0 Major，121/121 单测通过）
- 2026-11-24 产品负责人完成 M0-4 真机跨网验证（RTT 41.4 ms，双通道各 100/100 送达，`unreliable` 实测乱序 2），回填 `docs/NET_SPIKE.md` 并正式关闭 M0 里程碑，启动 M1 派发 #7
- 2026-11-24 Astra（`xhigh`）完成 M0 里程碑集成与线上 Pages 验收：**M0 ACCEPTANCE: PASS**（0 Blocker / 0 Major / 1 Minor，62/62 单测通过，gzip 总包体 175.6 KB）
- 2026-11-24 合并 PR #6（[#3] PeerJS 联机 Spike 与 Transport 抽象，`69b3c26`）：Astra 第 2 轮复审 `VERDICT: APPROVE`（0 Blocker / 0 Major，2 项 Minor 留入 M2 收口），CI 全绿
- 2026-11-24 合并 PR #5（[#4] 菜单 UI 外壳、Hash 路由与本地设置，`5d66b65`）：Astra 第 3 轮终审 `VERDICT: APPROVE`（0 Blocker / 0 Major / 0 Minor），CI 全绿
- 2026-11-24 Sol 完成 PR #6 第 1 轮审查全部 4 项修复并推送（`7911803`，CI 全绿，36/36 单测通过）
- 2026-11-24 Neon 完成 PR #5 第 2 轮审查全部 2 项修复并推送（`fb682a7`，CI 全绿，29/29 单测通过）
- 2026-11-24 Astra 完成 PR #5 第 2 轮复审（确认第 1 轮 5 项全过，检出横屏版本徽标样式覆盖问题）
- 2026-11-24 Astra 完成 PR #6 第 1 轮审查（REQUEST_CHANGES：4 项改进建议）

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | `hud.css` 保持由 `src/ui/hud/index.ts` 按需导入；M1-6 集成时通过 `createBattleHud({ isEscapeBlocked })` 联动 `SettingsModal` 开启态，使 `Escape` 优先关闭顶层设置弹窗（`z-index: 50`）而不误关下层暂停菜单（`z-index: 40`） | 既保证 `core/input/touch.ts` 不跨层导入样式，又让双层弹窗键盘交互符合直觉 |
| 2026-11-24 | 画质设置运行时变更即时更新像素比（`pixelRatio`）与阴影开关，WebGL `antialias`（MSAA）于下次进入场景创建 `GameRenderer` 时生效 | WebGL 上下文创建后无法原地切换 MSAA，局中销毁重建渲染器会造成黑屏闪烁与纹理重建开销 |
| 2026-11-24 | M2/M4 联机建连失败提示中必须显式加入「请检查是否开启了 VPN/代理软件或禁用了浏览器 WebRTC」引导 | M0-4 真机实测确认：开启代理或浏览器禁用 WebRTC 会直接阻断 P2P 打洞，恢复后 RTT 仅 41.4 ms |
| 2026-11-24 | M1 拆分为 4 波共 6 个子任务（M1-1 接口先行 → M1-2/M1-3 并行 → M1-4/M1-5 并行 → M1-6 集成收口） | 严格遵循 `ORCHESTRATION.md` §3/§8 接口先行与文件零重叠原则，最大化 Sol 与 Neon 并行效率 |
| 2026-11-24 | M0 验收检出的诊断页按钮高度 44 px（`net-spike.css`）作为 Minor 记录，M2 正式大厅 UI 直接统一采用 `UI_CONFIG.minTouchTargetPx`（56 px） | `?spike=net` 仅为开发诊断入口，主菜单与设置正式 UI 已全部满足 ≥ 56 px |
| 2026-11-24 | PR #6 R2 复审记录的 2 项 Minor（`PeerJsTransport.sendFrame` 避免双重 JSON 序列化、`spike-pings.test.ts` 补 `expire()` 独立断言）归入 M2 网络模块迭代一并优化 | 不影响当前正确性与安全性，按 `ORCHESTRATION.md` §2.8 不阻塞 M0 合并 |
| 2026-11-24 | 针对 PeerJS 1.5.5 `reliable: false` 实测仅设 `ordered: false`（未限重传）：M2 继续使用 PeerJS 双通道方案，并在应用层对高频 `state`/`snap` 按 `seq`/`tick` 丢弃旧包 | 真机跨网实测 `unreliable` 出现 `乱序 2` 且 100/100 到达，验证了消除队头阻塞与应用层丢旧方案的有效性 |
| 2026-11-24 | 不切换替代模型，保持 Sol（`gpt-6.2-sol`）/ Neon（`gemini-4-neon`）/ Astra（`gpt-6.2-astra`）原定分工 | 产品负责人确认：保持团队模型一致性 |

## 阻塞 / 待用户处理

- **Codex（ChatGPT）配额触顶**（22:18）：M1 的前 4 个核心任务（#7 已合并，PR #11、PR #13、PR #14 均已提交且 GitHub CI 全绿）均已完成代码实现；待产品负责人告知下次 Codex 额度刷新时间（或换号）以设定时任务继续推进剩余审查与 M1-4 / M1-6 收尾。
