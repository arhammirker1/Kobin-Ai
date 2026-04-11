// electron/main.js
// ═══════════════════════════════════════════════════════════════════════════════
//  KOBIN AI — Desktop Client with Meeting Recorder
//  Captures mic (host) + system audio (participants) → Groq Whisper → Supabase
// ═══════════════════════════════════════════════════════════════════════════════

const {
  app, BrowserWindow, shell, Menu, Tray, screen,
  nativeImage, dialog, ipcMain, desktopCapturer,
  systemPreferences, Notification
} = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const isDev = require('electron-is-dev')

let mainWindow
let widgetWindow
let tray

// ── Meeting URL patterns ─────────────────────────────────────────────────────
const MEETING_URL_PATTERNS = [
  /meet\.google\.com/i,
  /zoom\.us/i,
  /teams\.microsoft\.com/i,
  /teams\.live\.com/i,
  /whereby\.com/i,
  /webex\.com/i,
]

// ── App config ───────────────────────────────────────────────────────────────
const APP_URL = 'https://founder-assistant-three.vercel.app'
const APP_NAME = 'Kobin AI'

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGGING — writes to console + file so we can debug packaged app
// ═══════════════════════════════════════════════════════════════════════════════

const LOG_DIR = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'main.log')

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  } catch (e) { /* ignore */ }
}

function log(level, ...args) {
  const timestamp = new Date().toISOString()
  const message = `[${timestamp}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
  console.log(message)
  try {
    ensureLogDir()
    fs.appendFileSync(LOG_FILE, message + '\n')
  } catch (e) { /* ignore file write errors */ }
}

const logger = {
  info: (...args) => log('INFO', ...args),
  warn: (...args) => log('WARN', ...args),
  error: (...args) => log('ERROR', ...args),
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ASSET PATH RESOLUTION — works in both dev and packaged mode
// ═══════════════════════════════════════════════════════════════════════════════

function getAssetPath(filename) {
  // In packaged app: assets are in extraResources
  // In dev: assets are in ../build-resources/
  const paths = [
    // Packaged: extraResources puts files in process.resourcesPath
    path.join(process.resourcesPath, filename),
    // Dev: relative to electron/ folder
    path.join(__dirname, '..', 'build-resources', filename),
    // Fallback: same directory as main.js
    path.join(__dirname, filename),
  ]

  for (const p of paths) {
    if (fs.existsSync(p)) {
      logger.info(`Asset found: ${filename} → ${p}`)
      return p
    }
  }

  logger.error(`Asset NOT FOUND: ${filename}. Searched:`, paths)
  return paths[0] // return first path as fallback
}

// ── Recording state ──────────────────────────────────────────────────────────
let recordingState = {
  isRecording: false,
  isPaused: false,
  startedAt: null,
  meetingTitle: '',
  meetingUrl: '',
  participantEmails: [],
  calendarEventId: '',
  durationSeconds: 0,
  hostChunks: [],
  participantChunks: [],
  timerInterval: null,
}

// ── Single instance lock ─────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  logger.info('Another instance is already running, quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    logger.info('Second instance detected, focusing main window')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ── Create main window ───────────────────────────────────────────────────────
function createWindow() {
  logger.info('Creating main window...')
  const iconPath = getAssetPath('source-icon.png')

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0D0D0C',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      partition: 'persist:kobin',
    },
  })

  mainWindow.once('ready-to-show', () => {
    logger.info('Main window ready-to-show')
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  const url = isDev ? 'http://localhost:3000' : APP_URL
  logger.info(`Loading URL: ${url}`)
  mainWindow.loadURL(url)

  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('Page finished loading')
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logger.error(`Page failed to load: ${errorCode} ${errorDescription}`)
  })

  // Open external links in system browser — detect meeting URLs
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isInternal = url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith(APP_URL)
    if (isInternal) return { action: 'allow' }

    // Detect meeting URLs → auto-show recording widget
    const isMeeting = MEETING_URL_PATTERNS.some(p => p.test(url))
    if (isMeeting) {
      logger.info(`🎙 Meeting URL detected: ${url}`)
      shell.openExternal(url)

      // Show widget after a brief delay — lookup participant emails async
      setTimeout(async () => {
        let participantEmails = []
        let meetingTitle = extractMeetingTitle(url)

        // Try to find participant emails from the calendar event
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const eventData = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                try {
                  const res = await fetch('/api/meeting-bot/lookup-event?meet_url=${encodeURIComponent(url)}');
                  if (res.ok) return await res.json();
                  return null;
                } catch(e) { return null; }
              })()
            `)
            if (eventData) {
              if (eventData.attendee_emails && eventData.attendee_emails.length > 0) {
                participantEmails = eventData.attendee_emails
                logger.info(`📧 Found ${participantEmails.length} participant emails: ${participantEmails.join(', ')}`)
              }
              if (eventData.title) meetingTitle = eventData.title
            }
          }
        } catch (e) {
          logger.warn('Could not lookup event participants:', e.message)
        }

        showRecordingWidget({
          meetingUrl: url,
          meetingTitle,
          autoStart: false,
          participantEmails,
        })
      }, 1500)
      return { action: 'deny' }
    }

    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isInternal = navigationUrl.startsWith('http://localhost') ||
      navigationUrl.startsWith(APP_URL)
    if (!isInternal) {
      event.preventDefault()
      shell.openExternal(navigationUrl)
    }
  })

  mainWindow.on('closed', () => {
    logger.info('Main window closed')
    mainWindow = null
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SYSTEM TRAY — Kobin branded with recording controls
// ═══════════════════════════════════════════════════════════════════════════════

function createTray() {
  logger.info('Creating system tray...')

  try {
    const iconPath = getAssetPath('tray-icon.png')
    logger.info(`Tray icon path: ${iconPath}`)
    logger.info(`Tray icon exists: ${fs.existsSync(iconPath)}`)

    // Read the icon file and create a nativeImage
    const icon = nativeImage.createFromPath(iconPath)
    logger.info(`Tray icon empty: ${icon.isEmpty()}, size: ${icon.getSize().width}x${icon.getSize().height}`)

    if (icon.isEmpty()) {
      logger.error('Tray icon is empty! Creating fallback icon...')
      // Create a small colored square as fallback
      const fallbackIcon = nativeImage.createFromBuffer(
        Buffer.alloc(16 * 16 * 4, 0), // transparent 16x16
        { width: 16, height: 16 }
      )
      // Draw a simple "K" colored square
      tray = new Tray(fallbackIcon)
    } else {
      // Resize for tray (16x16 on Windows, 22x22 on Linux, 16x16 or 22x22 on Mac)
      const resized = icon.resize({ width: 16, height: 16 })
      logger.info(`Resized tray icon: ${resized.getSize().width}x${resized.getSize().height}`)
      tray = new Tray(resized)
    }

    tray.setToolTip(`${APP_NAME} — Your agency's operating system`)
    updateTrayMenu()

    tray.on('click', () => {
      logger.info('Tray clicked')
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
      }
    })

    logger.info('✅ System tray created successfully')
  } catch (error) {
    logger.error('❌ Failed to create system tray:', error.message, error.stack)
  }
}

function updateTrayMenu() {
  if (!tray) {
    logger.warn('updateTrayMenu called but tray is null')
    return
  }

  const { isRecording, isPaused, meetingTitle, durationSeconds } = recordingState
  const durationStr = formatDuration(durationSeconds)

  let menuTemplate = []

  if (isRecording) {
    menuTemplate = [
      {
        label: `🔴 Recording${meetingTitle ? ': ' + meetingTitle : ''} (${durationStr})`,
        enabled: false,
      },
      { type: 'separator' },
      ...(isPaused
        ? [{
            label: '▶  Resume Recording',
            click: () => resumeRecording()
          }]
        : [{
            label: '⏸  Pause Recording',
            click: () => pauseRecording()
          }]
      ),
      {
        label: '⏹  Stop & Process',
        click: () => stopRecording()
      },
      { type: 'separator' },
      {
        label: 'Open Kobin AI',
        click: () => showMainWindow()
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]
  } else {
    menuTemplate = [
      {
        label: '🎙  Start Recording',
        click: () => {
          logger.info('Tray: Start Recording clicked')
          showRecordingWidget({ meetingTitle: 'New Recording', autoStart: false })
        }
      },
      { type: 'separator' },
      {
        label: 'Open Kobin AI',
        click: () => showMainWindow()
      },
      { type: 'separator' },
      {
        label: `Logs: ${LOG_DIR}`,
        click: () => shell.openPath(LOG_DIR)
      },
      {
        label: 'Check for Updates',
        click: () => {
          try { autoUpdater.checkForUpdates() }
          catch (e) { logger.error('Update check failed:', e.message) }
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]
  }

  try {
    const contextMenu = Menu.buildFromTemplate(menuTemplate)
    tray.setContextMenu(contextMenu)
  } catch (error) {
    logger.error('Failed to build tray menu:', error.message)
  }
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RECORDING WIDGET — Floating always-on-top mini window
// ═══════════════════════════════════════════════════════════════════════════════

function isMeetingUrl(url) {
  return MEETING_URL_PATTERNS.some(p => p.test(url))
}

function extractMeetingTitle(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('meet.google.com')) return 'Google Meet'
    if (u.hostname.includes('zoom.us')) return 'Zoom Meeting'
    if (u.hostname.includes('teams.microsoft.com') || u.hostname.includes('teams.live.com')) return 'Teams Meeting'
    if (u.hostname.includes('whereby.com')) return 'Whereby Meeting'
    if (u.hostname.includes('webex.com')) return 'Webex Meeting'
    return 'Meeting'
  } catch {
    return 'Meeting'
  }
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    logger.info('Widget window already exists, focusing')
    widgetWindow.show()
    widgetWindow.focus()
    return widgetWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize
  const widgetWidth = 420
  const widgetHeight = 90

  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: Math.round(screenWidth / 2 - widgetWidth / 2),
    y: 24,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'widget-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  widgetWindow.setAlwaysOnTop(true, 'floating', 1)
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const widgetPath = path.join(__dirname, 'recorder-widget.html')
  logger.info(`Loading widget from: ${widgetPath}`)

  if (app.isPackaged) {
    // In packaged app, widget HTML is in app.asar
    widgetWindow.loadFile(widgetPath)
  } else {
    widgetWindow.loadFile(widgetPath)
  }

  widgetWindow.on('closed', () => {
    logger.info('Widget window closed')
    widgetWindow = null
  })

  return widgetWindow
}

function showRecordingWidget(options = {}) {
  logger.info('Showing recording widget:', options)

  // Pre-populate recording state with meeting metadata
  recordingState.meetingTitle = options.meetingTitle || 'New Recording'
  recordingState.meetingUrl = options.meetingUrl || ''
  recordingState.participantEmails = options.participantEmails || []

  const w = createWidgetWindow()

  w.webContents.on('did-finish-load', () => {
    logger.info('Widget loaded, sending init')
    w.webContents.send('widget:init', {
      meetingTitle: options.meetingTitle || 'New Recording',
      meetingUrl: options.meetingUrl || '',
      autoStart: options.autoStart || false,
      participantEmails: options.participantEmails || [],
    })
  })
}

// ── Widget IPC handlers ──────────────────────────────────────────────────────

ipcMain.on('widget:start-recording', () => {
  logger.info('Widget: start-recording')
  const title = recordingState.meetingTitle || 'Meeting'
  startRecording({
    meetingTitle: title,
    meetingUrl: recordingState.meetingUrl || '',
    participantEmails: recordingState.participantEmails || [],
  })
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget:state-change', {
      state: 'recording',
      meetingTitle: title,
    })
  }
})

ipcMain.on('widget:pause-recording', () => {
  logger.info('Widget: pause-recording')
  pauseRecording()
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget:state-change', {
      state: 'paused',
      meetingTitle: recordingState.meetingTitle,
    })
  }
})

ipcMain.on('widget:resume-recording', () => {
  logger.info('Widget: resume-recording')
  resumeRecording()
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget:state-change', {
      state: 'recording',
      meetingTitle: recordingState.meetingTitle,
    })
  }
})

ipcMain.on('widget:stop-recording', async () => {
  logger.info('Widget: stop-recording')
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget:state-change', { state: 'processing' })
  }
  await stopRecording()
  // Results will be sent via recording-uploaded event
})

ipcMain.on('widget:close', () => {
  logger.info('Widget: close')
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close()
  }
})

ipcMain.on('widget:minimize', () => {
  logger.info('Widget: minimize')
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide()
  }
})

// ── Audio chunk handler — transcribe via Groq Whisper ────────────────────────

ipcMain.on('widget:audio-chunk', async (event, { base64Data, source }) => {
  if (!recordingState.isRecording) {
    logger.warn('Received audio chunk but not recording')
    return
  }

  const chunkSizeKB = Math.round((base64Data.length * 3 / 4) / 1024)
  logger.info(`📥 Received ${source} audio chunk: ${chunkSizeKB}KB`)

  try {
    // Convert base64 to Buffer
    const audioBuffer = Buffer.from(base64Data, 'base64')

    // Send to Groq Whisper via the Vercel API proxy
    const apiUrl = isDev ? 'http://localhost:3000' : APP_URL
    const formData = new FormData()

    // Create a Blob-like object for the audio
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('model', 'whisper-large-v3')
    formData.append('language', 'en')

    logger.info(`🔄 Sending to transcription API: ${apiUrl}/api/meeting-bot/transcribe`)

    const response = await fetch(`${apiUrl}/api/meeting-bot/transcribe`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Transcription failed: ${response.status} — ${errText}`)
    }

    const result = await response.json()
    const text = result.text || ''

    if (text.trim()) {
      const timestamp = new Date().toISOString()
      const chunk = { time: timestamp, text: text.trim() }

      if (source === 'host') {
        recordingState.hostChunks.push(chunk)
        logger.info(`📝 Host transcript: "${text.trim().substring(0, 80)}..."`)
      } else {
        recordingState.participantChunks.push(chunk)
        logger.info(`📝 Participant transcript: "${text.trim().substring(0, 80)}..."`)
      }
    } else {
      logger.info('🔇 Chunk transcribed but empty (silence)')
    }
  } catch (error) {
    logger.error(`❌ Transcription error: ${error.message}`)

    // Fallback: store raw audio reference if transcription fails
    const timestamp = new Date().toISOString()
    const chunk = { time: timestamp, text: `[audio chunk ${chunkSizeKB}KB — transcription failed]` }
    if (source === 'host') {
      recordingState.hostChunks.push(chunk)
    } else {
      recordingState.participantChunks.push(chunk)
    }
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
//  RECORDING CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

function startRecording(options = {}) {
  if (recordingState.isRecording) {
    logger.warn('startRecording called but already recording')
    return
  }

  logger.info('🎙 Starting recording:', options)

  recordingState = {
    isRecording: true,
    isPaused: false,
    startedAt: new Date().toISOString(),
    meetingTitle: options.meetingTitle || 'Untitled Meeting',
    meetingUrl: options.meetingUrl || '',
    participantEmails: options.participantEmails || [],
    calendarEventId: options.calendarEventId || '',
    durationSeconds: 0,
    hostChunks: [],
    participantChunks: [],
    timerInterval: null,
  }

  recordingState.timerInterval = setInterval(() => {
    if (!recordingState.isPaused) {
      recordingState.durationSeconds++
      updateTrayMenu()
      // Send duration to main window
      if (mainWindow) {
        mainWindow.webContents.send('recording-duration', {
          duration: recordingState.durationSeconds,
          isRecording: true,
          isPaused: false,
        })
      }
      // Send duration to floating widget
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.webContents.send('widget:duration', recordingState.durationSeconds)
      }
    }
  }, 1000)

  updateTrayMenu()
  logger.info(`🎙 Recording started: "${recordingState.meetingTitle}"`)

  if (mainWindow) {
    mainWindow.webContents.send('recording-state-changed', {
      isRecording: true,
      isPaused: false,
      meetingTitle: recordingState.meetingTitle,
    })
  }
}

function pauseRecording() {
  if (!recordingState.isRecording || recordingState.isPaused) return
  recordingState.isPaused = true
  updateTrayMenu()
  logger.info('⏸ Recording paused')

  if (mainWindow) {
    mainWindow.webContents.send('recording-state-changed', {
      isRecording: true,
      isPaused: true,
    })
  }
}

function resumeRecording() {
  if (!recordingState.isRecording || !recordingState.isPaused) return
  recordingState.isPaused = false
  updateTrayMenu()
  logger.info('▶ Recording resumed')

  if (mainWindow) {
    mainWindow.webContents.send('recording-state-changed', {
      isRecording: true,
      isPaused: false,
    })
  }
}

async function stopRecording() {
  if (!recordingState.isRecording) {
    logger.warn('stopRecording called but not recording')
    return
  }

  if (recordingState.timerInterval) {
    clearInterval(recordingState.timerInterval)
    recordingState.timerInterval = null
  }

  recordingState.isRecording = false
  recordingState.isPaused = false
  const endedAt = new Date().toISOString()

  logger.info(`⏹ Recording stopped after ${formatDuration(recordingState.durationSeconds)}`)
  logger.info(`   Host chunks: ${recordingState.hostChunks.length}`)
  logger.info(`   Participant chunks: ${recordingState.participantChunks.length}`)

  updateTrayMenu()

  if (mainWindow) {
    mainWindow.webContents.send('recording-state-changed', {
      isRecording: false,
      isPaused: false,
      isProcessing: true,
    })
  }

  const recordingData = {
    meeting_title: recordingState.meetingTitle,
    meeting_url: recordingState.meetingUrl,
    participant_emails: recordingState.participantEmails,
    calendar_event_id: recordingState.calendarEventId,
    host_segments: recordingState.hostChunks,
    participant_segments: recordingState.participantChunks,
    combined_transcript: buildCombinedTranscript(
      recordingState.hostChunks,
      recordingState.participantChunks
    ),
    duration_seconds: recordingState.durationSeconds,
    started_at: recordingState.startedAt,
    ended_at: endedAt,
  }

  // Get user_id — Supabase SSR stores auth in cookies, not localStorage
  let userId = null

  // Method 1: Check cached user_id file
  const userIdCacheFile = path.join(app.getPath('userData'), 'user_id.txt')
  try {
    if (fs.existsSync(userIdCacheFile)) {
      userId = fs.readFileSync(userIdCacheFile, 'utf-8').trim()
      if (userId) logger.info(`Got cached user_id: ${userId}`)
    }
  } catch (e) { /* ignore */ }

  // Method 2: Extract from Supabase auth cookies
  if (!userId) {
    try {
      const { session: electronSession } = require('electron')
      const allCookies = await electronSession.defaultSession.cookies.get({ url: APP_URL })

      // Find Supabase auth cookies (chunked: sb-xxx-auth-token.0, sb-xxx-auth-token.1, etc.)
      const sbAuthCookies = allCookies
        .filter(c => c.name.includes('sb-') && c.name.includes('auth-token'))
        .sort((a, b) => a.name.localeCompare(b.name))

      logger.info(`Found ${sbAuthCookies.length} Supabase auth cookies: ${sbAuthCookies.map(c => c.name).join(', ')}`)

      if (sbAuthCookies.length > 0) {
        // Combine chunked cookie values
        const combined = sbAuthCookies.map(c => c.value).join('')
        const decoded = decodeURIComponent(combined)

        try {
          // Try parsing as JSON — contains { access_token, user: { id } }
          const authData = JSON.parse(decoded)
          userId = authData?.user?.id || authData?.session?.user?.id || null

          if (!userId && authData?.access_token) {
            // Decode JWT to get sub claim
            const payload = authData.access_token.split('.')[1]
            const jwtData = JSON.parse(Buffer.from(payload, 'base64').toString())
            userId = jwtData.sub || null
            logger.info(`Extracted user_id from JWT: ${userId}`)
          }
        } catch (parseErr) {
          // Maybe it's a base64-encoded JWT directly
          try {
            const payload = combined.split('.')[1]
            if (payload) {
              const jwtData = JSON.parse(Buffer.from(payload, 'base64').toString())
              userId = jwtData.sub || null
              logger.info(`Extracted user_id from raw JWT: ${userId}`)
            }
          } catch (jwtErr) {
            logger.warn('Could not parse auth cookies:', parseErr.message)
          }
        }
      }
    } catch (e) {
      logger.warn('Cookie extraction failed:', e.message)
    }
  }

  // Method 3: Ask the web app's fetch API for the current user
  if (!userId && mainWindow && !mainWindow.isDestroyed()) {
    try {
      userId = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
              const data = await res.json();
              return data?.user?.id || data?.id || null;
            }
            return null;
          } catch(e) { return null; }
        })()
      `)
      if (userId) logger.info(`Got user_id from /api/auth/me: ${userId}`)
    } catch (e) { /* ignore */ }
  }

  // Cache user_id for future use
  if (userId) {
    recordingData.user_id = userId
    try {
      fs.writeFileSync(userIdCacheFile, userId, 'utf-8')
      logger.info(`✅ user_id resolved: ${userId} (cached)`)
    } catch (e) { /* ignore */ }
  } else {
    logger.warn('⚠ Could not resolve user_id — server fallback will be used')
  }

  recordingState.hostChunks = []
  recordingState.participantChunks = []

  // Get cookies from the main window for auth
  let cookieHeader = ''
  try {
    const { session: electronSession } = require('electron')
    const cookies = await electronSession.defaultSession.cookies.get({ url: APP_URL })
    cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  } catch (e) {
    logger.warn('Could not get session cookies:', e.message)
  }

  try {
    const apiUrl = isDev ? 'http://localhost:3000' : APP_URL
    logger.info(`Uploading recording to: ${apiUrl}/api/meeting-bot/upload`)
    logger.info(`  user_id: ${userId || 'not available'}`)
    logger.info(`  host chunks: ${recordingData.host_segments.length}`)
    logger.info(`  participant chunks: ${recordingData.participant_segments.length}`)
    logger.info(`  transcript length: ${recordingData.combined_transcript.length} chars`)

    const headers = { 'Content-Type': 'application/json' }
    if (cookieHeader) headers['Cookie'] = cookieHeader

    const response = await fetch(`${apiUrl}/api/meeting-bot/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify(recordingData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Upload failed: ${response.status} ${response.statusText} — ${errorText}`)
    }

    const result = await response.json()
    logger.info('✅ Recording uploaded successfully:', result)

    if (mainWindow) {
      mainWindow.webContents.send('recording-uploaded', {
        success: true,
        recordingId: result.recording_id,
      })
    }

    // Notify widget with results
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('widget:results', {
        tasks: result.tasks_created || 0,
        notes: result.notes_created || 0,
        crm: result.crm_updates || 0,
      })
    }
  } catch (error) {
    logger.error('❌ Failed to upload recording:', error.message)
    if (mainWindow) {
      mainWindow.webContents.send('recording-uploaded', {
        success: false,
        error: error.message,
      })
    }
    // Show error in widget
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('widget:results', {
        tasks: 0, notes: 0, crm: 0,
        error: error.message,
      })
    }
  }
}

function buildCombinedTranscript(hostSegments, participantSegments) {
  const all = [
    ...hostSegments.map(s => ({ ...s, speaker: 'You (Host)' })),
    ...participantSegments.map(s => ({ ...s, speaker: 'Participant' })),
  ].sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  return all.map(s => `[${s.time || '??:??'}] ${s.speaker}: ${s.text}`).join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  APP MENU
// ═══════════════════════════════════════════════════════════════════════════════

function createMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Logs',
          click: () => shell.openPath(LOG_DIR)
        },
        {
          label: 'Check for Updates',
          click: () => {
            try { autoUpdater.checkForUpdates() }
            catch (e) { logger.error('Update check failed:', e.message) }
          }
        },
        { label: 'Open in Browser', click: () => shell.openExternal(APP_URL) }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTO UPDATER
// ═══════════════════════════════════════════════════════════════════════════════

function setupAutoUpdater() {
  if (isDev) {
    logger.info('Dev mode — skipping auto updater')
    return
  }

  // Skip if no update config exists (no update server configured yet)
  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml')
  if (!fs.existsSync(updateConfigPath)) {
    logger.info('No app-update.yml found — skipping auto updater (no update server configured)')
    return
  }

  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      logger.info('Update available:', info.version)
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Available',
          message: `Version ${info.version} is available. Downloading now...`,
          buttons: ['OK']
        })
      }
    })

    autoUpdater.on('update-downloaded', () => {
      logger.info('Update downloaded')
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Ready',
          message: 'Update downloaded. It will be installed when you restart Kobin AI.',
          buttons: ['Restart Now', 'Later']
        }).then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall()
        })
      }
    })

    autoUpdater.on('error', (err) => {
      logger.error('Auto updater error:', err.message)
    })

    autoUpdater.checkForUpdates()
    setInterval(() => {
      try { autoUpdater.checkForUpdates() }
      catch (e) { logger.error('Periodic update check failed:', e.message) }
    }, 4 * 60 * 60 * 1000)
  } catch (error) {
    logger.error('Auto updater setup failed:', error.message)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('check-for-updates', () => {
  try { autoUpdater.checkForUpdates() }
  catch (e) { logger.error('Update check failed:', e.message) }
})

// ── Native desktop notifications ─────────────────────────────────────────────
// Custom branded notification windows
const notifWindows = []

function showBrandedNotification(options) {
  const {
    title = '',
    body = '',
    tab = 'Inbox',
    roomId = null,
    type = 'default',
    meetingLink = null,
    meetingTitle = '',
    count = 0,
    roomType = 'group',
    priority = '',
    priorityEmoji = '',
  } = options

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const NOTIF_W = 380
  const MARGIN = 16

  const isMeeting = type === 'meeting' || title.toLowerCase().includes('meeting')
  const isTask    = type === 'task'
  const isInbox   = type === 'inbox'
  const isDM      = roomType === 'direct'
  const isBatched = count > 1

  // Height depends on content
  const hasJoinBtn = isMeeting && meetingLink
  let NOTIF_H = isBatched ? 120 : 110
  if (hasJoinBtn) NOTIF_H += 50

  const activeCount = notifWindows.filter(w => !w.isDestroyed()).length
  const yOffset = activeCount * (NOTIF_H + 8)

  const win = new BrowserWindow({
    width: NOTIF_W,
    height: NOTIF_H,
    x: sw - NOTIF_W - MARGIN,
    y: sh - NOTIF_H - MARGIN - yOffset,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'notif-preload.js'),
    },
  })

  win.setAlwaysOnTop(true, 'floating', 2)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // ── Visual config per type ──────────────────────────────────────────────
  let accent    = '#4C3FD4'
  let iconColor = '#4C3FD4'
  let iconBg    = 'rgba(76,63,212,.12)'
  let appLabel  = 'Kobin AI'
  let iconSVG   = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'

  if (isMeeting) {
    const isUrgent = title.toLowerCase().includes('now')
    accent    = isUrgent ? '#E24B4A' : '#EF9F27'
    iconColor = isUrgent ? '#E24B4A' : '#BA7517'
    iconBg    = isUrgent ? 'rgba(226,75,74,.12)' : 'rgba(239,159,39,.12)'
    appLabel  = 'Calendar'
    iconSVG   = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
  } else if (isTask) {
    const isUrgent = priority === 'urgent'
    const isHigh   = priority === 'high'
    accent    = isUrgent ? '#E24B4A' : isHigh ? '#EF9F27' : '#4C3FD4'
    iconColor = accent
    iconBg    = isUrgent ? 'rgba(226,75,74,.12)' : isHigh ? 'rgba(239,159,39,.12)' : 'rgba(76,63,212,.12)'
    appLabel  = 'Tasks'
    iconSVG   = '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
  } else if (isInbox) {
    accent    = '#4C3FD4'
    iconColor = '#4C3FD4'
    iconBg    = 'rgba(76,63,212,.12)'
    appLabel  = isDM ? 'Inbox · Direct Message' : 'Inbox · Channel'
    iconSVG   = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  }

  // ── Avatar initials (for DMs) ───────────────────────────────────────────
  const getInitials = (name) => {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0][0] || '?').toUpperCase()
  }

  const showAvatar = isDM && isInbox
  const avatarInitials = showAvatar ? getInitials(title) : ''

  // ── Badge for batched messages ──────────────────────────────────────────
  const badgeHTML = isBatched
    ? `<div style="min-width:20px;height:20px;background:${accent};color:#fff;font-size:10px;font-weight:600;border-radius:10px;padding:0 5px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${count > 99 ? '99+' : count}</div>`
    : ''

  // ── Icon or avatar ──────────────────────────────────────────────────────
  const iconHTML = showAvatar
    ? `<div style="width:32px;height:32px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:600;color:${iconColor}">${avatarInitials}</div>`
    : `<div style="width:32px;height:32px;border-radius:9px;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSVG}</svg></div>`

  // ── Join button ─────────────────────────────────────────────────────────
  const joinBtnHTML = hasJoinBtn ? `
    <div style="display:flex;gap:6px;margin-top:8px">
      <button onclick="handleJoin()" style="flex:1;padding:6px 0;font-size:11px;font-weight:500;border-radius:7px;border:none;cursor:pointer;background:#F0EDE6;color:#0E0E0D;font-family:Inter,sans-serif">Join meeting</button>
      <button onclick="handleDismiss()" style="flex:1;padding:6px 0;font-size:11px;font-weight:500;border-radius:7px;border:none;cursor:pointer;background:rgba(240,237,230,.08);color:#F0EDE6;font-family:Inter,sans-serif">Dismiss</button>
    </div>` : ''

  const cleanTitle = title.replace(/[🔴📅📋🟠]/gu, '').trim()

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Inter, -apple-system, sans-serif; background: transparent; overflow: hidden; cursor: pointer; -webkit-user-select: none; }
  .notif {
    background: #1A1A18;
    border: 1px solid rgba(240,237,230,.08);
    border-radius: 14px;
    overflow: hidden;
    animation: slideIn .3s cubic-bezier(.16,1,.3,1);
    transition: transform .15s ease, opacity .15s ease;
    height: 100%;
  }
  .notif:hover { transform: translateX(-2px); background: #202020; }
  @keyframes slideIn { from { opacity:0; transform:translateY(-8px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
  .accent { height: 2px; background: ${accent}; }
  .body { padding: 11px 13px 12px; display:flex; flex-direction:column; }
  .top { display:flex; align-items:flex-start; gap:10px; }
  .content { flex:1; min-width:0; }
  .app-label { font-size:10px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:#6B6860; margin-bottom:3px; }
  .notif-title { font-size:13px; font-weight:600; color:#F0EDE6; line-height:1.3; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .body-text { font-size:12px; color:#888580; line-height:1.45; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .right-col { display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; }
  .time { font-size:10px; color:#6B6860; white-space:nowrap; }
</style>
</head>
<body>
<div class="notif" id="notif" onclick="handleClick()">
  <div class="accent"></div>
  <div class="body">
    <div class="top">
      ${iconHTML}
      <div class="content">
        <div class="app-label">${appLabel}</div>
        <div class="notif-title">${cleanTitle}</div>
        <div class="body-text">${body}</div>
      </div>
      <div class="right-col">
        <div class="time">now</div>
        ${badgeHTML}
      </div>
    </div>
    ${joinBtnHTML}
  </div>
</div>
<script>
  function handleClick() {
    if (window.notifAPI) window.notifAPI.click('${tab}', '${roomId || ''}')
    handleDismiss()
  }
  function handleJoin() {
    if (window.notifAPI) window.notifAPI.join('${meetingLink || ''}', '${(meetingTitle || title).replace(/'/g, "\\'")}')
    handleDismiss()
  }
  function handleDismiss() {
    const el = document.getElementById('notif')
    el.style.transition = 'all .25s ease'
    el.style.opacity = '0'
    el.style.transform = 'translateX(16px) scale(.97)'
    setTimeout(() => { if (window.notifAPI) window.notifAPI.dismiss() }, 250)
  }
  setTimeout(() => handleDismiss(), ${isMeeting ? 15000 : 6000})
<\/script>
</body>
</html>`

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

  ipcMain.once('notif:click', (_, { tab: clickTab, roomId: clickRoom }) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('notification-click', { roomId: clickRoom || null, tab: clickTab || 'Inbox' })
    }
    if (!win.isDestroyed()) win.close()
  })

  ipcMain.once('notif:join', async (_, { url: meetUrl, title: meetTitleArg }) => {
    if (!win.isDestroyed()) win.close()
    if (!meetUrl) return
    shell.openExternal(meetUrl)

    setTimeout(async () => {
      let participantEmails = []
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const eventData = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              try {
                const res = await fetch('/api/meeting-bot/lookup-event?meet_url=' + encodeURIComponent('${meetUrl}'));
                if (res.ok) return await res.json();
                return null;
              } catch(e) { return null; }
            })()
          `)
          if (eventData?.attendee_emails?.length > 0) {
            participantEmails = eventData.attendee_emails
          }
        }
      } catch (e) {
        logger.warn('Could not lookup participants from notif join:', e.message)
      }
      showRecordingWidget({
        meetingUrl: meetUrl,
        meetingTitle: meetTitleArg || 'Meeting',
        autoStart: false,
        participantEmails,
      })
    }, 1500)
  })

  ipcMain.once('notif:dismiss', () => {
    if (!win.isDestroyed()) win.close()
  })

  notifWindows.push(win)
  win.on('closed', () => {
    const idx = notifWindows.indexOf(win)
    if (idx > -1) notifWindows.splice(idx, 1)
  })

  logger.info(`[Notif] Shown: "${cleanTitle}" count=${count}`)
  return { success: true }
}

ipcMain.handle('show-notification', (event, options) => {
  try {
    return showBrandedNotification(options)
  } catch (err) {
    logger.error('[Notif] Failed to show notification:', err.message)
    return { success: false }
  }
})

ipcMain.handle('start-recording', (_, options) => {
  logger.info('IPC: start-recording', options)
  startRecording(options)
  return { success: true }
})

ipcMain.handle('stop-recording', async () => {
  logger.info('IPC: stop-recording')
  await stopRecording()
  return { success: true }
})

ipcMain.handle('pause-recording', () => {
  logger.info('IPC: pause-recording')
  pauseRecording()
  return { success: true }
})

ipcMain.handle('resume-recording', () => {
  logger.info('IPC: resume-recording')
  resumeRecording()
  return { success: true }
})

ipcMain.handle('get-recording-state', () => ({
  isRecording: recordingState.isRecording,
  isPaused: recordingState.isPaused,
  duration: recordingState.durationSeconds,
  meetingTitle: recordingState.meetingTitle,
}))

ipcMain.handle('add-transcript-chunk', (_, chunk) => {
  if (!recordingState.isRecording || recordingState.isPaused) return

  const { type, time, text } = chunk
  const segment = { time, text }

  if (type === 'host') {
    recordingState.hostChunks.push(segment)
  } else {
    recordingState.participantChunks.push(segment)
  }

  logger.info(`Chunk added [${type}]: [${time}] ${text.slice(0, 60)}...`)
})

ipcMain.handle('get-audio-sources', async () => {
  try {
    logger.info('IPC: get-audio-sources')
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      fetchWindowIcons: false,
    })
    logger.info(`Found ${sources.length} audio sources`)
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
    }))
  } catch (error) {
    logger.error('Failed to get audio sources:', error.message)
    return []
  }
})

ipcMain.handle('check-mic-permission', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    logger.info(`Mic permission status: ${status}`)
    if (status !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      logger.info(`Mic permission granted: ${granted}`)
      return granted
    }
    return true
  }
  return true
})

// ═══════════════════════════════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  logger.info('═══════════════════════════════════════════════════════')
  logger.info(`${APP_NAME} starting...`)
  logger.info(`Version: ${app.getVersion()}`)
  logger.info(`Platform: ${process.platform} ${process.arch}`)
  logger.info(`Electron: ${process.versions.electron}`)
  logger.info(`Packaged: ${app.isPackaged}`)
  logger.info(`isDev: ${isDev}`)
  logger.info(`App path: ${app.getAppPath()}`)
  logger.info(`User data: ${app.getPath('userData')}`)
  logger.info(`Resources: ${process.resourcesPath}`)
  logger.info(`Log file: ${LOG_FILE}`)
  logger.info('═══════════════════════════════════════════════════════')

  // Auto-grant media permissions (mic, camera) for all windows
  const { session } = require('electron')
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications']
    if (allowedPermissions.includes(permission)) {
      logger.info(`✅ Auto-granted permission: ${permission}`)
      callback(true)
    } else {
      logger.warn(`❌ Denied permission: ${permission}`)
      callback(false)
    }
  })

  // Also handle permission checks (Chromium 97+)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications']
    return allowedPermissions.includes(permission)
  })

  createWindow()
  createMenu()
  createTray()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.info('All windows closed')
  if (process.platform !== 'darwin') {
    // Don't quit on Windows — keep running in tray
    // Only quit if tray is also gone
  }
})

app.on('before-quit', () => {
  logger.info('App quitting...')
  if (recordingState.isRecording) {
    stopRecording()
  }
})

// Handle certificate errors gracefully in dev
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error.message, error.stack)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', String(reason))
})