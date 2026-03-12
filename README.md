# Gift Player

本地礼物特效测试工具。用于预览和导出透明背景的礼物视频。

## 功能

- 加载本地视频文件（支持 mp4, mov, avi, mkv, webm）
- 透明背景合成（礼物视频与背景图叠加）
- 导出 WebM 格式视频
- 播放控制（播放、暂停、停止、循环）
- 窗口可调整大小，播放区域保持比例

## 技术架构

### Electron + Vite

使用 [Electron Forge](https://www.electronforge.io/) + [Vite](https://vitejs.dev/) 构建。

```
src/
├── main.js          # Electron 主进程，创建窗口、处理 IPC
├── preload.js       # 预加载脚本，安全暴露 API 给渲染进程
├── renderer.js      # 渲染进程入口，事件处理、状态管理
├── index.css        # 样式
├── index.html       # HTML 模板
└── renderer/
    ├── constants.js      # 常量定义（画布尺寸、控制条高度）
    ├── dom-elements.js   # DOM 元素引用
    ├── video-player.js   # Video 元素封装
    ├── webgl-compositor.js # WebGL 合成器
    ├── media-utils.js    # 媒体处理工具（导出、画布）
    ├── file-utils.js     # 文件处理工具（Base64 编解码）
    └── ui-state.js       # UI 状态管理
```

### 视频合成原理

礼物视频为 packed 格式：左右两半分别为 Alpha 通道和颜色通道。WebGL shader 从中将两者分离并合成透明背景：

1. 左侧 50% 提取灰度值作为 Alpha 通道
2. 右侧 50% 提取 RGB 作为颜色
3. 与背景图 alpha 混合后输出

## 运行

```bash
# 安装依赖
npm install

# 启动开发模式
npm start
```

## 打包

```bash
# 打包为可执行文件（输出到 out/ 目录）
npm run package

# 打包为安装包（输出到 out/make/ 目录）
npm run make
```

支持的平台：
- Windows: Squirrel 安装包 (.exe)
- macOS: ZIP
- Linux: DEB, RPM
