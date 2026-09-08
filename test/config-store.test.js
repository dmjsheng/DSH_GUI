import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_GUI_CONFIG,
  loadConfig,
  normalizeConfig,
  saveConfig,
} from '../src/config-store.js'

test('normalizeConfig keeps LAN access disabled by default', () => {
  const config = normalizeConfig({})

  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 3080)
  assert.equal(config.lanAccess, false)
  assert.equal(config.harnessRoot, DEFAULT_GUI_CONFIG.harnessRoot)
  assert.equal(config.harnessHome, 'D:\\DSH\\.dsh')
})

test('normalizeConfig preserves an explicit LAN opt-in and valid settings', () => {
  const config = normalizeConfig({
    harnessRoot: 'E:\\Tools\\DSH',
    nodeCommand: 'E:\\Tools\\node.exe',
    port: '4090',
    lanAccess: true,
  })

  assert.equal(config.harnessRoot, 'E:\\Tools\\DSH')
  assert.equal(config.harnessHome, 'E:\\Tools\\DSH\\.dsh')
  assert.equal(config.nodeCommand, 'E:\\Tools\\node.exe')
  assert.equal(config.port, 4090)
  assert.equal(config.lanAccess, true)
})

test('loadConfig falls back to safe defaults when the file is malformed', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-gui-config-'))
  const filePath = path.join(root, 'config.json')

  try {
    writeFileSync(filePath, '{not-json', 'utf8')
    const config = loadConfig(filePath)

    assert.deepEqual(config, DEFAULT_GUI_CONFIG)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('saveConfig persists normalized settings without unrelated fields', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-gui-config-'))
  const filePath = path.join(root, 'nested', 'config.json')

  try {
    const saved = saveConfig(filePath, { lanAccess: true, port: 4090, ignored: 'value' })
    const stored = JSON.parse(readFileSync(filePath, 'utf8'))

    assert.equal(saved.lanAccess, true)
    assert.equal(saved.port, 4090)
    assert.equal(stored.ignored, undefined)
    assert.equal(loadConfig(filePath).lanAccess, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
