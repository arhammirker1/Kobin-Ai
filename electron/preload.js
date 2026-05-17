// electron/preload.js
// ═══════════════════════════════════════════════════════════════════════════════
//  KOBIN AI — Preload script
//  Exposes secure IPC bridge between Electron main and Next.js renderer
// ═══════════════════════════════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // ── Platform info ──────────────────────────────────────────────────────────
  platform: process.platform,
  isDesktop: true,

  // ── App controls ───────────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // ── Native notifications ────────────────────────────────────────────────────
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  onNotificationClick: (cb) => {
    ipcRenderer.on('notification-click', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('notification-click')
  },

  // ── Recording controls ─────────────────────────────────────────────────────
  startRecording: (options) => ipcRenderer.invoke('start-recording', options),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  pauseRecording: () => ipcRenderer.invoke('pause-recording'),
  resumeRecording: () => ipcRenderer.invoke('resume-recording'),
  getRecordingState: () => ipcRenderer.invoke('get-recording-state'),

  // ── Audio transcript chunks ────────────────────────────────────────────────
  // Send transcribed text chunks (from Groq Whisper) to main process
  addTranscriptChunk: (chunk) => ipcRenderer.invoke('add-transcript-chunk', chunk),

  // ── Audio device access ────────────────────────────────────────────────────
  getAudioSources: () => ipcRenderer.invoke('get-audio-sources'),
  checkMicPermission: () => ipcRenderer.invoke('check-mic-permission'),

  // ── Event listeners (main → renderer) ──────────────────────────────────────
  onRecordingStateChanged: (callback) => {
    ipcRenderer.on('recording-state-changed', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('recording-state-changed')
  },
  onRecordingDuration: (callback) => {
    ipcRenderer.on('recording-duration', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('recording-duration')
  },
  onRecordingUploaded: (callback) => {
    ipcRenderer.on('recording-uploaded', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('recording-uploaded')
  },
  onShowRecordingDialog: (callback) => {
    ipcRenderer.on('show-recording-dialog', () => callback())
    return () => ipcRenderer.removeAllListeners('show-recording-dialog')
  },
})