import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import {
  buildHarnessProcessSpec,
  createHarnessController,
  extractAuthUrl,
  redactSensitiveText,
  resolveHarnessConfig,
  resolveHarnessAccessUrl,
  resolveBindHost,
  waitForReady,
} from '../src/backend.js'

test('resolveHarnessConfig uses D drive defaults', () => {
  const config = resolveHarnessConfig({})

  assert.equal(config.harnessRoot, 'D:\\DSH')
  assert.equal(config.harnessHome, 'D:\\DSH\\.dsh')
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 3080)
  assert.equal(config.url, 'http://127.0.0.1:3080')
  assert.equal(config.nodeCommand, 'D:\\Nodejs\\node.exe')
})

test('buildHarnessProcessSpec starts Harness with node directly', () => {
  const spec = buildHarnessProcessSpec({
    harnessRoot: 'D:\\DSH',
    harnessHome: 'D:\\DSH\\.dsh',
    host: '127.0.0.1',
    port: 3080,
    url: 'http://127.0.0.1:3080',
    nodeCommand: 'D:\\Nodejs\\node.exe',
    logsDir: 'D:\\DSH\\.dsh\\logs',
  })

  assert.equal(spec.command, 'D:\\Nodejs\\node.exe')
  assert.deepEqual(spec.args, [
    '--import',
    'tsx/esm',
    'apps/cli/src/bin.ts',
    'web',
    '--host',
    '127.0.0.1',
    '--port',
    '3080',
  ])
  assert.equal(spec.options.cwd, 'D:\\DSH')
  assert.equal(spec.options.env.DSH_HOME, 'D:\\DSH\\.dsh')
  assert.equal(spec.options.windowsHide, true)
})

test('resolveHarnessConfig accepts environment overrides', () => {
  const config = resolveHarnessConfig({
    DSH_GUI_HARNESS_ROOT: 'E:\\Tools\\DSH',
    DSH_GUI_HOST: 'localhost',
    DSH_GUI_PORT: '4090',
    DSH_GUI_NODE: 'C:\\Tools\\node.exe',
  })

  assert.equal(config.harnessRoot, 'E:\\Tools\\DSH')
  assert.equal(config.harnessHome, 'E:\\Tools\\DSH\\.dsh')
  assert.equal(config.host, 'localhost')
  assert.equal(config.port, 4090)
  assert.equal(config.url, 'http://localhost:4090')
  assert.equal(config.nodeCommand, 'C:\\Tools\\node.exe')
})

test('waitForReady resolves after the endpoint starts responding', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ready')
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    await waitForReady(`http://127.0.0.1:${port}`, {
      timeoutMs: 500,
      intervalMs: 10,
    })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('probeHttp treats an authenticated 401 endpoint as online', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(401, { 'content-type': 'text/plain' })
    response.end('authentication required')
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    const { probeHttp } = await import('../src/backend.js')
    assert.equal(await probeHttp(`http://127.0.0.1:${port}`), true)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('extractAuthUrl selects the newest matching Harness token URL', () => {
  const output = [
    'dsh web: http://127.0.0.1:3080/?token=old-token',
    'dsh web: http://127.0.0.1:3080/?token=new-token',
    'dsh web: http://127.0.0.1:4090/?token=other-port',
  ].join('\n')

  assert.equal(
    extractAuthUrl(output, { host: '127.0.0.1', port: 3080 }),
    'http://127.0.0.1:3080/?token=new-token',
  )
})

test('redactSensitiveText removes token values from diagnostics', () => {
  assert.equal(
    redactSensitiveText('dsh web: http://127.0.0.1:3080/?token=secret-token&next=1'),
    'dsh web: http://127.0.0.1:3080/?token=***REDACTED***&next=1',
  )
})

test('resolveHarnessAccessUrl validates an authenticated endpoint before returning its URL', async () => {
  const config = {
    host: '127.0.0.1',
    port: 3080,
    url: 'http://127.0.0.1:3080',
  }
  const authUrl = 'http://127.0.0.1:3080/?token=known-token'

  const result = await resolveHarnessAccessUrl(config, {
    readAuthUrl: async () => authUrl,
    fetchImpl: async (url) => new Response(null, { status: url === config.url ? 401 : 303 }),
  })

  assert.equal(result, authUrl)
})

test('resolveBindHost opts into all interfaces only for LAN access', () => {
  assert.equal(resolveBindHost({ host: '127.0.0.1', lanAccess: false }), '127.0.0.1')
  assert.equal(resolveBindHost({ host: '127.0.0.1', lanAccess: true }), '0.0.0.0')
})

test('buildHarnessProcessSpec binds the child to all interfaces for LAN access', () => {
  const spec = buildHarnessProcessSpec({
    harnessRoot: 'D:\\DSH',
    harnessHome: 'D:\\DSH\\.dsh',
    host: '127.0.0.1',
    lanAccess: true,
    port: 3080,
    url: 'http://127.0.0.1:3080',
    nodeCommand: 'D:\\Nodejs\\node.exe',
    logsDir: 'D:\\DSH\\.dsh\\logs',
  })

  assert.deepEqual(spec.args.slice(-4), ['--host', '0.0.0.0', '--port', '3080'])
})

test('controller reuses an existing responding endpoint without spawning or killing it', async () => {
  let spawned = false
  let killed = false
  const controller = createHarnessController({
    config: {
      harnessRoot: 'D:\\DSH',
      harnessHome: 'D:\\DSH\\.dsh',
      host: '127.0.0.1',
      port: 3080,
      url: 'http://127.0.0.1:3080',
      nodeCommand: 'D:\\Nodejs\\node.exe',
    },
    probe: async () => true,
    resolveAccessUrl: async (config) => config.url,
    spawnProcess: () => {
      spawned = true
      return {
        pid: 123,
        once() {},
        kill() {
          killed = true
        },
      }
    },
    killTree: async () => {
      killed = true
    },
    waitForReady: async () => {},
  })

  const result = await controller.start()
  await controller.stop()

  assert.equal(result.reusedExisting, true)
  assert.equal(spawned, false)
  assert.equal(killed, false)
})

test('controller returns the authenticated URL when reusing an existing endpoint', async () => {
  const authUrl = 'http://127.0.0.1:3080/?token=known-token'
  const result = await createHarnessController({
    config: {
      harnessRoot: 'D:\\DSH',
      harnessHome: 'D:\\DSH\\.dsh',
      host: '127.0.0.1',
      port: 3080,
      url: 'http://127.0.0.1:3080',
      nodeCommand: 'D:\\Nodejs\\node.exe',
    },
    probe: async () => true,
    resolveAccessUrl: async () => authUrl,
    spawnProcess: () => {
      throw new Error('should not spawn for an existing endpoint')
    },
  }).start()

  assert.equal(result.url, authUrl)
  assert.equal(result.reusedExisting, true)
})

test('controller does not spawn when automatic startup is disabled', async () => {
  let spawned = false
  const controller = createHarnessController({
    config: {
      harnessRoot: 'D:\\DSH',
      harnessHome: 'D:\\DSH\\.dsh',
      host: '127.0.0.1',
      port: 3080,
      url: 'http://127.0.0.1:3080',
      nodeCommand: 'D:\\Nodejs\\node.exe',
    },
    allowStart: false,
    probe: async () => false,
    spawnProcess: () => {
      spawned = true
      throw new Error('spawn should not be called')
    },
  })

  await assert.rejects(() => controller.start(), /自动启动已关闭/)
  assert.equal(spawned, false)
})
