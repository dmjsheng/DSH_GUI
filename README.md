# DSH GUI V0.3

DeepSeek Harness `0.1.2-rc.1` 的 Windows 桌面 GUI 封装。

这个项目不会把 DeepSeek Harness 本体复制进来，而是启动或复用你本机已经安装好的 Harness 后端，然后在桌面窗口中打开官方 Web UI。

## V0.3 做了什么

V0.3 解决了新版 Harness 默认启用 Web token 后，GUI 把“服务在线但需要认证”误判为“服务没有启动”的问题。

- 启动时识别 HTTP `401`，从 Harness 启动日志中找到带 token 的访问地址。
- GUI 自己写入的日志和复制的诊断信息会脱敏，不保存 token。
- 如果 Windows 任务已经启动 Harness，GUI 会复用它，不重复拉起，也不会误杀外部进程。
- 窗口关闭后默认留在托盘，第二次双击只聚焦已有窗口。
- 设置页支持 Harness 目录、Node 路径、端口、自动启动和局域网访问开关。
- 局域网访问默认关闭，只有明确开启后，GUI 启动的 Harness 才会监听 `0.0.0.0`。

GUI 启动后端时使用稳定的 Node 路径：

- 优先使用环境变量 `DSH_GUI_NODE`
- Windows 默认优先找 `D:\Nodejs\node.exe`
- 其次找 `C:\Program Files\nodejs\node.exe`
- 最后退回 `node.exe`

## 默认安装路径

推荐保持下面的路径，最省心：

- DeepSeek Harness：`D:\DSH`
- DSH GUI：`D:\DSH_GUI`
- Node.js：`D:\Nodejs\node.exe`
- Harness 数据目录：`D:\DSH\.dsh`
- Web 地址：`http://127.0.0.1:3080`

## 使用方式

如果已经有打包好的 exe，直接双击：

```text
dist\DSH GUI V0.3.exe
```

GUI 会检查 `127.0.0.1:3080` 是否已经有后端在运行：

- 如果已经运行，就直接复用
- 如果没有运行，就用 Node 启动 `D:\DSH` 里的 Harness 后端

## 新版 Harness 的 token 认证

`0.1.2-rc.1` 启动后，直接访问 `http://127.0.0.1:3080` 可能返回 `401 Unauthorized`。这不代表后端坏了，而是需要启动日志中带 token 的访问地址。

V0.3 会自动读取类似下面的访问地址，并只把它用于当前 Electron 窗口：

```text
http://127.0.0.1:3080/?token=...
```

界面、普通日志和“复制诊断”不会显示完整 token。不要把带 token 的地址发给别人；它相当于当前 Harness 的访问凭证。

## 从源码运行

```powershell
cd D:\DSH_GUI
pnpm install
pnpm start
```

## 打包

```powershell
cd D:\DSH_GUI
pnpm dist
```

打包结果会生成到：

```text
D:\DSH_GUI\dist\DSH GUI V0.3.exe
```

## 开机自动启动后端

如果你希望重启电脑后直接打开网页 `http://127.0.0.1:3080` 也能用，可以注册当前用户登录自启动任务：

```powershell
cd D:\DSH_GUI
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-dsh-autostart.ps1
```

注册后，Windows 登录时会自动运行：

```text
scripts\start-dsh-harness-web-once.ps1
```

这个脚本只会在 `3080` 没有监听时启动后端，不会重复开多个 Harness。

取消自启动：

```powershell
cd D:\DSH_GUI
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\unregister-dsh-autostart.ps1
```

开机任务会读取 GUI 保存的配置。修改了端口或局域网开关后，建议先在“任务计划程序”中重启 `DSH Harness Web`，再打开 GUI；GUI 不会强制终止由任务或其他程序管理的 Harness。

## 局域网访问开关

默认关闭时，Harness 只监听 `127.0.0.1`，只有本机能访问。

开启后，Harness 会监听 `0.0.0.0`，同一局域网的其他设备可以通过本机局域网 IP 和 `3080` 端口访问。访问仍然需要 token，所以不要把端口映射到公网，也不要把 token 地址发给别人。

这是一个手动开关，不是 VPN 开关：它只改变 Harness 的监听范围。勾选后需要重新启动后端才会生效；如果当前后端来自 Windows 任务，请重启该任务。

## 可选环境变量

如果你的家里电脑路径不同，可以设置这些环境变量：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `DSH_GUI_HARNESS_ROOT` | DeepSeek Harness 源码目录 | `D:\DSH` |
| `DSH_GUI_HARNESS_HOME` | Harness 数据目录 | `D:\DSH\.dsh` |
| `DSH_GUI_HOST` | 后端监听地址 | `127.0.0.1` |
| `DSH_GUI_PORT` | 后端端口 | `3080` |
| `DSH_GUI_NODE` | Node.js 路径 | 自动查找 |
| `DSH_GUI_LAN_ACCESS` | 是否监听所有网络接口 | `false` |

## 常见问题

### `127.0.0.1:3080 拒绝连接` 是什么意思？

意思是浏览器正在访问你电脑自己的 `3080` 端口，但当前没有后端程序在监听。

先检查端口：

```powershell
Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3080 -State Listen
```

如果没有输出，说明后端没起来。可以双击 GUI，或者注册上面的开机自启动任务。

### 是 VPN 或虚拟网卡导致的吗？

通常不是。GUI 会优先探测回环地址 `127.0.0.1:3080`。`拒绝连接` 更常见的原因是后端没有启动；如果打开了局域网访问，VPN 只可能影响其他设备选择哪一个局域网 IP，不会让本机回环地址凭空消失。

### 日志在哪里？

默认在：

```text
D:\DSH\.dsh\logs
```

GUI 启动后端的日志文件通常是：

```text
gui-web.out.log
gui-web.err.log
```

开机自启动脚本的日志文件会以 `startup-web-` 开头。

## 开发验证

```powershell
pnpm test
pnpm build
pnpm dist
```
