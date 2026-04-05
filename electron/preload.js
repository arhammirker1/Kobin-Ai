// electron/preload.js
const { contextBridge } = require('electron')

// Expose safe APIs to the renderer if needed in the future
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isDesktop: true,
})