import fs from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';

import { APP_HEIGHT, APP_WIDTH } from './renderer/constants.js';

const BACKGROUND_COLOR = '#00000000';
const DEV_SERVER_WAIT_MS = 2000;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

if (started) {
  app.quit();
}

let mainWindow = null;

function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window is not available.');
  }

  return mainWindow;
}

function isDevelopment() {
  return process.env.NODE_ENV === 'development' || Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: BACKGROUND_COLOR,
    height: APP_HEIGHT,
    resizable: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    width: APP_WIDTH,
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    // Give the Vite dev server a short window to finish booting.
    setTimeout(() => {
      mainWindow?.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL).catch((error) => {
        console.error('Failed to load renderer URL:', error);
      });
    }, DEV_SERVER_WAIT_MS);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).catch((error) => {
      console.error('Failed to load renderer file:', error);
    });
  }

  if (isDevelopment()) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function getFileDialogOptions(title, extensions) {
  return {
    filters: [{ extensions, name: title }],
    properties: ['openFile'],
    title,
  };
}

async function openFileAsBase64(title, extensions) {
  const result = await dialog.showOpenDialog(getMainWindow(), getFileDialogOptions(title, extensions));

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const [filePath] = result.filePaths;
  const fileBuffer = await fs.readFile(filePath);

  return {
    data: fileBuffer.toString('base64'),
    name: path.basename(filePath),
  };
}

function validateString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${fieldName}.`);
  }
}

function validateWriteRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid write request.');
  }

  validateString(payload.filePath, 'file path');
  validateString(payload.data, 'file data');
}

function registerIpcHandlers() {
  ipcMain.handle('app:getPath', async (_event, pathName) => {
    validateString(pathName, 'path name');
    return app.getPath(pathName);
  });

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('dialog:openBackground', async () => {
    return openFileAsBase64('选择背景图片', IMAGE_EXTENSIONS);
  });

  ipcMain.handle('dialog:openVideo', async () => {
    return openFileAsBase64('选择视频', VIDEO_EXTENSIONS);
  });

  ipcMain.handle('dialog:saveVideo', async (_event, defaultName) => {
    const defaultPath = typeof defaultName === 'string' && defaultName.trim() ? defaultName : 'output.webm';
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath,
      filters: [{ extensions: ['webm'], name: 'WebM 视频' }],
      title: '保存视频',
    });

    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      validateString(filePath, 'file path');
      const buffer = await fs.readFile(filePath);
      return { data: buffer.toString('base64'), success: true };
    } catch (error) {
      return { error: error.message, success: false };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, payload) => {
    try {
      validateWriteRequest(payload);
      const buffer = Buffer.from(payload.data, 'base64');
      await fs.writeFile(payload.filePath, buffer);
      return { success: true };
    } catch (error) {
      return { error: error.message, success: false };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
