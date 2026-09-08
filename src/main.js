import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createHarnessController, resolveHarnessConfig } from './backend.js'
import { loadConfig, pickConfigFields, saveConfig } from './config-store.js'
import { createRuntimeStatus, diagnosticsFor, publicRuntimeStatus } from './runtime-state.js'

const hasSingleInstanceLock = app.requestSingleInstanceLock()
const sourceDir = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.join(sourceDir, 'renderer')
const appRoot = app.getAppPath()
const iconPath = path.join(appRoot, 'DSH-logo.png')
const trayIconPath = path.join(appRoot, 'DSH-logo.ico')

let mainWindow = null
let tray = null
let controller = null
let config = null
let backendConfig = null
let configPath = null
let runtimeState = null
let quitting = false

function showMainWindow() {
  if (mainWindow === null) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function configureRuntime() {
  configPath = path.join(app.getPath('userData'), 'config.json')
  config = loadConfig(configPath)
  saveConfig(configPath, config)
  backendConfig = resolveHarnessConfig({
    DSH_GUI_HARNESS_ROOT: config.harnessRoot,
    DSH_GUI_HARNESS_HOME: config.harnessHome,
    DSH_GUI_NODE: config.nodeCommand,
    DSH_GUI_HOST: config.host,
    DSH_GUI_PORT: String(config.port),
    DSH_GUI_LAN_ACCESS: String(config.lanAccess),
  })
  controller = createHarnessController({
    config: backendConfig,
    allowStart: config.autoStart,
  })
  runtimeState = createRuntimeStatus(backendConfig)
}

function publishStatus() {
  mainWindow?.webContents.send('dsh:status', publicRuntimeStatus(runtimeState))
}

function updateStatus(patch) {
  runtimeState = { ...runtimeState, ...patch }
  publishStatus()
}

async function startHarness() {
  showMainWindow()
  await mainWindow?.loadFile(path.join(rendererDir, 'loading.html'))
  updateStatus({
    phase: 'checking',
    message: '正在检查 Harness、Node 和端口状态。',
    error: '',
  })

  try {
    updateStatus({
      phase: 'starting',
      message: backendConfig.lanAccess
        ? '正在启动局域网访问模式，请稍候。'
        : '正在启动或复用本机 Harness。',
    })
    const result = await controller.start()
    updateStatus({
      phase: 'ready',
      message: result.reusedExisting ? '已复用正在运行的 Harness。' : 'Harness 已启动。',
      accessUrl: result.url,
      reusedExisting: result.reusedExisting,
      pid: result.pid,
      localUrl: backendConfig.url,
      lanUrls: getLanUrls(backendConfig),
      restartRequired: false,
      error: '',
    })
    await mainWindow?.loadURL(result.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateStatus({ phase: 'failed', message, error: message })
    await showStartupError()
  }
}

async function showStartupError() {
  await mainWindow?.loadFile(path.join(rendererDir, 'error.html'))
  publishStatus()
}

function getLanUrls(currentConfig) {
  if (!currentConfig.lanAccess) return []

  const urls = []
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${currentConfig.port}`)
      }
    }
  }
  return [...new Set(urls)]
}

async function saveUserConfig(nextValues) {
  const previousConfig = config
  const nextConfig = saveConfig(configPath, {
    ...config,
    ...pickConfigFields(nextValues),
  })

  await controller.stop()
  config = nextConfig
  configureRuntime()
  const restartRequired = previousConfig.host !== nextConfig.host
    || previousConfig.port !== nextConfig.port
    || previousConfig.lanAccess !== nextConfig.lanAccess
  updateStatus({
    phase: 'config-saved',
    message: restartRequired
      ? '设置已保存。监听地址或端口变化需要后端重新启动；如果当前服务由 Windows 任务管理，请先重启该任务，再点击“重试”。'
      : '设置已保存。点击“重试”后应用新的启动配置。',
    localUrl: backendConfig.url,
    lanUrls: getLanUrls(backendConfig),
    lanAccess: backendConfig.lanAccess,
    restartRequired,
  })
  return config
}

function registerIpc() {
  ipcMain.handle('dsh:get-status', () => publicRuntimeStatus(runtimeState))
  ipcMain.handle('dsh:get-config', () => config)
  ipcMain.handle('dsh:retry-start', async () => {
    await startHarness()
    return publicRuntimeStatus(runtimeState)
  })
  ipcMain.handle('dsh:restart', async () => {
    if (runtimeState.reusedExisting) {
      throw new Error('当前 Harness 由 Windows 任务或其他进程启动，GUI 不会强制终止它。请从任务栏或任务计划程序重启。')
    }
    await controller.stop()
    await startHarness()
    return publicRuntimeStatus(runtimeState)
  })
  ipcMain.handle('dsh:save-config', (_event, nextValues) => saveUserConfig(nextValues))
  ipcMain.handle('dsh:open-logs', () => shell.openPath(backendConfig.logsDir))
  ipcMain.handle('dsh:copy-diagnostics', () => {
    const text = JSON.stringify(diagnosticsFor(runtimeState), null, 2)
    clipboard.writeText(text)
    return text
  })
}

function createTray() {
  const image = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(iconPath) : image)
  tray.setToolTip('DSH GUI')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 DSH GUI', click: showMainWindow },
    { type: 'separator' },
    {
      label: '重启后端',
      click: () => {
        void (async () => {
          if (runtimeState.reusedExisting) {
            showMainWindow()
            updateStatus({
              message: '当前 Harness 由外部任务管理，GUI 不会强制终止它。请在任务计划程序中重启“DSH Harness Web”。',
            })
            return
          }
          await controller.stop()
          await startHarness()
        })().catch((error) => {
          updateStatus({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
          void showStartupError()
        })
      },
    },
    { label: '打开日志目录', click: () => void shell.openPath(backendConfig.logsDir) },
    { type: 'separator' },
    { label: '退出 DSH GUI', click: () => app.quit() },
  ]))
  tray.on('click', showMainWindow)
}

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

  mainWindow.once('ready-to-show', showMainWindow)
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (quitting || errorCode === -3 || typeof validatedURL !== 'string' || !validatedURL.startsWith(backendConfig.url)) return
    updateStatus({
      phase: 'failed',
      message: `Harness 页面加载失败：${errorDescription}（${errorCode}）`,
      error: errorDescription,
    })
    void showStartupError()
  })

  await startHarness()
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app.on('activate', showMainWindow)
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void controller?.stop()
      .catch((error) => console.error('Failed to stop owned DeepSeek Harness:', error))
      .finally(() => app.quit())
  })

  app.whenReady().then(async () => {
    configureRuntime()
    registerIpc()
    createTray()
    await createMainWindow()
  }).catch((error) => {
    console.error('Failed to start DSH GUI:', error)
    app.quit()
  })
}
