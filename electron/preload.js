// The only things app/index.html can do outside its window. Everything else stays sandboxed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blockwiseHost', {
  platform: process.platform,
  version: ipcRenderer.sendSync('app:version'),
  list: () => ipcRenderer.sendSync('lib:list'),
  isNewFolder: () => ipcRenderer.sendSync('lib:isNew'),
  folder: () => ipcRenderer.sendSync('lib:folder'),
  read: id => ipcRenderer.sendSync('lib:read', id),
  write: project => ipcRenderer.sendSync('lib:write', project),
  remove: id => ipcRenderer.sendSync('lib:remove', id),
  chooseFolder: () => ipcRenderer.invoke('lib:choose'),
  reveal: () => ipcRenderer.send('lib:reveal'),
  saveAs: (name, bytes) => ipcRenderer.invoke('file:saveAs', name, bytes),
});
