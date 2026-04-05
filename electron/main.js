// electron/main.js
const { app, BrowserWindow, shell, Menu, Tray, nativeImage, dialog, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const isDev = require('electron-is-dev')

let mainWindow
let tray

// ── App config ───────────────────────────────────────────────────────────────
const APP_URL = 'https://founder-assistant-three.vercel.app' // <-- replace with your URL
const APP_NAME = 'Kobin Ai'

// ── Single instance lock ─────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ── Create main window ───────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, '../build-resources/icon.png')

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#1C1C1A',
    icon: iconPath,
    show: false, // show after ready-to-show for no flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Allow the app to work with cookies/auth
      partition: 'persist:commandcenter',
    },
  })

  // Show window when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  // Load the app
  const url = isDev ? 'http://localhost:3000' : APP_URL
  mainWindow.loadURL(url)

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isInternal = url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith(APP_URL)
    if (isInternal) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle navigation
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isInternal = navigationUrl.startsWith('http://localhost') ||
      navigationUrl.startsWith(APP_URL)
    if (!isInternal) {
      event.preventDefault()
      shell.openExternal(navigationUrl)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── System tray ──────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../build-resources/tray-icon.png')
  tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Command Center',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdates()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])

  tray.setToolTip(APP_NAME)
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    }
  })
}

// ── App menu ─────────────────────────────────────────────────────────────────
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
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => autoUpdater.checkForUpdates()
        },
        {
          label: 'Open in Browser',
          click: () => shell.openExternal(APP_URL)
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Auto updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (isDev) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Downloading now...`,
      buttons: ['OK']
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. It will be installed when you restart Command Center.',
      buttons: ['Restart Now', 'Later']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto updater error:', err)
  })

  // Check for updates every 4 hours
  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates())

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createMenu()
  createTray()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On Mac, keep app running in tray
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle certificate errors gracefully
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})