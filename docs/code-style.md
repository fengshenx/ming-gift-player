# Ming Gift Player 代码风格指南

本文档定义了 Ming Gift Player 项目的代码风格要求。

## 语言与构建

- **语言**: JavaScript (ESM)
- **运行时**: Node 22+
- **框架**: Electron + Vite (electron-forge)

## 代码格式

### ESLint + Prettier

项目使用 ESLint 和 Prettier 进行代码格式化和 linting：

```bash
# 格式化代码
npm run format

# 检查格式
npm run format:check

# Lint 检查
npm run lint

# Lint 修复
npm run lint:fix
```

### ESLint 配置 (.eslintrc.json)

```json
{
  "env": {
    "browser": true,
    "es2023": true,
    "node": true
  },
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "curly": "error",
    "no-unused-vars": "warn",
    "no-console": "off"
  }
}
```

## 代码规范

### 命名规范

- **类名**: PascalCase (如 `VideoPlayer`, `WebGLCompositor`)
- **函数**: camelCase (如 `handlePlayPause`, `renderCurrentFrame`)
- **常量**: UPPER_SNAKE_CASE (如 `DEFAULT_WIDTH`, `MAX_RETRIES`)
- **文件**: kebab-case (如 `main.js`, `renderer.js`)

### 命名示例

```javascript
// 类
class VideoPlayer { }
class WebGLCompositor { }

// 函数
function decodeBase64ToUint8Array(base64) { }
function handlePlayPause() { }

// 常量
const DEFAULT_WIDTH = 375;
const MAX_VIDEO_HEIGHT = 1080;

// 文件
// main.js, preload.js, renderer.js
```

### 模块导入

- 使用 ES Modules (`import`/`export`)
- 导入顺序：外部库 → 内部模块 → 本地文件
- 导入语句按字母排序

```javascript
// 外部库
import path from 'node:path';
import fs from 'node:fs';

// 内部模块
import { app, BrowserWindow, ipcMain } from 'electron';

// 本地文件（如果有）
// import { helper } from './utils/helper.js';
```

### 禁止的模式

- **禁止** 使用 `var`，使用 `const` 或 `let`
- **禁止** 使用 `==` / `!=`，使用 `===` / `!==`
- **禁止** 在渲染进程直接使用 Node.js 模块
- **禁止** 禁用 contextIsolation
- **禁止** 使用 `eval()` 或 `new Function()`

### 最佳实践

1. **优先使用 const**：所有不变的值使用 `const`
2. **async/await**：异步操作使用 async/await，避免回调地狱
3. **错误处理**：所有 async 函数应有 try/catch 包裹
4. **空值检查**：使用可选链 (`?.`) 和空值合并 (`??`)
5. **早返回**：优先使用 early return 减少嵌套

```javascript
// Good
async function handleLoadVideo() {
  try {
    const result = await window.electronAPI.openVideo();
    if (!result) {
      return;
    }
    // ...
  } catch (error) {
    console.error('Error loading video:', error);
    alert(`Error loading video: ${error.message}`);
  }
}

// Bad
async function handleLoadVideo() {
  const result = await window.electronAPI.openVideo();
  if (result) {
    // deeply nested code...
  }
}
```

### 注释

- 为复杂逻辑添加简洁的代码注释
- 使用英文注释
- 注释应解释 "为什么" 而非 "是什么"

```javascript
// Good: 解释原因
// Wait for Vite server to be ready in development
setTimeout(() => { ... }, 2000);

// Bad: 解释代码在做什么
// Set timeout for 2 seconds
setTimeout(() => { ... }, 2000);
```

### 代码结构

- **文件简洁**：文件应保持简洁，建议不超过 ~500-700 LOC
- **提取辅助函数**：将重复逻辑提取为独立的辅助函数，而非创建 "V2" 副本
- **模块化**：将相关功能组织到独立的模块或类中，便于维护和测试
- **代码复用**：优先复用现有函数和类，而非复制粘贴代码

## 文件结构

项目使用 electron-forge 的标准 Vite 模板结构：

```
src/
├── main.js       # Electron 主进程
├── preload.js    # 预加载脚本（IPC 桥接）
├── renderer.js  # 渲染进程（UI 逻辑）
└── index.css    # 样式文件
```

### 主进程 (main.js)

- 处理窗口创建和管理
- 定义 IPC 处理器
- 处理应用生命周期

### 预加载脚本 (preload.js)

- 使用 `contextBridge` 安全地暴露 API
- 只暴露必要的接口到渲染进程

```javascript
// Good: 使用 contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  // ...
});

// Bad: 直接暴露 ipcRenderer
window.ipcRenderer = ipcRenderer;
```

### 渲染进程 (renderer.js)

- 处理 UI 逻辑和用户交互
- 视频播放和 WebGL 渲染
- 状态管理

## Electron 安全

- 始终启用 `contextIsolation: true`
- 使用 `nodeIntegration: false`
- 验证所有 IPC 通信输入
- 遵循最小权限原则

```javascript
// 正确的 WebPreferences 配置
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
}
```

## CSS 规范

### 命名

- 使用 kebab-case 类名
- 前缀选择器避免冲突（如 `.gp-`）

```css
/* Good */
.video-player { }
.controls-container { }

/* Bad */
.videoPlayer { }
.controlsContainer { }
```

### 样式组织

1. 通用/重置样式
2. 布局样式
3. 组件样式
4. 状态样式（hover, active, disabled）

## 版本管理

- 应用版本：`package.json` 中的 `version` 字段

## 相关文档

- [Electron 官方文档](https://www.electronjs.org/docs)
- [Vite 配置](https://vitejs.dev/config/)
- [electron-forge 文档](https://www.electronforge.io/)
