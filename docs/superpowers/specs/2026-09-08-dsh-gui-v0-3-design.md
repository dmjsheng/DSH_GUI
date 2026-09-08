# DSH GUI V0.3 设计稿

状态：用户已确认，核心实现已完成，正在进行打包与验收
日期：2026-09-08
适用版本：DSH GUI V0.3 + DeepSeek Harness `0.1.2-rc.1`

## 1. 文档目的

本设计稿定义 DSH GUI V0.3 的产品边界、启动架构、界面结构、故障恢复和验证标准。V0.3 的重点不是重新实现 Harness 的聊天界面，而是把现有的 Electron 壳提升为一个可靠的 Windows 桌面宿主，让用户可以双击打开、看到启动进度、理解故障原因，并在不依赖人工重拉后端的情况下完成恢复。

本稿借鉴以下项目的公开结构和交互思路：

- [anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop)：首次设置、托盘、恢复、更新和桌面生命周期。
- [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)：文件、终端、Git、任务和侧边工作台的组织方式。
- [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop)：本机端口、日志、Safe Mode 和故障恢复。
- [desktop-cc-gui](https://github.com/zhukunpenglinyutong/desktop-cc-gui)：项目/会话导航、工具面板和输入区的布局参考。

这里只借鉴产品结构和交互，不复制第三方代码、图片或品牌资源。第三方许可证边界见现有调研报告：[GUI 参考项目调研](../../research/2026-09-08-deepseek-harness-gui-references.md)。

## 2. 当前基线与升级结果

### 2.1 当前安装边界

| 项目 | 当前值 |
| --- | --- |
| Harness 源码 | `D:\DSH` |
| Harness 用户数据 | `D:\DSH\.dsh` |
| Node.js | `D:\Nodejs\node.exe` |
| GUI 仓库 | `D:\DSH_GUI` |
| 默认监听地址 | `127.0.0.1:3080` |
| 开机启动 | Windows 任务 `DSH Harness Web` |
| 当前 GUI 方式 | Electron 启动或复用外部 Harness，再加载官方 Web UI |

### 2.2 本轮升级记录

- DSH 从 `0.1.0-rc.5` 快进到 `0.1.2-rc.1`。
- 升级前已建立本地回退分支：`backup/pre-v0.1.2-rc.1`。
- `pnpm@11.7.0` 依赖安装通过。
- 清理了确认属于旧版、被 `.gitignore` 忽略的 `packages/host/apiproxy/lib` 构建产物后，Host、Client 和 Web 前端完整构建通过。
- `dsh --version` 返回 `0.1.2-rc.1`。
- Windows 任务启动后，服务监听 `127.0.0.1:3080`，任务结果为 `0`。

### 2.3 已发现的 V0.2 兼容问题

`0.1.2-rc.1` 默认启用了 Web 访问令牌：

1. 服务启动日志会输出带 `?token=...` 的 URL。
2. 裸访问 `http://127.0.0.1:3080/` 返回 `401 Unauthorized`。
3. V0.2 GUI 目前只探测裸 URL，并把裸 URL 交给 Electron，因此会把“服务在线但需要 token”误判成“服务没有启动”。

这不是 VPN 或虚拟网卡本身造成的拒绝连接，而是 V0.2 启动协议没有处理新版 Harness 的认证 URL。V0.3 必须把“进程启动”“端口监听”“HTTP 已响应”“已取得访问 URL”“页面已加载”拆成不同状态，不能用一个 `response.ok` 判断全部情况。

## 3. 目标与非目标

### 3.1 V0.3 目标

1. 双击 GUI 后，用户能看到清晰的启动阶段，而不是空白页或笼统的“拒绝连接”。
2. 自动复用由系统任务启动的 Harness，也能识别并提示外部占用的端口。
3. 正确保存、传递和刷新 `0.1.2-rc.1` 的访问 token，不把 token 暴露到普通日志、错误页或 Git 仓库。
4. 提供重试、重启后端、打开日志、复制诊断信息和进入 Safe Mode 的恢复入口。
5. 提供单实例、托盘和关闭策略，避免重复拉起 Harness 或误杀用户手动启动的进程。
6. 保留官方 Harness Web UI 作为主要工作界面；嵌入式开发常用的文件、终端和 Git 能力先通过官方页面或兼容插件提供。
7. 保留 `D:\DSH` 和 `D:\DSH_GUI` 分离，GUI 仓库不提交完整 Node、Harness、`node_modules` 或用户凭据。

### 3.2 暂不做

- 不在 V0.3 重写聊天、Session、模型选择和 Harness RPC 协议。
- 不直接 fork `anywhere-labs/dsh-desktop`。
- 不一次性加入移动端、SSH/Docker、多引擎、插件市场、桌宠和多套皮肤。
- 不默认把服务绑定到局域网地址；默认仍为 `127.0.0.1`。
- 不在没有兼容性测试的情况下安装 `dsh-better-sidebar` 或其他第三方插件。
- 不把外部 Harness 自动升级到未知版本；升级必须有版本显示、备份和回退边界。

## 4. 设计原则

### 4.1 外部 Harness 边界

Electron 是桌面控制面，Harness 是业务运行面。GUI 可以启动、停止、探测和展示 Harness，但不把 Harness 用户目录复制进 GUI 仓库，也不让 GUI 直接修改 Harness 的业务数据。

### 4.2 状态优先于猜测

启动界面必须展示可验证的状态：目录是否存在、Node 是否可执行、版本是多少、端口是否监听、哪个 PID 持有端口、是否拿到 token、页面是否可访问。错误信息要说明下一步动作。

### 4.3 默认安全，故障可恢复

默认只监听回环地址；日志中对 token 脱敏；关闭 GUI 时只回收 GUI 自己创建的进程；对外部已有进程只复用不强杀。Safe Mode 通过禁用用户插件或临时覆盖启动参数排查前端兼容性，不删除用户数据。

### 4.4 先可靠，再丰富

V0.3 先让冷启动、重启、睡眠唤醒、电脑重启和端口冲突都可理解、可恢复，再增加工作台面板。嵌入式开发用户最需要的是稳定的项目目录、终端和日志入口，而不是装饰性功能数量。

## 5. V0.3 产品结构

### 5.1 首次启动页

首次启动或配置失效时显示设置页：

- Harness 目录：默认 `D:\DSH`，支持选择目录。
- Node 路径：默认 `D:\Nodejs\node.exe`，显示检测结果和版本。
- 用户数据目录：默认 `D:\DSH\.dsh`，可查看但不建议随意修改。
- 监听地址：默认 `127.0.0.1`，局域网访问需要显式开启并显示安全提示。
- 端口模式：固定端口 `3080` 或自动选择空闲端口；V0.3 默认固定，验证稳定后再开放自动端口。
- 启动方式：本次启动、随 Windows 启动、仅在 GUI 打开时启动。

### 5.2 启动面板

启动面板用垂直步骤呈现：

1. 检查配置
2. 检查 Harness 目录
3. 检查 Node 和 DSH 版本
4. 检查端口占用
5. 复用或启动 Harness
6. 等待 Web 就绪
7. 获取访问 token
8. 加载工作区

每一步都显示结果、耗时和可展开的诊断细节。成功后自动进入官方 Web UI；失败后停留在诊断页，不跳转到白屏。

### 5.3 运行中状态栏

底部状态栏保持克制，显示：

- Harness：运行中、启动中、异常或未配置。
- DSH 版本：`0.1.2-rc.1`。
- 地址：回环地址和端口；token 不显示。
- 当前工作区：由官方 Web UI 的工作区选择决定，GUI 只展示最近识别到的目录。
- 操作入口：重启后端、打开日志、诊断、设置。

### 5.4 诊断页

诊断页提供单个问题的解释和动作，不要求用户理解 Node 或 PowerShell：

| 状态 | 用户看到的解释 | 动作 |
| --- | --- | --- |
| 目录不存在 | 找不到 Harness 安装目录 | 选择目录、重新检测 |
| Node 不可用 | Node 路径不存在或版本不满足 | 选择 Node、打开安装说明 |
| 端口被占用 | 3080 被其他程序占用 | 查看占用进程、改端口、重试 |
| 子进程提前退出 | Harness 启动后立即退出 | 查看日志、复制诊断、Safe Mode |
| 端口在线但需要 token | 服务已启动，正在取得安全访问地址 | 重新读取启动日志、重启并重新建立会话 |
| 页面资源失败 | 后端在线但前端资源或插件加载失败 | Safe Mode、打开日志、回退插件 |
| VPN/TUN 干扰 | 当前回环探测异常 | 显示回环探测结果，提示检查代理绕过规则 |

动作包括：重试、重启后端、打开日志目录、复制诊断 JSON、打开浏览器访问、Safe Mode 和回退说明。

### 5.5 托盘和单实例

- 第二次双击只聚焦现有窗口，不再启动第二个后端。
- 关闭窗口默认隐藏到托盘；从托盘退出时显示是否停止 GUI 管理的 Harness。
- 若 Harness 是开机任务或用户手动启动的，GUI 只复用，不在退出时强杀。
- GUI 创建的子进程保留 PID 和创建标记，退出时只回收自己的进程树。

## 6. 技术架构

### 6.1 进程划分

```text
Electron Main
  ├─ SingleInstanceGuard
  ├─ AppConfigStore
  ├─ HarnessController
  │    ├─ NodeResolver
  │    ├─ PortInspector
  │    ├─ ProcessOwner
  │    ├─ ReadinessProbe
  │    └─ TokenResolver
  ├─ DiagnosticsService
  ├─ TrayService
  └─ BrowserWindow
       └─ Official Harness Web UI
```

Renderer 只负责展示启动状态、诊断和设置。所有进程启动、端口查询、日志读取和 token 处理放在 Main，通过受限的 preload API 暴露给 Renderer。

### 6.2 HarnessController 生命周期

```text
IDLE
  -> VALIDATING_CONFIG
  -> CHECKING_EXISTING_ENDPOINT
       -> REUSING_EXTERNAL_PROCESS
       -> STARTING_MANAGED_PROCESS
  -> WAITING_PORT
  -> WAITING_HTTP
  -> RESOLVING_AUTH_URL
  -> READY
  -> FAILED
```

关键规则：

1. `GET /` 返回 `401` 不能直接判定服务失败；它可能说明服务已在线但缺少 token。
2. 若已有端口，先判断是否是 Harness，再决定复用、提示或改端口。
3. 若由 GUI 启动子进程，必须监听 `error`、`exit` 和超时，并保留退出码。
4. token 应优先从当前启动输出的结构化事件或受控日志读取；读取后只保存在内存或系统凭据存储，不写入普通诊断文件。
5. `BrowserWindow.loadURL()` 必须使用带 token 的一次性 URL，或使用安全的请求头/会话注入方式，不能再固定加载裸地址。
6. 启动日志展示给用户时必须用 `token=***REDACTED***` 脱敏。

### 6.3 配置模型

V0.3 的用户配置建议保存在 Electron 的 `app.getPath('userData')` 下，而不是直接写入 `D:\DSH`：

```json
{
  "harnessRoot": "D:\\DSH",
  "harnessHome": "D:\\DSH\\.dsh",
  "nodeCommand": "D:\\Nodejs\\node.exe",
  "host": "127.0.0.1",
  "port": 3080,
  "autostart": true,
  "startMode": "reuse-or-start",
  "safeMode": false,
  "window": {
    "width": 1280,
    "height": 820
  }
}
```

token 不进入此配置文件。配置变更要进行路径存在性、Node 可执行性、端口范围和回环/局域网策略校验。

### 6.4 启动日志

每次 GUI 启动建立一份结构化记录：

- 时间、GUI 版本、DSH 版本、Node 版本。
- Harness 根目录、DSH_HOME、监听地址和端口。
- 进程 PID、是否复用、是否由 GUI 创建。
- 每个生命周期状态的开始时间、结束时间和结果。
- 错误类型、退出码和脱敏后的日志位置。

原始 Harness stdout/stderr 仍保存在 `D:\DSH\.dsh\logs`，GUI 自身记录放在 Electron 用户数据目录。诊断复制功能生成脱敏 JSON，不复制 token、API key、cookie、完整提示词或用户源代码。

## 7. 版本与插件策略

DSH `0.1.2-rc.1` 仍是预发布版本，且官方社区反馈显示工作区、Session 和插件兼容性仍可能变化。V0.3 对版本采取以下策略：

1. GUI 启动页显示精确 DSH 版本和 Git commit/tag。
2. 启动前执行版本检查和前端健康检查，不把“端口可连接”当成“功能完整”。
3. 第三方插件单独显示版本和兼容性，不随 GUI 静默安装。
4. `dsh-better-sidebar` 只有在确认当前版本的兼容矩阵和回归测试通过后，才进入可选插件阶段。
5. Safe Mode 允许在不删除用户数据的情况下禁用用户层插件，便于区分 Harness 核心故障和插件故障。
6. 升级前记录当前版本、Git commit、依赖锁文件摘要和 `.dsh` 路径；失败时优先恢复源码/依赖，而不是覆盖用户数据。

参考：[DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)、[官方中文 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md)。

## 8. 实施分阶段

### Phase 0：本轮已完成

- 更新 DSH 到 `0.1.2-rc.1`。
- 重装依赖并完成完整构建。
- 恢复 Windows 开机任务并验证监听。
- 记录 token 认证兼容问题。

### Phase 1：启动可靠性

- 抽出 `HarnessController` 状态机。
- 支持 token URL 的获取、脱敏和加载。
- 增加单实例、进程归属和端口占用诊断。
- 增加重试、重启、日志和复制诊断动作。
- 为冷启动、复用、401、端口冲突、子进程退出补测试。

### Phase 2：桌面体验

- 首次设置页、设置页和托盘。
- 开机启动设置与“只在 GUI 打开时运行”切换。
- Safe Mode 和前端插件故障提示。
- 生成 V0.3 Windows portable 包并进行重启/断网/代理环境回归。

### Phase 3：开发工作台评估

- 评估官方 Harness 新版 UI 和 `dsh-better-sidebar` 的兼容矩阵。
- 先以可选插件方式加入文件、终端、Git 和任务面板。
- 根据实际嵌入式开发工作流，再决定是否做 GUI 原生侧栏。

## 9. 验收标准

### 9.1 启动与认证

- 电脑重启后，双击 GUI 可以复用开机任务或启动一个新 Harness。
- 服务启动但 `/` 返回 401 时，GUI 能拿到 token URL 并正常加载页面。
- GUI 重复启动不会产生第二个 Harness 进程。
- 关闭 GUI 不会误杀开机任务或用户手动启动的 Harness。

### 9.2 故障恢复

- 删除或改名 `D:\DSH` 后，界面给出明确路径错误和选择目录入口。
- 占用 3080 时，界面显示 PID、进程名和端口处理选项。
- Node 路径失效时，界面显示当前路径、检测结果和重新选择入口。
- Harness 子进程提前退出时，界面显示退出码、日志位置和重试按钮。
- 插件导致页面异常时，Safe Mode 可以启动，并且不删除用户数据。

### 9.3 安全与隐私

- 默认仅监听 `127.0.0.1`。
- token 不出现在普通日志、错误页、复制诊断或 Git diff 中。
- GUI 仓库不包含 `node_modules`、完整 Harness、`.dsh` 用户数据、API key 或 session 内容。

### 9.4 嵌入式开发工作流

- 官方 Web UI 中可以选择工程目录并完成一次最小对话。
- 终端可以在工程目录中执行命令，路径和日志入口清晰。
- Git 状态、变更文件和运行日志不会遮挡中央对话区域。
- 窄窗口下启动诊断和设置仍可操作，不依赖固定宽度布局。

## 10. 已确认的产品决定

用户已确认以下三项决定，V0.3 按此范围实现：

1. **主界面策略**：是否同意 V0.3 默认继续加载官方 Harness Web UI，只把 GUI 重点放在启动、诊断、托盘和配置；文件/终端/Git 侧栏先作为可选插件评估？
2. **运行时策略**：是否同意 V0.3 继续使用外部 `D:\DSH` 和 `D:\Nodejs`，暂不把 Node/Harness 打包进安装包？
3. **网络策略**：是否同意默认只允许本机 `127.0.0.1`，局域网访问作为设置中的明确开关？

确认结果是：三项都同意。V0.3 先解决“每次重启是否能稳定打开”和“出了问题用户能否自己恢复”，再依据真实嵌入式开发反馈增加工作台功能。

## 11. 实现状态

实现计划和核心代码已经开始执行，当前交付范围包括：

- 文件级改动清单。
- token 获取和会话加载方案。
- 单实例、托盘和进程回收方案。
- 单元测试、集成测试和 Windows 手工验收步骤。
- V0.2 到 V0.3 的回退方式。

不安装第三方插件、不改写 Harness 核心源码；V0.3 仍使用外部 `D:\DSH` 和 `D:\Nodejs`。
