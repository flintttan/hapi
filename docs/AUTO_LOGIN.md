# HAPI CLI 自动登录功能

## 功能说明

新增的自动登录功能让用户可以通过用户名和密码直接在CLI完成登录和配置，无需手动在Web界面生成token并复制。

## 使用方法

### 方式1：自动登录（推荐）

```bash
hapi auth login --auto
```

这个命令会：
1. 提示输入服务器URL
2. 提示输入用户名和密码
3. 自动调用server API进行身份验证
4. 自动生成CLI token并保存到本地
5. 配置完成后，机器会在下次启动session时自动注册到server

**示例交互流程：**

```
$ hapi auth login --auto

🔐 HAPI Auto Login

This will automatically configure your CLI using your account credentials.

Step 1: Server Configuration
Server URL [http://localhost:3006]: https://your-server.com

Step 2: Account Credentials
Username: myuser
Password: ******

Step 3: Authenticating...
✓ Authentication successful

Step 4: Generating CLI token...
✓ CLI token generated

Step 5: Saving configuration...

✅ Configuration saved to /Users/username/.hapi/settings.json

Configuration summary:
  Server URL: https://your-server.com
  Username: myuser
  CLI Token: ********************...

🎉 Auto login complete!

Your machine will be automatically registered when you start a session.

You can now run:
  hapi             - Start a Claude Code session
  hapi daemon start - Start background daemon
  hapi doctor      - Check connection status
```

### 方式2：手动输入token（传统方式）

```bash
hapi auth login
```

这种方式仍然需要：
1. 先在Web界面登录
2. 在设置中生成CLI token
3. 复制token到CLI

### 方式3：完整设置向导

```bash
hapi auth setup
```

传统的设置向导，需要手动从Web获取token。

## 工作流程对比

### 旧流程（手动配置）
1. 在浏览器打开服务器URL
2. 登录Web界面
3. 导航到设置页面
4. 生成CLI token
5. 复制token
6. 在CLI运行 `hapi auth login` 或 `hapi auth setup`
7. 粘贴token
8. 机器会在启动session时自动注册

### 新流程（自动登录）
1. 在CLI运行 `hapi auth login --auto`
2. 输入服务器URL、用户名和密码
3. 自动完成配置
4. 机器会在启动session时自动注册

## 技术实现

自动登录流程包含以下步骤：

1. **用户身份验证**
   - 调用 `POST /api/auth` 获取JWT token
   - 使用用户名和密码进行验证

2. **CLI Token生成**
   - 使用JWT token调用 `POST /api/cli-tokens`
   - 自动生成并保存CLI专用token
   - Token名称为 "CLI on [hostname]"

3. **配置保存**
   - 将CLI token和服务器URL保存到 `~/.hapi/settings.json`
   - 更新运行时配置

4. **机器注册**
   - 当用户首次启动session时，机器会自动注册到server
   - 无需额外配置

## 安全注意事项

- 密码在传输过程中通过HTTPS加密（确保服务器使用HTTPS）
- CLI token存储在本地文件系统 `~/.hapi/settings.json`
- 建议在生产环境使用HTTPS连接

## 常见问题

### Q: 我还可以使用旧的手动方式吗？
A: 可以，`hapi auth login` 和 `hapi auth setup` 命令仍然保留，只是不加 `--auto` 参数即可。

### Q: 如果登录失败怎么办？
A: 命令会显示具体的错误信息，常见原因包括：
- 用户名或密码错误
- 服务器URL不正确
- 网络连接问题
- 服务器未运行

### Q: CLI token会过期吗？
A: 根据服务器配置，CLI token通常不会过期，但可以在Web界面的设置中管理和撤销。

### Q: 如何查看当前配置？
A: 运行 `hapi auth status` 查看当前的认证状态和配置信息。

### Q: 如何退出登录？
A: 运行 `hapi auth logout` 清除本地保存的凭证。

## 命令参考

```bash
# 查看帮助
hapi auth --help

# 自动登录（推荐）
hapi auth login --auto

# 手动输入token
hapi auth login

# 完整设置向导
hapi auth setup

# 查看状态
hapi auth status

# 退出登录
hapi auth logout
```

## 更新说明

这个功能是对原有登录流程的改进，主要目标是：
- 简化新用户的上手流程
- 减少在Web界面和CLI之间切换的次数
- 提供更流畅的用户体验
- 自动完成机器注册，用户可直接在Web界面连接使用
