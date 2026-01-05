# NPM Token Configuration for GitHub Actions

本文档说明如何在 GitHub Actions 中配置 npm token 以自动发布 npm 包。

## 1. 生成 NPM Access Token

### 1.1 登录 npm
```bash
npm login
```

### 1.2 生成 Automation Token

1. 访问 [npm Access Tokens](https://www.npmjs.com/settings/tokens)
2. 点击 **"Generate New Token"** 按钮
3. 选择 **"Automation"** 类型（推荐）
   - **Automation**: 长期有效，用于 CI/CD 自动化
   - **Granular Access Tokens**: 更细粒度的权限控制
4. 输入 Token 名称（如：`hapi-ci-token`）
5. 点击 **"Generate Token"**
6. **重要**：立即复制生成的 token，因为它只会显示一次

### 1.3 验证 Token
```bash
npm whoami
```

如果显示你的 npm 用户名，说明登录成功。

## 2. 在 GitHub 中配置 NPM Token

### 2.1 进入 Repository Settings

1. 打开你的 GitHub 仓库（例如：`flintttan/hapi`）
2. 点击 **Settings** 标签页
3. 在左侧菜单中选择 **Secrets and variables** → **Actions**

### 2.2 添加 NPM_TOKEN Secret

1. 点击 **New repository secret** 按钮
2. 填写以下信息：
   - **Name**: `NPM_TOKEN`
   - **Secret**: 粘贴刚才生成的 npm token
3. 点击 **Add secret**

### 2.3 验证配置

配置完成后，你会在 Secrets 列表中看到：
- `NPM_TOKEN` - npm 发布令牌

## 3. 工作流程说明

### 3.1 NPM Publish 工作流

项目包含两个 npm 发布工作流：

#### `.github/workflows/npm-publish.yml`
- **触发条件**: 手动触发（workflow_dispatch）
- **功能**: 发布所有平台的 npm 包
  1. 构建所有平台二进制文件
  2. 准备 npm 包
  3. 依次发布平台包（darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64）
  4. 发布主包

#### `.github/workflows/release.yml`
- **触发条件**: 推送版本标签（如 `v0.5.1`）
- **功能**: 完整发布流程
  1. 构建所有平台二进制文件
  2. 打包发布产物
  3. 创建 GitHub Release
  4. 更新 Homebrew formula

### 3.2 NPM 包结构

```
@flintttan/hapi (主包)
├── bin/hapi.cjs (启动脚本)
└── optionalDependencies:
    ├── @flintttan/hapi-darwin-arm64 (macOS ARM64 二进制)
    ├── @flintttan/hapi-darwin-x64 (macOS x64 二进制)
    ├── @flintttan/hapi-linux-arm64 (Linux ARM64 二进制)
    ├── @flintttan/hapi-linux-x64 (Linux x64 二进制)
    └── @flintttan/hapi-win32-x64 (Windows x64 二进制)
```

## 4. 使用方法

### 4.1 手动触发 NPM 发布

1. 进入 GitHub 仓库的 **Actions** 标签页
2. 选择 **Publish to NPM** 工作流
3. 点击 **Run workflow** 按钮
4. 选择分支（推荐 `main`）
5. 点击 **Run workflow** 开始发布

### 4.2 通过标签自动发布

```bash
# 更新版本号
cd cli
npm version patch  # 或 minor、major

# 推送标签触发发布
git push && git push --tags
```

这将自动触发 `.github/workflows/release.yml` 工作流。

### 4.3 本地发布（测试用）

```bash
cd cli

# 构建二进制文件
bun run build:exe:all

# 准备 npm 包
bun run prepare-npm-packages

# 发布到 npm（dry-run 模式测试）
npm publish --dry-run --access public

# 真正发布
npm publish --access public
```

## 5. 故障排查

### 5.1 Token 权限不足
**错误信息**: `401 Unauthorized` 或 `You do not have permission to publish this package`

**解决方案**:
- 确保使用 **Automation** 类型 token
- 检查 npm 包名是否正确（scope 需要匹配）
- 确认你有权限发布到该 scope

### 5.2 Token 过期
**错误信息**: `401 Unauthorized` 或 `Token expired`

**解决方案**:
- 重新生成 token
- 更新 GitHub Secret 中的 `NPM_TOKEN`

### 5.3 包名冲突
**错误信息**: `403 Forbidden` 或 `Package name already exists`

**解决方案**:
- 确保使用唯一的 scope（如 `@flintttan/hapi`）
- 检查是否已发布相同版本号

### 5.4 版本号格式错误
**错误信息**: `Invalid version`

**解决方案**:
- 使用语义化版本号（Semantic Versioning）：`MAJOR.MINOR.PATCH`
- 例如：`0.5.1`、`1.0.0`、`2.3.0`

## 6. 安全最佳实践

### 6.1 Token 管理
- ✅ 使用 **Automation** 类型 token 用于 CI/CD
- ✅ 定期轮换 token（建议每 6 个月）
- ✅ 不要在代码中硬编码 token
- ✅ 使用 GitHub Secrets 存储敏感信息

### 6.2 权限控制
- ✅ 使用 Granular Access Tokens 进行细粒度控制
- ✅ 限制 token 的访问范围（仅必要的包）
- ✅ 启用 Two-Factor Authentication (2FA)

### 6.3 审计日志
- ✅ 定期检查 npm 发布历史
- ✅ 监控 GitHub Actions 运行日志
- ✅ 审查 token 使用情况

## 7. 相关链接

- [npm Access Tokens](https://docs.npmjs.com/about-access-tokens)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Semantic Versioning](https://semver.org/)
- [npm Publish](https://docs.npmjs.com/cli/v9/commands/npm-publish)

## 8. 快速参考

### 常用命令

```bash
# 登录 npm
npm login

# 查看当前用户
npm whoami

# 查看已发布的包
npm view @flintttan/hapi

# 查看包的某个版本
npm view @flintttan/hapi@0.5.1

# 卸载包（本地测试用）
npm uninstall -g @flintttan/hapi
```

### GitHub Actions 环境变量

```yaml
- name: Publish to NPM
  run: npm publish --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Package.json 关键字段

```json
{
  "name": "@flintttan/hapi",
  "version": "0.5.1",
  "publishConfig": {
    "access": "public"
  },
  "optionalDependencies": {
    "@flintttan/hapi-darwin-arm64": "0.5.1",
    "@flintttan/hapi-darwin-x64": "0.5.1",
    "@flintttan/hapi-linux-arm64": "0.5.1",
    "@flintttan/hapi-linux-x64": "0.5.1",
    "@flintttan/hapi-win32-x64": "0.5.1"
  }
}
```

## 9. 支持

如有问题，请：
1. 查看 [GitHub Issues](https://github.com/flintttan/hapi/issues)
2. 检查 [npm 文档](https://docs.npmjs.com/)
3. 查看 [GitHub Actions 文档](https://docs.github.com/en/actions)