const TOKEN_PATTERN = /((?:[?&])?(?:token|api[_-]?key)=)[^&\s"'<>]*/gi

export function createRuntimeStatus(config, patch = {}) {
  const localUrl = `http://${config.host}:${config.port}`

  return {
    phase: 'idle',
    message: '',
    harnessRoot: config.harnessRoot,
    harnessHome: config.harnessHome,
    logsDir: config.logsDir ?? `${config.harnessHome}\\logs`,
    host: config.host,
    port: config.port,
    lanAccess: Boolean(config.lanAccess),
    localUrl,
    lanUrls: [],
    accessUrl: localUrl,
    reusedExisting: false,
    restartRequired: false,
    pid: undefined,
    ...patch,
  }
}

export function publicRuntimeStatus(status) {
  return {
    ...status,
    message: redact(status.message ?? ''),
    accessUrl: removeQuery(status.accessUrl),
  }
}

export function diagnosticsFor(status) {
  const publicStatus = publicRuntimeStatus(status)
  return {
    phase: publicStatus.phase,
    message: publicStatus.message,
    harnessRoot: publicStatus.harnessRoot,
    harnessHome: publicStatus.harnessHome,
    logsDir: publicStatus.logsDir,
    host: publicStatus.host,
    port: publicStatus.port,
    lanAccess: publicStatus.lanAccess,
    localUrl: publicStatus.localUrl,
    lanUrls: publicStatus.lanUrls,
    accessUrl: publicStatus.accessUrl,
    reusedExisting: publicStatus.reusedExisting,
    pid: publicStatus.pid,
  }
}

function removeQuery(value) {
  if (typeof value !== 'string' || value === '') return value

  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return redact(value)
  }
}

function redact(value) {
  return value.replace(TOKEN_PATTERN, '$1***REDACTED***')
}
