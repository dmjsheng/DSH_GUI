# DeepSeek Harness GUI 参考项目调研

调研日期：2026-09-08

## 结论

GitHub 上已经出现了多款真正围绕 DeepSeek Harness 构建的桌面 GUI。其中，最适合 `DSH_GUI` 参考的不是某一个完整仓库，而是三类能力的组合：

1. 用 `anywhere-labs/dsh-desktop` 参考桌面产品的启动、设置、恢复、托盘和更新流程。
2. 用 `omdsh-dev/DSH-better-sidebar` 参考最接近 Codex 的文件、终端、Git、任务和侧边对话工作台。
3. 用 `desktop-cc-gui` 参考整洁的三栏布局、会话组织、输入框和工具执行卡片，但不要照搬它的多引擎架构。

当前 `D:\DSH_GUI` 是一个轻量 Electron 壳，负责启动外部 `D:\DSH` 并加载官方 Web UI。最稳妥的演进路线是继续保留这个边界，先增强启动诊断和桌面交互，再考虑 Harness 插件和自带运行时。

## 候选项目

### 1. anywhere-labs/dsh-desktop

- 仓库：[anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop)
- 类型：真正的 DeepSeek Harness 桌面产品，MIT License。
- GitHub 页面快照：约 24.2k stars、1.2k forks；数字会随时间变化。
- 核心做法：固定并运行一份上游 Harness，通过插件机制组合桌面窗口、托盘、终端、更新、工作配置和插件市场。
- 值得借鉴：首次设置向导、启动/停止/恢复、系统托盘、浏览器与局域网访问分离、更新通道、插件市场、安全提示。
- 不建议直接搬入：整个仓库规模很大，包含固定的 Harness 子模块和完整插件生态；直接合并会让轻量 `DSH_GUI` 变成长期维护的上游 fork。

第一方证据：README 明确说明它自动管理 Harness 服务、无需单独 Node.js，并提供首次设置、恢复和插件化桌面能力。见[项目 README](https://github.com/anywhere-labs/dsh-desktop#readme)。

### 2. omdsh-dev/DSH-better-sidebar

- 仓库：[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
- 类型：Harness Web UI 插件，不是独立桌面壳，MIT License。
- 核心做法：在现有 Harness 会话旁增加右侧栏和底部面板，并向其他插件开放 `ctx.betterSidebar` 扩展接口。
- 值得借鉴：文件树、CodeMirror 编辑/预览、真实终端、Git diff、当前回合文件变化、后台任务、子代理拓扑、侧边对话、可停靠标签页和窄屏抽屉。
- 这是目前最接近 Codex 工作台布局的 Harness 项目。
- 兼容性限制：当前正式版要求 DSH `0.1.2-rc.1+`；旧版 Harness 需要固定旧插件版本。README 说明 `dsh-better-sidebar@0.17.1` 只覆盖 `0.1.0-rc.8` 到 `0.1.1-rc.2`。

本机核对：`D:\DSH\package.json` 当前是 `0.1.0-rc.5`，比该插件公开支持范围更早，因此不能直接安装最新版，也不应在工作环境中试装。

第一方证据：[功能与兼容性说明](https://github.com/omdsh-dev/DSH-better-sidebar#readme)。

### 3. ningbainb/deepseek-harness-desktop

- 仓库：[ningbainb/deepseek-harness-desktop](https://github.com/ningbainb/deepseek-harness-desktop)
- 类型：功能较完整的 Windows Harness 桌面客户端，BSD-3-Clause License。
- 检索快照：约 386 stars、15 forks，仍在快速更新。
- 值得借鉴：任务看板、定时任务、Token/费用/缓存看板、文件与 SCM 右侧面板、Codex/Claude 项目导入、启动阶段可见、插件故障隔离和回滚。
- 视觉评价：基础工作区清爽，信息结构完整；部分皮肤和桌宠会增加视觉噪声，不适合作为嵌入式开发工具的默认界面。
- 风险：它已经成为重度定制的完整发行版，功能面很大，不能把全部特性当成 V0.3 的范围。

第一方证据：[项目 README](https://github.com/ningbainb/deepseek-harness-desktop#readme) 和[桌面架构说明](https://github.com/ningbainb/deepseek-harness-desktop/blob/main/docs/desktop.md)。

### 4. zhukunpenglinyutong/desktop-cc-gui

- 仓库：[zhukunpenglinyutong/desktop-cc-gui](https://github.com/zhukunpenglinyutong/desktop-cc-gui)
- 类型：Tauri 多引擎 AI 编程客户端，MIT License；DSH 只是其中一个原生引擎，不是 Harness Web UI 套壳或插件。
- GitHub 页面快照：约 4.2k stars、368 forks；数字会随时间变化。
- 值得借鉴：左侧项目/会话、中央对话与输入框、文件/终端/Git 开发面板、全局搜索、计划面板、上下文和用量展示、排队追问。
- 不适合直接照搬：它重新实现统一前端并适配多个运行时，维护成本远高于加载官方 Harness UI 的方案。

第一方证据：[项目 README](https://github.com/zhukunpenglinyutong/desktop-cc-gui#readme) 明确说明 DSH 通过 `dsh-host-rpc` 接入，并非 DSH 插件或换皮 Web UI。

### 5. dataelement/dsh-desktop

- 仓库：[dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop)
- 类型：local-first 跨平台 Harness 桌面应用，MIT License。
- 值得借鉴：随机本机端口、启动与前端插件故障识别、`harness.log`、引导式恢复、非破坏性 Safe Mode、原生目录选择器、更新前确认。
- 对 `DSH_GUI` 的价值主要是可靠性和故障恢复，而不是主界面视觉。

第一方证据：[项目 README](https://github.com/dataelement/dsh-desktop#readme)。

### 6. ZgblKylin/dsh-gui

- 仓库：[ZgblKylin/dsh-gui](https://github.com/ZgblKylin/dsh-gui)
- 类型：Tauri 薄壳加插件集合，Unlicense。
- 值得借鉴：VS Code 风格连接标签、本机/远程/SSH/Docker 后端连接、启动就绪探测、Windows Job Object 进程树回收、更新对话框和 GUI 日志。
- 视觉评价：连接框架很有想法，但示例皮肤装饰性过强；适合借交互结构，不适合照搬默认视觉。
- 成熟度：检索时只有少量关注，且没有稳定 Release，不应作为核心依赖。

第一方证据：[项目 README](https://github.com/ZgblKylin/dsh-gui#readme)。

## 推荐的 V0.3 范围

### 优先实现

1. 启动进度明确显示“检查 Harness 目录、检查 Node、启动服务、等待页面、已连接”。
2. 失败页增加“重试”“重启后端”“打开日志目录”“复制诊断信息”“选择 Harness 目录”。
3. 底部状态区显示后端状态、DSH 版本、端口和当前工作区；异常时可以直接进入诊断页。
4. 增加单实例和系统托盘，关闭窗口时不误杀用户单独启动的 Harness。
5. 把路径和端口从环境变量升级为可视化设置，并保留当前 `D:\DSH`、`D:\DSH\.dsh` 默认值。
6. 保持官方 Harness 会话界面，不在 V0.3 重新实现聊天、模型和 Session 协议。

### 在兼容性验证后再做

1. 在独立目录中升级并验证新 Harness，再评估安装 `dsh-better-sidebar`。
2. 新版 Harness 验证通过后，考虑随机空闲端口或由进程输出返回实际 URL，避免固定 `3080` 冲突。
3. 等桌面壳稳定后再考虑自带 Node/Harness 运行时和自动更新；这会显著增加安装包、发布和上游同步成本。

### 暂不建议

1. 直接 fork `anywhere-labs/dsh-desktop` 或 `ningbainb/deepseek-harness-desktop` 覆盖现有仓库。
2. 一次性加入任务看板、SSH、移动端、插件市场、桌宠和多套皮肤。
3. 在没有版本兼容测试的情况下，把最新插件装进当前 `0.1.0-rc.5` 环境。
4. 把完整 Node、Harness 和依赖直接提交到当前 GitHub 仓库。

## 许可证边界

可以参考产品结构和交互思路后独立实现。若直接复制代码或资源，必须逐个遵守来源许可证并保留相应版权/许可证声明：`anywhere-labs`、`dataelement`、`desktop-cc-gui`、`DSH-better-sidebar` 为 MIT，`ningbainb` 为 BSD-3-Clause，`ZgblKylin/dsh-gui` 为 Unlicense。图片、品牌和第三方插件还可能有单独许可，不能仅凭主仓库许可证推定全部可复制。

## 调研边界

- 以上结论来自仓库 README、架构文档、源码目录、GitHub 元数据和 README 实际截图。
- Harness 官方仍处于快速迭代期并明确提示可能有破坏兼容性的变更：[官方中文 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md)。
- 本次没有安装第三方 GUI、没有运行其发行包，也没有对其安全性做完整代码审计。
