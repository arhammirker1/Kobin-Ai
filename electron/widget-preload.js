// electron/widget-preload.js
// Preload for the floating recording widget window.
// Exposes widget control API + audio chunk transfer + desktop sources to main process.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('widgetAPI', {
  // Commands to main
  startRecording:  () => ipcRenderer.send('widget:start-recording'),
  pauseRecording:  () => ipcRenderer.send('widget:pause-recording'),
  resumeRecording: () => ipcRenderer.send('widget:resume-recording'),
  stopRecording:   () => ipcRenderer.send('widget:stop-recording'),
  closeWidget:     () => ipcRenderer.send('widget:close'),
  minimizeWidget:  () => ipcRenderer.send('widget:minimize'),

  // Audio chunk transfer — sends base64 audio blob to main for transcription
  sendAudioChunk: (base64Data, source) => {
    ipcRenderer.send('widget:audio-chunk', { base64Data, source })
  },

  // Get desktop audio sources for system audio capture
  getDesktopSources: () => ipcRenderer.invoke('get-audio-sources'),

  // Events from main
  onStateChange: (cb) => ipcRenderer.on('widget:state-change', (_, data) => cb(data)),
  onDuration:    (cb) => ipcRenderer.on('widget:duration', (_, seconds) => cb(seconds)),
  onResults:     (cb) => ipcRenderer.on('widget:results', (_, results) => cb(results)),
  onInit:        (cb) => ipcRenderer.on('widget:init', (_, data) => cb(data)),
})
