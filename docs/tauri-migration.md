# 迁移 Electron → Tauri v2

## Context
当前 Electron 打包产物 ~200MB+（Chromium 的代价）。Tauri 使用系统 WebView，产物通常 <10MB。项目的 renderer 是纯 Web 代码（WebGL、Canvas、MediaRecorder），只有 7 个 IPC 调用点，迁移面很小。

## 风险提示
macOS 上 Tauri 使用 WKWebView（WebKit 内核），MediaRecorder 对 WebM 格式支持有限。视频导出功能可能需要改为 MP4 格式或加 fallback。迁移后需重点测试导出功能。

---

## 步骤

### 1. 安装 Rust 工具链和 Tauri CLI
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli --version "^2"
```

### 2. 初始化 Tauri 项目
在项目根目录运行 `cargo tauri init`，生成 `src-tauri/` 目录。

### 3. 配置 `src-tauri/tauri.conf.json`
- 窗口：375x885，不可缩放，透明背景
- 插件：dialog、fs
- 前端：dev server `http://localhost:5173`，dist 目录 `../dist`

### 4. 配置 `src-tauri/Cargo.toml`
添加依赖：`tauri-plugin-dialog`、`tauri-plugin-fs`、`base64`、`serde`

### 5. 编写 Rust 后端 (`src-tauri/src/lib.rs`)
3 个 Tauri command 替代 Electron IPC：
- `get_app_version` → 替代 `app:getVersion`
- `read_file_base64` → 替代 `fs:readFile`
- `write_file_base64` → 替代 `fs:writeFile`

对话框功能（openBackground、openVideo、saveVideo）改为前端直接调用 `@tauri-apps/plugin-dialog`，不需要 Rust 代码。

`app:getPath` 不再需要（Tauri dialog 返回完整路径）。

### 6. 配置权限 (`src-tauri/capabilities/default.json`)
授予 dialog 和 fs 插件权限。

### 7. 创建前端桥接 `src/tauri-api.js`（新文件）
提供与 `window.electronAPI` 完全相同的接口，内部调用 Tauri API。renderer 代码零改动。

### 8. 修改 `src/renderer.js`
仅在文件顶部添加一行：`import './tauri-api.js';`

### 9. 替换 Vite 配置
删除 3 个 Electron Forge 的 vite config，创建单一 `vite.config.mjs`（target 包含 `safari15`）。

### 10. 更新 `package.json`
- 移除所有 `@electron-forge/*`、`@electron/*`、`electron`、`electron-squirrel-startup`
- 添加 `@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`、`@tauri-apps/cli`
- 更新 scripts：`dev: vite`、`build: vite build`、`tauri: tauri`

### 11. 更新 `index.html`
CSP 添加 `ipc: http://ipc.localhost` 到 connect-src。

### 12. 更新 `.gitignore`
添加 `src-tauri/target/`、`src-tauri/gen/`、`dist/`。

### 13. 删除 Electron 文件
- `src/main.js` — Electron 主进程
- `src/preload.js` — Electron preload
- `forge.config.js` — Electron Forge 配置
- `vite.main.config.mjs`、`vite.preload.config.mjs`、`vite.renderer.config.mjs`

### 14. 兼容性修复 (`src/renderer/media-utils.js`)
在 `getExportMimeType()` 的候选列表中添加 `video/mp4` 作为 WebKit fallback。

---

## 不需要改动的文件
`src/renderer/constants.js`、`dom-elements.js`、`ui-state.js`、`video-player.js`、`webgl-compositor.js`、`file-utils.js`、`src/index.css`、`public/assets/background.png`

## 验证
1. `npm install && cargo tauri dev` 启动应用
2. 拖放视频 → 确认 WebGL 渲染正常
3. 播放/暂停/停止/循环 → 功能正常
4. 导出视频 → 重点测试 MediaRecorder 在 WKWebView 下是否工作
5. `cargo tauri build` → 确认产物大小（预期 <15MB）
