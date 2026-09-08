import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const DEFAULT_GUI_CONFIG = Object.freeze({
  harnessRoot: 'D:\\DSH',
  harnessHome: 'D:\\DSH\\.dsh',
  nodeCommand: 'D:\\Nodejs\\node.exe',
  host: '127.0.0.1',
  port: 3080,
  lanAccess: false,
  autoStart: true,
})

const CONFIG_KEYS = new Set(Object.keys(DEFAULT_GUI_CONFIG))

export function normalizeConfig(value) {
  const source = isRecord(value) ? value : {}
  const harnessRoot = stringOr(source.harnessRoot, DEFAULT_GUI_CONFIG.harnessRoot)
  const port = normalizePort(source.port)

  return {
    harnessRoot,
    harnessHome: stringOr(source.harnessHome, path.join(harnessRoot, '.dsh')),
    nodeCommand: stringOr(source.nodeCommand, DEFAULT_GUI_CONFIG.nodeCommand),
    host: stringOr(source.host, DEFAULT_GUI_CONFIG.host),
    port,
    lanAccess: parseBoolean(source.lanAccess, DEFAULT_GUI_CONFIG.lanAccess),
    autoStart: parseBoolean(source.autoStart, DEFAULT_GUI_CONFIG.autoStart),
  }
}

export function loadConfig(filePath) {
  if (!existsSync(filePath)) return normalizeConfig(DEFAULT_GUI_CONFIG)

  try {
    return normalizeConfig(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    return normalizeConfig(DEFAULT_GUI_CONFIG)
  }
}

export function saveConfig(filePath, value) {
  const config = normalizeConfig(value)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

function normalizePort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return DEFAULT_GUI_CONFIG.port
  return port
}

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  return fallback
}

// Keep the allow-list close to persistence so renderer input cannot add fields.
export function pickConfigFields(value) {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries([...CONFIG_KEYS].filter((key) => key in source).map((key) => [key, source[key]]))
}
