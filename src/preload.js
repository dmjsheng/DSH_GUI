import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshGui', {
  platform: process.platform,
  getStatus: () => ipcRenderer.invoke('dsh:get-status'),
  getConfig: () => ipcRenderer.invoke('dsh:get-config'),
  retryStart: () => ipcRenderer.invoke('dsh:retry-start'),
  restartBackend: () => ipcRenderer.invoke('dsh:restart'),
  saveConfig: (config) => ipcRenderer.invoke('dsh:save-config', config),
  openLogs: () => ipcRenderer.invoke('dsh:open-logs'),
  copyDiagnostics: () => ipcRenderer.invoke('dsh:copy-diagnostics'),
  onStatus(callback) {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('dsh:status', listener)
    return () => ipcRenderer.removeListener('dsh:status', listener)
  },
})
