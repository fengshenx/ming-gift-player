import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 375,
    height: 885, // 815 (background) + 70 (controls)
    resizable: false,
    useContentSize: true,
    frame: false, // Cleaner without title bar
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    backgroundColor: '#00000000',
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    // Wait a bit for Vite server to be ready
    setTimeout(() => {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL).catch(err => {
        console.error('Failed to load URL:', err);
      });
    }, 2000);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools in development.
  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

// IPC Handlers

// Open file dialog for video selection
ipcMain.handle('dialog:openVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(filePath);

  return {
    name: path.basename(filePath),
    data: fileBuffer.toString('base64')
  };
});

// Open file dialog for background image
ipcMain.handle('dialog:openBackground', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Background Image',
    filters: [
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(filePath);

  return {
    name: path.basename(filePath),
    data: fileBuffer.toString('base64')
  };
});

// Save exported video
ipcMain.handle('dialog:saveVideo', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Video',
    defaultPath: defaultName || 'output.mp4',
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] }
    ]
  });

  return result.canceled ? null : result.filePath;
});

// Write file to disk
ipcMain.handle('fs:writeFile', async (event, { filePath, data }) => {
  try {
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read file as base64
ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.toString('base64') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ffmpeg:readAsset', async (event, fileName) => {
  const candidates = [
    path.join(app.getAppPath(), 'public', 'ffmpeg', fileName),
    path.join(process.cwd(), 'public', 'ffmpeg', fileName),
  ];

  for (const candidate of candidates) {
    try {
      const buffer = fs.readFileSync(candidate);
      return { success: true, data: buffer.toString('base64') };
    } catch (error) {
      continue;
    }
  }

  return {
    success: false,
    error: `FFmpeg asset not found: ${fileName}. Tried: ${candidates.join(', ')}`
  };
});

// Get user data path for FFmpeg
ipcMain.handle('app:getPath', async (event, name) => {
  return app.getPath(name);
});

// Get app version
ipcMain.handle('app:getVersion', async () => {
  return app.getVersion();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
