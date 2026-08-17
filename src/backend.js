import { spawn, execFile } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_HARNESS_ROOT = 'D:\\DSH'
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3080

export function resolveHarnessConfig(env = process.env) {
  const harnessRoot = env.DSH_GUI_HARNESS_ROOT || DEFAULT_HARNESS_ROOT
  const harnessHome = env.DSH_GUI_HARNESS_HOME || path.join(harnessRoot, '.dsh')
  const host = env.DSH_GUI_HOST || DEFAULT_HOST
  const port = parsePort(env.DSH_GUI_PORT)
  const pnpmCommand = env.DSH_GUI_PNPM || (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')

  return {
    harnessRoot,
    harnessHome,
    host,
    port,
    url: `http://${host}:${port}`,
    pnpmCommand,
    logsDir: path.join(harnessHome, 'logs'),
  }
}

export async function probeHttp(url, timeoutMs = 500) {
  const signal = AbortSignal.timeout(timeoutMs)

  try {
    const response = await fetch(url, { signal })
    return response.ok
  } catch {
    return false
  }
}

export async function waitForReady(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000
  const intervalMs = options.intervalMs ?? 250
  const probe = options.probe ?? probeHttp
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    if (await probe(url)) return
    await sleep(intervalMs)
  }

  throw new Error(`DeepSeek Harness did not become ready at ${url} within ${timeoutMs}ms`)
}

export function createHarnessController(deps = {}) {
  const config = deps.config ?? resolveHarnessConfig()
  const probe = deps.probe ?? probeHttp
  const spawnProcess = deps.spawnProcess ?? spawnHarnessProcess
  const wait = deps.waitForReady ?? waitForReady
  const killTree = deps.killTree ?? killProcessTree
  let child = null

  return {
    config,

    async start() {
      if (await probe(config.url)) {
        return { url: config.url, reusedExisting: true, pid: undefined }
      }

      if (!existsSync(config.harnessRoot)) {
        throw new Error(`DeepSeek Harness root was not found: ${config.harnessRoot}`)
      }

      mkdirSync(config.logsDir, { recursive: true })
      child = spawnProcess(config)
      await waitForChildStartup(child, config, wait)

      return { url: config.url, reusedExisting: false, pid: child.pid }
    },

    async stop() {
      if (child?.pid === undefined) {
        child = null
        return
      }

      await killTree(child.pid)
      child = null
    },
  }
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid DSH_GUI_PORT value: ${value}`)
  }

  return port
}

function spawnHarnessProcess(config) {
  const out = createWriteStream(path.join(config.logsDir, 'gui-web.out.log'), { flags: 'a' })
  const err = createWriteStream(path.join(config.logsDir, 'gui-web.err.log'), { flags: 'a' })
  const child = spawn(config.pnpmCommand, ['dsh', 'web', '--host', config.host, '--port', String(config.port)], {
    cwd: config.harnessRoot,
    env: {
      ...process.env,
      DSH_HOME: config.harnessHome,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout?.pipe(out)
  child.stderr?.pipe(err)

  return child
}

async function waitForChildStartup(child, config, wait) {
  let settled = false
  const startupFailure = new Promise((_, reject) => {
    child.once?.('error', (error) => {
      if (!settled) reject(error)
    })

    child.once?.('exit', (code, signal) => {
      if (!settled) {
        reject(new Error(`DeepSeek Harness exited before startup completed (code=${code}, signal=${signal})`))
      }
    })
  })

  await Promise.race([wait(config.url), startupFailure])
  settled = true
}

async function killProcessTree(pid) {
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'])
    return
  }

  process.kill(pid, 'SIGTERM')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
