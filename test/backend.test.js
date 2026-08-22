import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import {
  buildHarnessProcessSpec,
  createHarnessController,
  resolveHarnessConfig,
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
