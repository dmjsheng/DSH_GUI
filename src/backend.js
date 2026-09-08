import { spawn, execFile } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_HARNESS_ROOT = 'D:\\DSH'
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3080
const WINDOWS_NODE_CANDIDATES = [
  'D:\\Nodejs\\node.exe',
  'C:\\Program Files\\nodejs\\node.exe',
]
const AUTH_URL_PATTERN = /https?:\/\/[^\s"'<>]+/g
const AUTH_REQUIRED_STATUS = 401

export function resolveBindHost(config) {
  return config.lanAccess ? '0.0.0.0' : config.host
}

export function resolveHarnessConfig(env = process.env) {
  const harnessRoot = env.DSH_GUI_HARNESS_ROOT || DEFAULT_HARNESS_ROOT
  const harnessHome = env.DSH_GUI_HARNESS_HOME || path.join(harnessRoot, '.dsh')
  const host = env.DSH_GUI_HOST || DEFAULT_HOST
  const lanAccess = parseBoolean(env.DSH_GUI_LAN_ACCESS)
  const port = parsePort(env.DSH_GUI_PORT)
  const nodeCommand = env.DSH_GUI_NODE || resolveDefaultNodeCommand()

  return {
    harnessRoot,
    harnessHome,
    host,
    bindHost: resolveBindHost({ host, lanAccess }),
    lanAccess,
    port,
    url: `http://${host}:${port}`,
    nodeCommand,
    logsDir: path.join(harnessHome, 'logs'),
  }
}

export async function probeHttp(url, timeoutMs = 500) {
  const signal = AbortSignal.timeout(timeoutMs)

  try {
    const response = await fetch(url, { redirect: 'manual', signal })
    return response.ok || response.status === AUTH_REQUIRED_STATUS || (response.status >= 300 && response.status < 400)
  } catch {
    return false
  }
}

export function extractAuthUrl(output, config) {
  const candidates = output.match(AUTH_URL_PATTERN) ?? []
  const expectedHost = config.host ?? new URL(config.url).hostname
  const expectedPort = String(config.port)

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index].replace(/[),.;]+$/g, '')

    try {
      const parsed = new URL(candidate)
      if (parsed.hostname !== expectedHost) continue
      if ((parsed.port || (parsed.protocol === 'https:' ? '443' : '80')) !== expectedPort) continue
      if (!parsed.searchParams.has('token')) continue
      return parsed.toString()
    } catch {
      // Ignore unrelated URLs in command output.
    }
  }

  return undefined
}

export function redactSensitiveText(value) {
  return value.replace(/([?&](?:token|api[_-]?key)=)[^&\s"'<>]*/gi, '$1***REDACTED***')
}

export async function resolveHarnessAccessUrl(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const readAuthUrl = deps.readAuthUrl ?? (() => readAuthUrlFromLogs(config))
  const baseResponse = await fetchImpl(config.url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(1_000),
  })

  if (baseResponse.status !== AUTH_REQUIRED_STATUS) return config.url

  const authUrl = await readAuthUrl()
  if (authUrl === undefined) {
    throw new Error(
      'DeepSeek Harness is online but its authentication URL was not found. Restart the Harness and retry.',
    )
  }

  const authResponse = await fetchImpl(authUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(1_000),
  })

  if (authResponse.status < 200 || authResponse.status >= 400) {
    throw new Error('DeepSeek Harness authentication URL is no longer valid. Restart the Harness and retry.')
  }

  return authUrl
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
  const allowStart = deps.allowStart ?? true
  const probe = deps.probe ?? probeHttp
  const spawnProcess = deps.spawnProcess ?? spawnHarnessProcess
  const wait = deps.waitForReady ?? waitForReady
  const killTree = deps.killTree ?? killProcessTree
  const resolveAccessUrl = deps.resolveAccessUrl ?? ((currentConfig, currentChild) => resolveHarnessAccessUrl(currentConfig, {
    readAuthUrl: async () => extractAuthUrl(currentChild?.dshOutput?.stdout ?? '', currentConfig) ?? readAuthUrlFromLogs(currentConfig),
  }))
  let child = null

  return {
    config,

    async start() {
      if (await probe(config.url)) {
        return {
          url: await resolveAccessUrl(config, undefined),
          reusedExisting: true,
          pid: undefined,
        }
      }

      if (!allowStart) {
        throw new Error('自动启动已关闭，请先启动 Harness 服务，或在设置中重新开启自动启动。')
      }

      if (!existsSync(config.harnessRoot)) {
        throw new Error(`DeepSeek Harness root was not found: ${config.harnessRoot}`)
      }

      mkdirSync(config.logsDir, { recursive: true })
      child = spawnProcess(config)
      await waitForChildStartup(child, config, wait)

      return {
        url: await resolveAccessUrl(config, child),
        reusedExisting: false,
        pid: child.pid,
      }
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

function spawnHarnessProcess(config) {
  const out = createWriteStream(path.join(config.logsDir, 'gui-web.out.log'), { flags: 'a' })
  const err = createWriteStream(path.join(config.logsDir, 'gui-web.err.log'), { flags: 'a' })
  const spec = buildHarnessProcessSpec(config)
  const child = spawn(spec.command, spec.args, spec.options)
  const output = { stdout: '' }

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString()
    output.stdout += text
    out.write(redactSensitiveText(text))
  })
  child.stderr?.on('data', (chunk) => {
    err.write(redactSensitiveText(chunk.toString()))
  })
  child.dshOutput = output

  return child
}

export function buildHarnessProcessSpec(config) {
  return {
    command: config.nodeCommand,
    args: [
      '--import',
      'tsx/esm',
      'apps/cli/src/bin.ts',
      'web',
      '--host',
      resolveBindHost(config),
      '--port',
      String(config.port),
    ],
    options: {
      cwd: config.harnessRoot,
      env: {
        ...process.env,
        DSH_HOME: config.harnessHome,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  }
}

function resolveDefaultNodeCommand() {
  if (process.platform === 'win32') {
    const candidate = WINDOWS_NODE_CANDIDATES.find((nodePath) => existsSync(nodePath))
    if (candidate !== undefined) return candidate
    return 'node.exe'
  }

  return 'node'
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid DSH_GUI_PORT value: ${value}`)
  }

  return port
}

function parseBoolean(value) {
  return value === true || ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function readAuthUrlFromLogs(config) {
  if (!existsSync(config.logsDir)) return undefined

  const files = readdirSync(config.logsDir)
    .filter((name) => name === 'gui-web.out.log' || /^startup-web-\d{8}-\d{6}\.out\.log$/.test(name))
    .map((name) => ({
      name,
      modified: statSync(path.join(config.logsDir, name)).mtimeMs,
    }))
    .sort((left, right) => right.modified - left.modified)

  for (const file of files) {
    const output = readFileSync(path.join(config.logsDir, file.name), 'utf8')
    const authUrl = extractAuthUrl(output, config)
    if (authUrl !== undefined) return authUrl
  }

  return undefined
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
