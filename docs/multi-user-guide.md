# HAPI 多用户管理指南

HAPI 支持两种用户认证方式，每种方式都支持多用户访问。

## 认证方式概览

### 方式 1: Telegram 认证（推荐用于多用户）
- ✅ 每个 Telegram 用户自动获得独立账号
- ✅ 通过 Telegram Mini App 安全登录
- ✅ 自动用户管理，无需手动创建
- ✅ 支持白名单控制访问

### 方式 2: CLI API Token 认证
- ⚠️ 所有使用共享 token 的用户共享同一个账号 (`cli-user`)
- ⚠️ 不推荐用于多用户场景
- ✅ 可为每个用户生成独立的 per-user token（推荐）

---

## 方式 1: Telegram 多用户设置（推荐）

### 步骤 1: 创建 Telegram Bot

1. 在 Telegram 中找到 [@BotFather](https://t.me/botfather)
2. 发送 `/newbot` 创建新 bot
3. 设置 bot 名称和用户名
4. 保存获得的 bot token（格式：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`）

### 步骤 2: 获取用户 Chat ID

1. 启动 bot（先不配置 ALLOWED_CHAT_IDS）:
   ```bash
   docker-compose down
   ```

2. 编辑 `docker-compose.yml`，添加 bot token:
   ```yaml
   environment:
     - TELEGRAM_BOT_TOKEN=你的bot_token
     # 暂时不设置 ALLOWED_CHAT_IDS
   ```

3. 启动服务器:
   ```bash
   docker-compose up -d
   ```

4. 在 Telegram 中向你的 bot 发送 `/start`
5. Bot 会回复你的 Chat ID，例如: `123456789`

### 步骤 3: 配置多用户白名单

编辑 `docker-compose.yml`，添加所有允许访问的用户 Chat ID:

```yaml
environment:
  - NODE_ENV=production
  - WEBAPP_PORT=3006
  - HAPI_HOME=/data
  - WEBAPP_URL=https://your-server.example.com
  - CORS_ORIGINS=https://your-server.example.com
  - TELEGRAM_BOT_TOKEN=你的bot_token
  - ALLOWED_CHAT_IDS=123456789,987654321,555666777  # 多个 ID 用逗号分隔
```

重启服务器:
```bash
docker-compose down && docker-compose up -d
```

### 步骤 4: 用户登录

每个白名单用户可以：

1. 在 Telegram 中向 bot 发送 `/app` 命令
2. 点击打开 Mini App
3. 自动登录到自己的独立账号

**用户隔离：**
- ✅ 每个用户有独立的 sessions
- ✅ 每个用户有独立的 messages
- ✅ 每个用户有独立的 machines
- ✅ 数据完全隔离，互不可见

---

## 方式 2: Per-User CLI Token（推荐用于 CLI 用户）

这种方式允许为每个用户生成独立的 CLI token，而不是共享一个 `CLI_API_TOKEN`。

### 方法 A: 使用 Web 界面管理 Token（推荐）

1. **登录 Web 界面**: 访问 https://your-server.example.com
   - 使用 Telegram Mini App 登录，或
   - 使用共享的 CLI_API_TOKEN 登录

2. **管理 CLI Tokens**:
   - 点击页面左上角的用户头像
   - 选择 "Manage CLI Tokens"
   - 输入 token 名称（如 "my-laptop"）并点击 "Generate"
   - **重要**: 立即复制生成的 token，它只显示一次！

3. **撤销 Token**:
   - 在 token 列表中找到需要撤销的 token
   - 点击 "Revoke" 按钮

4. **查看 Token 使用情况**:
   - Token 列表显示创建时间和最后使用时间
   - 帮助识别不活跃的 token

### 方法 B: 使用 API 管理 Token

#### 步骤 1: 使用 Telegram 登录获取 JWT

首先通过 Telegram 登录（参考方式 1），或使用共享 token 登录:

```bash
curl -X POST https://your-server.example.com/api/auth \
  -H "Content-Type: application/json" \
  -d '{"accessToken":"YOl_7ngJkB_AfvBjYCIvf1dTCbcEAbNvGZ8B5hirx8Y"}'
```

响应:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cli-user",
    "username": "CLI User",
    "firstName": "CLI User"
  }
}
```

#### 步骤 2: 为用户生成独立 Token

使用 JWT token 生成个人 CLI token:

```bash
curl -X POST https://your-server.example.com/api/cli-tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 上面获得的JWT_token" \
  -d '{"name":"我的笔记本"}'  # 可选：token 名称
```

响应:
```json
{
  "id": "token_id_12345",
  "token": "cli_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789",  // ⚠️ 仅显示一次！
  "name": "我的笔记本",
  "created_at": 1703001234000
}
```

**⚠️ 重要：** token 值只会显示一次，请立即保存！

#### 步骤 3: 使用个人 Token

在 CLI 配置中使用:

```bash
export HAPI_SERVER_URL="https://your-server.example.com"
export CLI_API_TOKEN="cli_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789"
```

#### 步骤 4: 管理 Token

**列出所有 token:**
```bash
curl https://your-server.example.com/api/cli-tokens \
  -H "Authorization: Bearer JWT_token"
```

**撤销 token:**
```bash
curl -X DELETE https://your-server.example.com/api/cli-tokens/token_id_12345 \
  -H "Authorization: Bearer JWT_token"
```

---

## 当前用户情况

### 查看所有用户

```bash
# 进入容器
docker exec -it hapi-server sh

# 查看数据库
sqlite3 /data/hapi.db "SELECT id, username, telegram_id, created_at FROM users;"
```

### 当前用户列表

基于你的配置，目前有：

1. **CLI User** (id: `cli-user`)
   - 所有使用共享 `CLI_API_TOKEN` 的用户都映射到这个账号
   - 不推荐用于多用户场景

---

## 推荐的多用户方案

### 场景 1: 团队协作（Telegram）

**适合：** 内部团队，需要安全隔离

```yaml
environment:
  - TELEGRAM_BOT_TOKEN=你的bot_token
  - ALLOWED_CHAT_IDS=alice_id,bob_id,charlie_id
  - WEBAPP_URL=https://your-server.example.com
```

**优势：**
- 每个成员有独立账号
- 通过 Telegram 白名单控制访问
- 数据完全隔离

### 场景 2: 个人多设备（Per-User Tokens）

**适合：** 个人用户，多台设备

**使用 Web 界面**（推荐）:
1. 通过 Telegram 登录 Web 界面
2. 在页面左上角点击用户头像
3. 选择 "Manage CLI Tokens"
4. 为每台设备生成独立 token:
   - `work-laptop`
   - `home-desktop`
   - `ci-server`
5. 复制生成的 token 并配置到对应设备
6. 可随时在 Web 界面撤销某个设备的访问权限

**使用 API**:
1. 通过 Telegram 登录获取 JWT token
2. 调用 `POST /api/cli-tokens` 生成个人 token
3. 每个设备使用独立 token
4. 可随时撤销某个设备的访问权限

---

## 安全最佳实践

### ✅ DO（推荐）

1. 使用 Telegram 认证进行多用户管理
2. 为每个 CLI 用户生成独立的 per-user token
3. 定期审查和撤销不用的 token
4. 使用有意义的 token 名称（如设备名）
5. 设置强 `CLI_API_TOKEN`（仅用于初始登录）

### ❌ DON'T（不推荐）

1. 不要在多人团队中共享同一个 `CLI_API_TOKEN`
2. 不要将 token 提交到 git 仓库
3. 不要在日志中记录完整 token
4. 不要使用默认或弱 token

---

## 迁移指南：从共享 Token 到多用户

### 当前状态
所有 CLI 用户共享同一个 token，映射到 `cli-user` 账号。

### 迁移步骤

1. **启用 Telegram 认证**
   ```yaml
   environment:
     - TELEGRAM_BOT_TOKEN=你的bot_token
     - ALLOWED_CHAT_IDS=你的chat_id
   ```

2. **为每个用户生成 per-user token**
   - 每个用户通过 Telegram 登录
   - 调用 `POST /api/cli-tokens` 生成个人 token
   - 更新各自的 CLI 配置

3. **撤销共享 token**（可选）
   - 删除或更改 `CLI_API_TOKEN`
   - 强制所有用户使用个人 token

---

## 故障排查

### 问题：登录后看不到其他用户的 sessions

**原因：** 这是正常的！每个用户只能看到自己的数据。

### 问题：Telegram 登录失败

**检查清单：**
1. `TELEGRAM_BOT_TOKEN` 是否正确
2. `ALLOWED_CHAT_IDS` 包含你的 Chat ID
3. `WEBAPP_URL` 是否配置为 HTTPS URL
4. 服务器是否已重启

### 问题：无法生成 per-user token

**可能原因：**
1. JWT token 已过期（15分钟有效期）
2. 未提供 Authorization header
3. 用户 ID 不存在

---

## API 参考

### 认证端点

**POST /api/auth**
```bash
# Telegram 认证
{"initData": "telegram_init_data"}

# Token 认证
{"accessToken": "cli_api_token"}
```

### Per-User Token 端点

**POST /api/cli-tokens**
```bash
# 创建 token
{"name": "optional_token_name"}
```

**GET /api/cli-tokens**
```bash
# 列出用户的所有 token（不含 token 值）
```

**DELETE /api/cli-tokens/:id**
```bash
# 撤销指定 token
```

所有 token 端点都需要 JWT 认证（Authorization: Bearer {jwt_token}）。
