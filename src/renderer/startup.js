const bridge = window.dshGui

const phaseText = {
  idle: '准备启动',
  checking: '检查运行环境',
  starting: '启动 Harness',
  ready: '连接成功',
  failed: '启动失败',
  'config-saved': '设置已保存',
}

const stepOrder = ['checking', 'starting', 'ready']
const elements = {
  title: document.querySelector('#title'),
  message: document.querySelector('#message'),
  phase: document.querySelector('#phase'),
  root: document.querySelector('#harnessRoot'),
  version: document.querySelector('#version'),
  endpoint: document.querySelector('#endpoint'),
  ownership: document.querySelector('#ownership'),
  steps: [...document.querySelectorAll('[data-step]')],
  retry: document.querySelector('#retry'),
  restart: document.querySelector('#restart'),
  openLogs: document.querySelector('#openLogs'),
  copyDiagnostics: document.querySelector('#copyDiagnostics'),
  settingsToggle: document.querySelector('#settingsToggle'),
  settings: document.querySelector('#settings'),
  saveSettings: document.querySelector('#saveSettings'),
  saveMessage: document.querySelector('#saveMessage'),
  harnessRootInput: document.querySelector('#harnessRootInput'),
  harnessHomeInput: document.querySelector('#harnessHomeInput'),
  nodeCommandInput: document.querySelector('#nodeCommandInput'),
  portInput: document.querySelector('#portInput'),
  lanAccessInput: document.querySelector('#lanAccessInput'),
  autoStartInput: document.querySelector('#autoStartInput'),
  lanNotice: document.querySelector('#lanNotice'),
  lanMessage: document.querySelector('#lanMessage'),
  lanUrls: document.querySelector('#lanUrls'),
}

function render(status) {
  const phase = status?.phase ?? 'idle'
  document.body.dataset.phase = phase
  elements.phase.textContent = phaseText[phase] ?? phase
  elements.title.textContent = phase === 'failed' ? 'DeepSeek Harness 没有启动' : '正在准备 DeepSeek Harness'
  elements.message.textContent = status?.message || '正在读取运行状态。'
  elements.root.textContent = status?.harnessRoot || ''
  elements.version.textContent = '0.3'
  elements.endpoint.textContent = status?.accessUrl || status?.localUrl || ''
  elements.ownership.textContent = status?.reusedExisting ? '复用已有服务' : status?.pid ? `GUI 管理进程 ${status.pid}` : '等待启动'

  const currentIndex = stepOrder.indexOf(phase)
  for (const step of elements.steps) {
    const index = stepOrder.indexOf(step.dataset.step)
    step.dataset.state = phase === 'failed' ? 'failed' : index <= currentIndex ? 'done' : 'pending'
  }

  const canRetry = phase === 'failed' || phase === 'config-saved'
  elements.retry.hidden = !canRetry
  elements.restart.hidden = (phase !== 'ready' && phase !== 'failed') || status?.reusedExisting === true
  elements.lanNotice.hidden = !status?.lanAccess
  elements.lanMessage.textContent = status?.reusedExisting
    ? '当前连接复用了外部 Harness。若刚打开此开关，请重启“DSH Harness Web”任务后再点重试。'
    : '同一局域网内的设备可以访问下面的地址，仍然需要 Harness token。不要把它转发到公网。'
  elements.lanUrls.replaceChildren()
  for (const url of status?.lanUrls ?? []) {
    const item = document.createElement('li')
    item.textContent = `${url}（仍需 token）`
    elements.lanUrls.append(item)
  }
}

async function loadInitialState() {
  try {
    const [status, config] = await Promise.all([bridge.getStatus(), bridge.getConfig()])
    fillConfig(config)
    render(status)
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error)
  }
}

function fillConfig(config) {
  if (!config) return
  elements.harnessRootInput.value = config.harnessRoot ?? ''
  elements.harnessHomeInput.value = config.harnessHome ?? ''
  elements.nodeCommandInput.value = config.nodeCommand ?? ''
  elements.portInput.value = config.port ?? 3080
  elements.lanAccessInput.checked = config.lanAccess === true
  elements.autoStartInput.checked = config.autoStart !== false
}

async function retry() {
  elements.message.textContent = '正在重试，请稍候。'
  try {
    await bridge.retryStart()
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function restart() {
  elements.message.textContent = '正在请求重启后端。'
  try {
    await bridge.restartBackend()
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function saveSettings() {
  elements.saveMessage.textContent = '正在保存。'
  try {
    const config = await bridge.saveConfig({
      harnessRoot: elements.harnessRootInput.value,
      harnessHome: elements.harnessHomeInput.value,
      nodeCommand: elements.nodeCommandInput.value,
      port: Number(elements.portInput.value),
      lanAccess: elements.lanAccessInput.checked,
      autoStart: elements.autoStartInput.checked,
    })
    fillConfig(config)
    elements.saveMessage.textContent = '已保存，点击“重试”应用新配置。'
  } catch (error) {
    elements.saveMessage.textContent = error instanceof Error ? error.message : String(error)
  }
}

elements.retry.addEventListener('click', () => void retry())
elements.restart.addEventListener('click', () => void restart())
elements.openLogs.addEventListener('click', () => void bridge.openLogs())
elements.copyDiagnostics.addEventListener('click', async () => {
  await bridge.copyDiagnostics()
  elements.copyDiagnostics.textContent = '已复制诊断'
  setTimeout(() => { elements.copyDiagnostics.textContent = '复制诊断' }, 1_500)
})
elements.settingsToggle.addEventListener('click', () => {
  elements.settings.hidden = !elements.settings.hidden
})
elements.saveSettings.addEventListener('click', () => void saveSettings())
bridge.onStatus(render)
void loadInitialState()
