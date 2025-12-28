# HAPI Docker 部署指南

## 部署完成状态

✅ **Docker镜像已构建并部署成功**

- **镜像名称**: `hapi-hapi-server:latest`
- **镜像ID**: `9d2c381a8ce1`
- **镜像大小**: 324MB
- **构建时间**: 2025-12-28
- **容器状态**: Running (healthy)

## 已包含的新功能

本次部署包含了最新的自动登录功能：
- ✅ CLI自动登录命令 (`hapi auth login --auto`)
- ✅ 用户名密码认证
- ✅ 自动CLI token生成
- ✅ 机器自动注册

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
