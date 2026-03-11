const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog APIs
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  openBackground: () => ipcRenderer.invoke('dialog:openBackground'),
  saveVideo: (defaultName) => ipcRenderer.invoke('dialog:saveVideo', defaultName),

  // File system APIs
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', { filePath, data }),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFFmpegAsset: (fileName) => ipcRenderer.invoke('ffmpeg:readAsset', fileName),

  // App APIs
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
});
