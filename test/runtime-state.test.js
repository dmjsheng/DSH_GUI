import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRuntimeStatus,
  diagnosticsFor,
  publicRuntimeStatus,
} from '../src/runtime-state.js'

test('publicRuntimeStatus never exposes an authentication token', () => {
  const status = createRuntimeStatus({
    harnessRoot: 'D:\\DSH',
    harnessHome: 'D:\\DSH\\.dsh',
    host: '127.0.0.1',
    port: 3080,
    lanAccess: true,
  }, {
    phase: 'ready',
    accessUrl: 'http://127.0.0.1:3080/?token=secret-token',
    pid: 123,
  })

  const publicStatus = publicRuntimeStatus(status)

  assert.equal(publicStatus.phase, 'ready')
  assert.equal(publicStatus.accessUrl, 'http://127.0.0.1:3080/')
  assert.equal(JSON.stringify(publicStatus).includes('secret-token'), false)
})

test('diagnosticsFor contains useful state without token values', () => {
  const status = createRuntimeStatus({
    harnessRoot: 'D:\\DSH',
    harnessHome: 'D:\\DSH\\.dsh',
    host: '127.0.0.1',
    port: 3080,
    lanAccess: false,
  }, {
    phase: 'failed',
    message: 'token=secret-token failed',
    accessUrl: 'http://127.0.0.1:3080/?token=secret-token',
  })

  const diagnostics = diagnosticsFor(status)

  assert.equal(diagnostics.harnessRoot, 'D:\\DSH')
  assert.equal(diagnostics.phase, 'failed')
  assert.equal(JSON.stringify(diagnostics).includes('secret-token'), false)
})
