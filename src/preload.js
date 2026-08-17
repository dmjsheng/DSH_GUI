import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('dshGui', {
  platform: process.platform,
})
