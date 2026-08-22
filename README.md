# DSH GUI V0.2

DeepSeek Harness 的 Windows 桌面 GUI 封装。

这个项目不会把 DeepSeek Harness 本体复制进来，而是启动你本机已经安装好的 Harness 后端，然后在桌面窗口中打开 `http://127.0.0.1:3080`。

## V0.2 修复了什么

V0.1 版本的 GUI 启动后端时依赖 `pnpm.cmd`。这个命令在某些终端里能找到，但双击 exe 时不一定能找到，所以会出现 GUI 打不开、浏览器提示 `127.0.0.1:3080 拒绝连接`。

V0.2 改为直接使用稳定的 Node 路径启动 Harness：

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
dist\DSH GUI V0.2.exe
```

GUI 会检查 `127.0.0.1:3080` 是否已经有后端在运行：

- 如果已经运行，就直接复用
- 如果没有运行，就用 Node 启动 `D:\DSH` 里的 Harness 后端

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
D:\DSH_GUI\dist\DSH GUI V0.2.exe
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

## 可选环境变量

如果你的家里电脑路径不同，可以设置这些环境变量：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `DSH_GUI_HARNESS_ROOT` | DeepSeek Harness 源码目录 | `D:\DSH` |
| `DSH_GUI_HARNESS_HOME` | Harness 数据目录 | `D:\DSH\.dsh` |
| `DSH_GUI_HOST` | 后端监听地址 | `127.0.0.1` |
| `DSH_GUI_PORT` | 后端端口 | `3080` |
| `DSH_GUI_NODE` | Node.js 路径 | 自动查找 |

## 常见问题

### `127.0.0.1:3080 拒绝连接` 是什么意思？

意思是浏览器正在访问你电脑自己的 `3080` 端口，但当前没有后端程序在监听。

先检查端口：

```powershell
Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3080 -State Listen
```

如果没有输出，说明后端没起来。可以双击 GUI，或者注册上面的开机自启动任务。

### 是 VPN 或虚拟网卡导致的吗？

通常不是。只要 Harness 后端真的监听了 `127.0.0.1:3080`，浏览器就应该能打开。`拒绝连接` 更常见的原因是后端没有启动。

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
pnpm dist
```
