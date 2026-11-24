# Block Blitz · 方块闪击

浏览器里点开就能玩的低门槛 3D 第一人称射击。好友之间发个房间码即可 P2P 对战，PC 和手机都能玩。

- 🎮 在线试玩：https://daoguang1012.github.io/block-blitz/ （开发中）
- 🛠 技术栈：three.js · TypeScript · Vite · PeerJS（WebRTC）· GitHub Pages

## 文档
- [游戏设计文档](docs/GAME_DESIGN.md)
- [联机协议](docs/PROTOCOL.md)
- [开发进度](docs/PROGRESS.md)
- [AI 团队调度手册](docs/ORCHESTRATION.md)
- [AI 协作规则](AGENTS.md)

## 本地开发
```bash
npm ci
npm run dev
```
同一台电脑开两个标签页并在地址后加 `?net=local` 即可本地测试联机。

## 许可
代码：MIT。素材许可见 [CREDITS.md](CREDITS.md)。
