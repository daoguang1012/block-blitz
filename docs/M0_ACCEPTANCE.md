# M0 里程碑验收报告（骨架 & 风险验证）

- **验收日期**：2026-11-24
- **验收提交**：`69b3c26`（`main`）
- **审查员**：Astra（`codex / gpt-6.2-astra`，`reasoningEffort: xhigh`）
- **自动化验收结论**：**PASS**（0 Blocker / 0 Major / 1 Minor）
- **真机验收结论（M0-4）**：**PASS**（关闭代理并开启浏览器 WebRTC 后跨网直连成功，RTT `41.4 ms`，`reliable` 100/100 乱序 0，`unreliable` 100/100 乱序 2；M0 里程碑正式关闭）

## 1. GDD §12 与 M0 子任务核对

| 验收项 | 结果 | 实测证据 |
|---|---|---|
| M0-1 · 工程骨架与本地四项检查 | ✅ | 独立 worktree 执行 `npm ci`、`typecheck`、`lint`、`test`、`build` 全部通过；Vitest 共 **9 个文件、62/62 项单测通过**；TS strict、模拟层零渲染导入、网络层零显式 `any`、事件总线与协议版本均合规。 |
| M0-1 · 生产构建、PR CI 与 Pages 部署 | ✅ | 产物共 6 个文件，原始大小 **686,472 B**，gzip 合计 **175,554 B**（远低于 GDD < 5 MB 首包预算）；PR CI 与 `main` 自动部署 GitHub Pages 均成功。 |
| GDD §12 · 线上地址可访问 | ✅ | [线上首页](https://daoguang1012.github.io/block-blitz/) 与 [线上诊断页](https://daoguang1012.github.io/block-blitz/?spike=net) 均返回 HTTP 200，带哈希静态分块（含按需加载的 PeerJS 分块）无 404、无控制台报错。 |
| M0-1 / M0-3 · 3D 背景与响应式布局 | ✅ | `1280×720`、`844×390`、`667×375`、`390×844` 四种视口均检测到动态渲染的 3D 旋转方块像素；桌面中央透传命中 `CANVAS`；横屏无横向溢出，主菜单交互按钮高度均 ≥ 56 px。 |
| M0-3 · 菜单、Hash 路由与分享链接 | ✅ | 昵称、主题色、训练（`#/train`）、创建房间、加入房间（小写自动规范化至 `#/room/K7QX`）、设置弹窗、深链刷新、非法路由回退 `#/`、完整分享链接复制全部通过。 |
| M0-3 · 本地持久化与竖屏旋转提示 | ✅ | 修改昵称、颜色、FOV、画质、FPS 开关后刷新，控件与 `localStorage` 一致恢复；`390×844` 竖屏下全屏旋转遮罩正常拦截，转回横屏自动解除。 |
| M0-2 · LocalTransport 与菜单集成 | ✅ | `?spike=net&net=local` 双标签页建房与加入成功，`#ui-root > :not(.bb-ui)` 指针事件正常；双向双通道各发 101 条消息均 **101/101 送达（乱序 0、重复 0）**，RTT 0.7 / 0.4 ms，双向断开清理正确。 |
| M0-2 · 线上 PeerJS 双通道实测 | ✅ | 线上 Pages 双标签页通过公共信令与 WebRTC DataChannel 实测建连成功；双向双通道均 **101/101 送达**，RTT 0.7 / 1.1 ms；实测 `reliable`（`ordered: true`）与 `unreliable`（`ordered: false, maxRetransmits: null`）与 `docs/NET_SPIKE.md` 一致。 |
| GDD §12 / M0-4 · 电脑家宽 ↔ 手机 4G | ⏳ | 待产品负责人真机跨网验证运营商 NAT 打洞与手机原生浏览器表现，结果回填至 `docs/NET_SPIKE.md`。 |

## 2. 遗留 Minor 项（不阻塞 M0，归入后续里程碑）

1. **临时诊断页按钮高度为 44 px**（`src/styles/net-spike.css:70`）：低于正式游戏 UI 的 56 px 触控标准（正式主菜单与设置已满足 ≥ 56 px）；M2 正式大厅 UI 将复用 `UI_CONFIG.minTouchTargetPx`（56 px）替代诊断页流程。
2. **`PeerJsTransport.sendFrame` 预检与发送各做一次 JSON 序列化**（`src/net/peerjs-transport.ts:316`）及 **`spike-pings.test.ts` 补 `expire()` 独立断言**：归入 M2 网络模块迭代顺带优化。
