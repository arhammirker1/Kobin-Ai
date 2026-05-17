const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notifAPI', {
  click: (tab, roomId) => ipcRenderer.send('notif:click', { tab, roomId }),
  join: (url, title) => ipcRenderer.send('notif:join', { url, title }),
  dismiss: () => ipcRenderer.send('notif:dismiss'),
})