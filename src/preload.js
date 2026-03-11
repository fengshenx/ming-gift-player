import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openBackground: () => ipcRenderer.invoke('dialog:openBackground'),
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  saveVideo: (defaultName) => ipcRenderer.invoke('dialog:saveVideo', defaultName),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', { data, filePath }),
});
