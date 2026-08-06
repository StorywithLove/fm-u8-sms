# fm-u8-sms：飞猫U8 / 飞猫u8 短信读取工具

适用于飞猫U8（也常写作飞猫u8、飞猫 U8、飞猫 FM U8、Flymodem U8）的本地短信读取工具，并提供一个类似短信 App 的本地网页收件箱。项目使用设备现有的 Digest 登录和局域网 XML 接口，不刷机、不修改固件，也不绕过后台认证。

已在飞猫 FM U8（PXA1802 主芯片、USB Remote NDIS 模式）上验证。其他固件或相近设备可能使用类似接口，但尚未验证。

## 功能

- 本地网页展示历史短信、未读短信和新短信
- 搜索短信，按全部/未读筛选，逐条或全部标记为本地已读
- 显示设备连接状态、运营商、设备未读数和主芯片名称
- 自动解码 U8 使用的 UCS-2 十六进制号码和正文
- 低频轮询；未读数变化或定期校对时才读取收件箱
- 本地 JSON 历史记录，消息指纹去重
- Windows 登录后自动启动脚本
- 纯 Node.js 实现，无第三方运行时依赖

本项目只实现接收和查看，不发送、删除或修改设备中的短信。

## 环境要求

- Node.js 20 或更新版本
- 电脑通过 USB 或 Wi-Fi 能访问 `http://192.168.0.1`
- U8 管理员密码

## 快速开始

```powershell
Copy-Item .env.example .env
notepad .env
npm.cmd test
npm.cmd run status
npm.cmd run list
npm.cmd start
```

浏览器打开 <http://127.0.0.1:8788>。网页服务启动后会立即同步一次，之后保持低频轮询；即使 U8 暂时断开，已经保存的历史短信仍然可以查看。

`.env` 至少需要配置：

```dotenv
FM_U8_BASE_URL=http://192.168.0.1
FM_U8_USERNAME=admin
FM_U8_PASSWORD=replace-with-your-device-password
```

不要把 `.env` 上传到 GitHub。建议修改设备的默认管理密码。

## 命令

```powershell
# 查看设备、网络和短信计数状态
npm.cmd run status

# 在终端读取收件箱
npm.cmd run list

# 启动本地网页收件箱（推荐）
npm.cmd start

# 仅在终端持续监听新短信
npm.cmd run watch

# 运行完整检查
npm.cmd run check
```

历史短信保存在 `data/inbox.json`。该目录已被 Git 忽略，但文件包含短信正文、号码和可能出现的验证码，请只在受信任的本机账户中使用并妥善备份。

网页中的“未读”是本项目自己的本地阅读状态，不会修改 U8 设备里的短信状态。首次同步时，设备中现存的短信会作为未读历史导入。

## Windows 自动启动

先手动运行 `npm.cmd start` 并确认网页正常，再执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

这个脚本会在 Windows“任务计划程序库”中创建或更新名为 `FmU8SmsBridge` 的任务。任务使用当前 Windows 用户、有限权限，在该用户登录后通过隐藏的 PowerShell 包装器启动本地网页服务；进程意外退出时每分钟重试。它不会显示持续驻留的 CMD 窗口，不会在登录前运行，也不会把网页暴露给局域网。

不需要再手工创建任务。安装后可以打开“任务计划程序”查看，也可以用以下命令验收：

```powershell
Get-ScheduledTask -TaskName FmU8SmsBridge
Start-ScheduledTask -TaskName FmU8SmsBridge
Get-ScheduledTaskInfo -TaskName FmU8SmsBridge
```

启动任务后直接访问 <http://127.0.0.1:8788>，无需保留终端窗口。任务自身保持 `Running` 状态属于正常现象；如果以前安装的版本会显示 CMD 窗口，请重新运行安装脚本以更新任务动作。

卸载任务（不会删除项目、配置或短信历史）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

如果移动了项目目录或 Node.js 安装位置，请重新运行安装脚本，使任务记录新的路径。

如果更新旧任务时出现 `Access is denied`，说明该任务最初由管理员会话创建。请右键以管理员身份打开 PowerShell，进入项目目录后重新执行安装命令；后续启动和查看任务不需要保持管理员窗口。

## 配置

`.env.example` 列出了全部配置项。常用项：

- `FM_U8_WEB_PORT`：本地网页端口，默认 `8788`
- `FM_U8_POLL_INTERVAL_MS`：状态轮询间隔，默认 `15000`
- `FM_U8_RECONCILE_INTERVAL_MS`：完整收件箱校对间隔
- `FM_U8_INBOX_FILE`：网页历史数据库路径，默认 `./data/inbox.json`
- `FM_U8_OUTPUT_FILE`：可选的 CLI watch JSON Lines 输出文件

为了保护短信隐私，网页监听地址只能是 `127.0.0.1` 或 `localhost`。

## 工作原理

1. 请求 `/login.cgi` 获取 Digest 参数。
2. 按设备现有的 `/cgi/protected.cgi` 登录流程完成认证。
3. 读取设备状态中的短信未读计数。
4. 需要同步时，向短信模块提交只读的 `GET_RCV_SMS_LOCAL` 操作。
5. 解析返回的消息列表，解码号码和正文，写入本地收件箱。

虽然设备接口的 URL 参数包含 `method=set`，请求体中的操作是 `GET_RCV_SMS_LOCAL`；实机测试中，读取前后的设备未读计数保持不变。

## 安全与隐私

- 只在本人拥有或得到明确授权的设备和 SIM 卡上使用。
- 网页只监听本机回环地址，并检查 Host、Origin 和浏览器跨站请求标记。
- 页面无云端服务、无分析代码、无外部字体或资源。
- 项目源码不记录或展示 IMEI、ICCID 等设备身份标识。
- `.env`、`data/`、日志、抓包、固件和设备身份数据均被排除在公开仓库之外。
- 短信内容用 `textContent` 显示，并通过严格的内容安全策略限制页面能力。
- 默认轮询频率温和，不对设备发起高频请求。

公开仓库中请勿提交真实密码、IMEI、ICCID、手机号、短信截图、短信历史、抓包、厂商网页资源或完整固件。

## 兼容性与风险

短信读取接口是设备中已有、但当前管理页面未展示的本地功能，并非厂商承诺长期稳定的公开 API。未来固件可能重命名、限制或删除它。项目刻意不提供群发、认证绕过、固件修改或远程暴露管理接口等功能，但无法保证任何未来固件版本继续兼容。

## 冷启动认证

从 `v0.1.2` 起，服务会按照 U8 官方管理页的 Digest 计数顺序完成登录。电脑或 U8 刚重启后，计划任务可直接恢复短信同步，不需要先手工打开并登录 `http://192.168.0.1`，也不会在后台启动或控制浏览器。

如果旧版本在设备重启后显示“离线”，而手工登录 U8 管理页后恢复，请更新到最新版本并重新启动 `FmU8SmsBridge` 任务。若更新后仍然离线，再检查 U8 地址、管理员密码和 USB/Wi-Fi 连接。

## License

[MIT](LICENSE)
