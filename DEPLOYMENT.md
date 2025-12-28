# HAPI Deployment Guide

This document describes how to deploy hapi Docker images to GitHub Container Registry and publish the CLI to npm.

## Quick Overview

- **Docker Images**: Automatically built and pushed to GHCR on version tag push
- **npm Package**: `@twsxtd/hapi` with platform-specific binaries
- **GitHub Registry**: `ghcr.io/flintttan/hapi-server`
- **Repository**: `flintttan/hapi`
- **Automation**: GitHub Actions handles all deployments

## 部署完成状态

✅ **Docker镜像已构建并部署成功**

- **镜像名称**: `ghcr.io/flintttan/hapi-server:latest`
- **本地测试**: `hapi-hapi-server:latest`
- **镜像大小**: 324MB
- **构建时间**: 2025-12-28

## 已包含的新功能

本次部署包含了最新的自动登录功能：
- ✅ CLI自动登录命令 (`hapi auth login --auto`)
- ✅ 用户名密码认证
- ✅ 自动CLI token生成
- ✅ 机器自动注册

---

# Docker Image Deployment

## GitHub Container Registry (GHCR)

### Automatic Deployment

Docker images are automatically built and pushed when you create a version tag:

```bash
# Create and push a version tag
git tag v0.3.1
git push origin v0.3.1
```

This triggers `.github/workflows/docker-server.yml` which will:
1. Build Docker images for `linux/amd64` and `linux/arm64`
2. Push to GHCR with multiple tags:
   - `ghcr.io/flintttan/hapi-server:v0.3.1` (version)
   - `ghcr.io/flintttan/hapi-server:0.3` (major.minor)
   - `ghcr.io/flintttan/hapi-server:main` (branch)
   - `ghcr.io/flintttan/hapi-server:sha-abc123` (commit)

### Manual Trigger

You can also manually trigger the workflow:
1. Go to GitHub Actions → Docker (server)
2. Click "Run workflow"
3. Select branch and confirm

### Configuration

**Workflow**: `.github/workflows/docker-server.yml`
**Dockerfile**: `server/Dockerfile`
**Platforms**: `linux/amd64`, `linux/arm64`
**Registry**: `ghcr.io`

### Using Published Images

```bash
# Pull the latest image
docker pull ghcr.io/flintttan/hapi-server:latest

# Pull specific version
docker pull ghcr.io/flintttan/hapi-server:v0.3.0

# Run the container
docker run -d \
  -p 3006:3006 \
  -v hapi-data:/data \
  -e WEBAPP_PORT=3006 \
  -e HAPI_HOME=/data \
  ghcr.io/flintttan/hapi-server:latest
```

---

# npm Package Deployment

## Package Structure

- **Main Package**: `@twsxtd/hapi`
- **Platform Packages**:
  - `@twsxtd/hapi-darwin-arm64` (macOS Apple Silicon)
  - `@twsxtd/hapi-darwin-x64` (macOS Intel)
  - `@twsxtd/hapi-linux-arm64` (Linux ARM64)
  - `@twsxtd/hapi-linux-x64` (Linux x64)
  - `@twsxtd/hapi-win32-x64` (Windows x64)

## Automatic Deployment (GitHub Actions)

### Prerequisites

1. **Create npm Access Token**:
   - Go to https://www.npmjs.com/settings/{username}/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token

2. **Add Secret to GitHub**:
   - Go to repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: (paste your npm token)
   - Click "Add secret"

### Release Process

When you push a version tag, the release workflow will automatically:
1. Build platform-specific binaries
2. Create GitHub Release
3. Publish all packages to npm
4. Update Homebrew formula

```bash
# Complete automated release
git tag v0.3.1
git push origin v0.3.1

# GitHub Actions will:
# ✓ Build binaries for all platforms
# ✓ Publish @twsxtd/hapi-{platform} packages
# ✓ Publish @twsxtd/hapi main package
# ✓ Create GitHub Release with downloads
# ✓ Build and push Docker images to GHCR
```

## Manual Deployment

### Using the Release Script

```bash
# Ensure you're on main branch
git checkout main
git pull

# Login to npm
npm login

# Run complete release
cd cli
bun run release-all 0.3.1
```

This will:
1. Update version in `package.json`
2. Build all platform binaries with embedded web
3. Publish platform packages to npm
4. Publish main package to npm
5. Create git commit and tag
6. Push to GitHub

### Script Options

```bash
# Dry run (preview without publishing)
bun run release-all 0.3.1 --dry-run

# Publish to npm only (skip git operations)
bun run release-all 0.3.1 --publish-npm

# Skip building (use existing binaries)
bun run release-all 0.3.1 --skip-build

# Combine options
bun run release-all 0.3.1 --publish-npm --skip-build
```

### Publish Only to npm (After Tag Exists)

If you've already pushed the tag but need to republish to npm:

```bash
cd cli

# Ensure binaries are built
bun run build:single-exe:all

# Publish to npm only
bun run release-all 0.3.1 --publish-npm --skip-build
```

---

# Complete Release Workflow

## Step-by-Step Guide

### 1. Prepare Release

```bash
# Ensure clean working directory
git status

# Pull latest changes
git checkout main
git pull

# Login to npm
npm login

# Verify login
npm whoami
```

### 2. Run Release Script

```bash
cd cli
bun run release-all 0.3.1
```

The script will:
- ✓ Verify you're on main branch
- ✓ Verify npm login
- ✓ Update package.json version
- ✓ Build all platform binaries
- ✓ Publish platform packages
- ✓ Publish main package
- ✓ Update lockfile
- ✓ Create git commit
- ✓ Create git tag
- ✓ Push to GitHub

### 3. Verify GitHub Actions

1. Go to GitHub Actions
2. Check "Release" workflow (creates GitHub Release)
3. Check "Docker (server)" workflow (builds and pushes images)
4. Both should complete successfully

### 4. Verify Deployment

```bash
# Check npm package
npm view @twsxtd/hapi

# Check Docker image
docker pull ghcr.io/flintttan/hapi-server:v0.3.1

# Check GitHub Release
# Visit: https://github.com/flintttan/hapi/releases/tag/v0.3.1
```

---

# Local Development & Testing

## 服务信息

### 容器信息
- **容器名称**: hapi-server
- **容器ID**: 0d667905edce
- **网络模式**: host
- **数据卷**: hapi-data (持久化存储)
- **端口**: 3006
- **健康状态**: Healthy

### 服务配置
```yaml
环境变量:
  NODE_ENV: production
  WEBAPP_PORT: 3006
  HAPI_HOME: /data
  WEBAPP_URL: https://your-hapi-server.com
  CORS_ORIGINS: https://your-hapi-server.com
```

## 服务验证

### 1. Web界面
```bash
curl http://localhost:3006/
```
✅ 返回HTML页面，服务正常

### 2. 注册API
```bash
curl -X POST http://localhost:3006/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123456"}'
```
✅ 成功返回JWT token和用户信息

### 3. 登录API
```bash
curl -X POST http://localhost:3006/api/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123456"}'
```
✅ 成功返回JWT token

### 4. CLI Token生成API
```bash
# 先获取JWT
JWT_TOKEN=$(curl -s -X POST http://localhost:3006/api/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123456"}' | jq -r .token)

# 生成CLI token
curl -X POST http://localhost:3006/api/cli-tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"name":"My CLI Token"}'
```
✅ 成功生成CLI token

## Docker 命令参考

### 查看服务状态
```bash
docker-compose ps
docker-compose logs -f hapi-server
```

### 停止服务
```bash
docker-compose down
```

### 启动服务
```bash
docker-compose up -d
```

### 重启服务
```bash
docker-compose restart
```

### 重新构建镜像
```bash
# 停止现有服务
docker-compose down

# 重新构建（无缓存）
docker-compose build --no-cache

# 启动新服务
docker-compose up -d
```

### 查看日志
```bash
# 实时查看日志
docker-compose logs -f hapi-server

# 查看最近50行日志
docker-compose logs --tail=50 hapi-server
```

### 进入容器
```bash
docker exec -it hapi-server /bin/sh
```

### 清理旧镜像
```bash
# 查看所有镜像
docker images | grep hapi

# 删除旧镜像
docker rmi <旧镜像ID>
```

## 数据持久化

### 数据卷位置
- **卷名**: hapi-data
- **挂载点**: /data (容器内)

### 数据内容
- SQLite数据库: `/data/hapi.db`
- 配置文件: `/data/settings.json`
- 日志文件: `/data/logs/`

### 备份数据
```bash
# 备份整个数据卷
docker run --rm -v hapi-data:/data -v $(pwd):/backup alpine tar czf /backup/hapi-backup-$(date +%Y%m%d).tar.gz /data

# 只备份数据库
docker cp hapi-server:/data/hapi.db ./hapi-backup-$(date +%Y%m%d).db
```

### 恢复数据
```bash
# 恢复整个数据卷
docker run --rm -v hapi-data:/data -v $(pwd):/backup alpine tar xzf /backup/hapi-backup-20251228.tar.gz -C /

# 恢复数据库
docker cp ./hapi-backup-20251228.db hapi-server:/data/hapi.db
docker-compose restart
```

## 网络配置

### 当前配置
- **网络模式**: host模式
- **优点**: 性能最佳，无需端口映射
- **注意**: 仅适用于Linux系统

### 修改为桥接模式（macOS/Windows）
如果需要在macOS或Windows运行，修改 `docker-compose.yml`:

```yaml
services:
  hapi-server:
    # ... 其他配置
    # network_mode: host  # 注释掉这行
    ports:
      - "3006:3006"      # 添加端口映射
```

## 环境变量配置

### 可选配置
在 `docker-compose.yml` 中添加或在 `.env` 文件中设置：

```bash
# Telegram Bot配置
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_CHAT_IDS=123456789,987654321

# CLI API Token（如不设置将自动生成）
CLI_API_TOKEN=your_custom_token

# 服务器URL
WEBAPP_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com
```

### 使用.env文件
创建 `.env` 文件：
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_CHAT_IDS=123456789
CLI_API_TOKEN=your_custom_token
```

修改 `docker-compose.yml`:
```yaml
services:
  hapi-server:
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ALLOWED_CHAT_IDS=${ALLOWED_CHAT_IDS}
      - CLI_API_TOKEN=${CLI_API_TOKEN}
```

## 健康检查

Docker Compose配置包含健康检查：
- **检查间隔**: 30秒
- **超时时间**: 5秒
- **启动等待**: 10秒
- **重试次数**: 3次

查看健康状态：
```bash
docker ps
# STATUS列显示 "healthy" 表示服务正常
```

## 故障排查

### 服务无法启动
```bash
# 查看详细日志
docker-compose logs hapi-server

# 检查端口占用
lsof -i :3006

# 检查数据卷权限
docker exec -it hapi-server ls -la /data
```

### 服务运行但无法访问
```bash
# 检查容器网络
docker inspect hapi-server | grep -A 10 "Networks"

# 测试容器内部连接
docker exec -it hapi-server curl http://127.0.0.1:3006/
```

### 数据库错误
```bash
# 进入容器检查数据库
docker exec -it hapi-server /bin/sh
cd /data
ls -la hapi.db*

# 如果数据库损坏，从备份恢复
docker cp ./backup/hapi.db hapi-server:/data/hapi.db
docker-compose restart
```

## 升级部署

### 标准升级流程
```bash
# 1. 备份数据
docker cp hapi-server:/data/hapi.db ./backup-$(date +%Y%m%d).db

# 2. 停止服务
docker-compose down

# 3. 拉取最新代码
git pull

# 4. 重新构建
docker-compose build --no-cache

# 5. 启动服务
docker-compose up -d

# 6. 验证服务
docker-compose logs -f hapi-server
curl http://localhost:3006/
```

### 零停机升级（蓝绿部署）
```bash
# 1. 构建新镜像（添加标签）
docker-compose build
docker tag hapi-hapi-server:latest hapi-hapi-server:v2

# 2. 启动新容器（使用不同名称）
docker run -d --name hapi-server-v2 \
  --network host \
  -v hapi-data:/data \
  -e NODE_ENV=production \
  -e WEBAPP_PORT=3007 \
  hapi-hapi-server:v2 ./hapi server

# 3. 验证新服务
curl http://localhost:3007/

# 4. 切换流量（更新反向代理配置）
# 5. 停止旧容器
docker stop hapi-server
docker rm hapi-server

# 6. 重命名新容器
docker rename hapi-server-v2 hapi-server
```

## 监控和日志

### 查看实时日志
```bash
docker-compose logs -f --tail=100 hapi-server
```

### 导出日志
```bash
docker-compose logs --no-color hapi-server > hapi-$(date +%Y%m%d).log
```

### 监控资源使用
```bash
docker stats hapi-server
```

## 安全建议

1. **使用HTTPS**: 配置反向代理（Nginx/Caddy）启用HTTPS
2. **限制访问**: 使用防火墙规则限制对3006端口的访问
3. **定期备份**: 设置自动备份计划
4. **更新镜像**: 定期重新构建镜像以获取安全更新
5. **环境变量**: 敏感信息使用.env文件，不要提交到Git

## 性能优化

### 镜像优化
- ✅ 使用多阶段构建减小镜像大小
- ✅ 使用slim基础镜像（324MB）
- ✅ 单一可执行文件部署

### 运行时优化
```yaml
# docker-compose.yml中添加资源限制
services:
  hapi-server:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
        reservations:
          cpus: '1'
          memory: 512M
```

## 相关文档

- [AUTO_LOGIN.md](AUTO_LOGIN.md) - CLI自动登录功能说明
- [README.md](README.md) - 项目整体说明
- [docker-compose.yml](docker-compose.yml) - Docker Compose配置
- [server/Dockerfile](server/Dockerfile) - Docker镜像构建文件

## 支持

如有问题，请查看：
1. 服务日志: `docker-compose logs hapi-server`
2. 健康检查: `docker ps`
3. 数据卷状态: `docker volume ls`
4. 网络配置: `docker network ls`
