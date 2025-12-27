# HAPI 多用户模式快速入门指南

本指南将帮助您快速开始使用 HAPI 的多用户模式。

## 前提条件

- HAPI Server 已部署并运行（例如：https://your-server.example.com/）
- 您可以访问该服务器的 Web 界面

## 步骤 1: 注册账户

1. 在浏览器中打开 HAPI Server URL（例如：https://your-server.example.com/）
2. 点击 "Register" 注册新账户
3. 填写以下信息：
   - **Username**: 您的用户名（唯一）
   - **Password**: 密码（至少 8 个字符）
   - **Email** (可选): 电子邮件地址

4. 点击 "Register" 完成注册

## 步骤 2: 登录并生成 CLI Token

1. 使用您刚注册的用户名和密码登录
2. 登录后，点击右上角（桌面端）或左上角（移动端）的头像图标
3. 在下拉菜单中选择 **"Manage CLI Tokens"**
4. 在 Token 管理对话框中：
   - 输入 Token 名称（例如："my-laptop"、"work-mac"）- 可选但推荐
   - 点击 **"Generate"** 按钮
5. **重要**: 新生成的 Token 会显示在黄色警告框中
   - 点击 **"Copy Token"** 按钮复制 Token
   - ⚠️ **Token 只显示一次**，请立即保存到安全位置
   - 关闭警告框后将无法再次查看该 Token

## 步骤 3: 下载 CLI 程序

根据您的操作系统下载对应的 CLI 可执行文件：

### macOS

**ARM64 (M1/M2/M3 芯片)**:
```bash
# 从 Releases 页面下载
curl -L -o hapi https://github.com/tiann/hapi/releases/download/v0.2.1/hapi-darwin-arm64
chmod +x hapi

# 移除 macOS 隔离属性
xattr -d com.apple.quarantine ./hapi
```

**x64 (Intel 芯片)**:
```bash
curl -L -o hapi https://github.com/tiann/hapi/releases/download/v0.2.1/hapi-darwin-x64
chmod +x hapi
xattr -d com.apple.quarantine ./hapi
```

### Linux

**ARM64**:
```bash
curl -L -o hapi https://github.com/tiann/hapi/releases/download/v0.2.1/hapi-linux-arm64
chmod +x hapi
```

**x64**:
```bash
curl -L -o hapi https://github.com/tiann/hapi/releases/download/v0.2.1/hapi-linux-x64
chmod +x hapi
```

### Windows

**x64**:
```powershell
# 从 Releases 页面下载 hapi-windows-x64.exe
Invoke-WebRequest -Uri https://github.com/tiann/hapi/releases/download/v0.2.1/hapi-windows-x64.exe -OutFile hapi.exe
```

或直接访问 [Releases 页面](https://github.com/tiann/hapi/releases) 下载。

## 步骤 4: 配置 CLI

运行交互式配置向导：

```bash
./hapi auth setup
```

按照提示输入：

1. **Server URL**: HAPI Server 的完整 URL（例如：`https://your-server.example.com`）
   - 必须包含 `http://` 或 `https://`
   - 默认端口 3006

2. **CLI Token**: 粘贴您在步骤 2 中复制的 Token

配置完成后，设置信息会保存到 `~/.hapi/settings.json`（Windows: `%USERPROFILE%\.hapi\settings.json`）

### 验证配置

检查配置状态：

```bash
./hapi auth status
```

应该显示：
```
Direct Connect Status

  HAPI_SERVER_URL: https://your-server.example.com
  CLI_API_TOKEN: set
  Token Source: settings file
  Machine ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Host: your-hostname
```

## 步骤 5: 启动 CLI 会话

现在您可以启动 Claude Code 会话：

```bash
./hapi
```

首次运行时：
- CLI 会自动向服务器注册当前机器
- 生成唯一的 Machine ID
- 建立与服务器的连接

## 步骤 6: 在 Web 界面控制会话

1. 回到浏览器中的 HAPI Web 界面
2. 您应该能看到：
   - 已注册的机器列表（在 "Machines" 页面）
   - 当前运行的会话
3. 点击会话可以：
   - 查看会话消息和输出
   - 远程发送消息给 Claude
   - 审批工具权限请求
   - 查看文件更改和 git diff
   - 控制会话状态

## 常见命令

### 管理 Token

```bash
# 查看配置状态
./hapi auth status

# 重新登录（更新 Token）
./hapi auth login

# 退出登录（清除本地 Token）
./hapi auth logout
```

### 启动不同的 AI 模式

```bash
# Claude Code（默认）
./hapi

# OpenAI Codex
./hapi codex

# Google Gemini
./hapi gemini
```

### 后台守护进程

```bash
# 启动守护进程
./hapi daemon start

# 停止守护进程
./hapi daemon stop

# 查看守护进程状态
./hapi daemon status
```

### 系统诊断

```bash
# 运行诊断工具
./hapi doctor
```

## 高级配置

### 使用环境变量

您也可以通过环境变量配置（优先级高于 settings.json）：

```bash
export HAPI_SERVER_URL="https://your-server.example.com"
export CLI_API_TOKEN="your-token-here"
./hapi
```

### 自定义 HAPI 主目录

```bash
export HAPI_HOME="$HOME/custom-hapi-dir"
./hapi
```

### 权限模式

```bash
# 绕过所有权限检查（谨慎使用）
./hapi --yolo

# 使用特定权限模式
./hapi --permission-mode acceptEdits
```

## 故障排除

### Token 无效

如果遇到 "Session expired" 或 "401 Unauthorized" 错误：

1. 在 Web 界面重新生成一个新的 CLI Token
2. 运行 `./hapi auth login` 更新本地配置
3. 重新启动 CLI

### 无法连接到服务器

1. 检查服务器 URL 是否正确：`./hapi auth status`
2. 验证服务器是否运行：`curl https://your-server.example.com/`
3. 检查网络连接和防火墙设置

### Machine ID 冲突

如果需要重新注册机器：

```bash
# 清除 Machine ID
./hapi auth logout

# 重新配置
./hapi auth setup
```

## 安全建议

1. **保护您的 Token**
   - Token 提供完全访问权限，请勿分享
   - 定期轮换 Token（撤销旧的，生成新的）
   - 不要将 Token 提交到版本控制系统

2. **Token 管理**
   - 为不同机器使用不同的 Token（便于管理和撤销）
   - 在 Web 界面定期检查和清理不再使用的 Token
   - 查看 "Last Used" 时间来识别过期的 Token

3. **服务器安全**
   - 确保服务器使用 HTTPS
   - 使用强密码
   - 考虑启用双因素认证（如果支持）

## 下一步

- 探索 [CLI 完整文档](../cli/README.md)
- 了解 [服务器配置](../server/README.md)
- 查看 [Web 界面功能](../web/README.md)
- 阅读 [架构说明](WHY_NOT_HAPPY.md)

## 获得帮助

- 查看 [GitHub Issues](https://github.com/tiann/hapi/issues)
- 查看 [文档](https://github.com/tiann/hapi)
- 运行 `./hapi --help` 查看所有命令
- 运行 `./hapi doctor` 进行系统诊断
