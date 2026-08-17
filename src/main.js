import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createHarnessController } from './backend.js'

const sourceDir = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.join(sourceDir, 'renderer')
const appRoot = app.getAppPath()
const iconPath = path.join(appRoot, 'DSH-logo.png')
const controller = createHarnessController()

let mainWindow = null
let quitting = false

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'DSH GUI',
    icon: iconPath,
    backgroundColor: '#101114',
    show: false,
    webPreferences: {
      preload: path.join(sourceDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  await mainWindow.loadFile(path.join(rendererDir, 'loading.html'))

  try {
    const result = await controller.start()
    await mainWindow.loadURL(result.url)
  } catch (error) {
    await showStartupError(error)
  }
}

async function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error)
  await mainWindow?.loadFile(path.join(rendererDir, 'error.html'), {
    query: {
      message,
      harnessRoot: controller.config.harnessRoot,
      logsDir: controller.config.logsDir,
    },
  })
}

app.whenReady().then(createMainWindow)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', (event) => {
  if (quitting) return

  event.preventDefault()
  quitting = true

  controller.stop()
    .catch((error) => {
      console.error('Failed to stop DeepSeek Harness child process:', error)
    })
    .finally(() => {
      app.quit()
    })
})
