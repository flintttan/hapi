# HAPI + Chrome DevTools MCP 调试指南

## 概述

本指南介绍如何使用HAPI CLI配合Chrome DevTools MCP进行调试。通过MCP (Model Context Protocol)，Claude可以直接与Chrome浏览器交互，实现自动化调试、测试和网页操作。

## 前提条件

✅ **已完成的配置**：
- HAPI CLI已安装
- 已登录到HAPI服务器
- MCP配置文件 `.mcp.json` 已配置
- Chrome浏览器已安装

## 当前配置状态

### HAPI认证信息
```
Server URL: https://your-hapi-server.com
CLI Token: ✅ 已配置
Machine ID: d15f62f7-6089-4f54-9fd1-b4903324aa43
```

### MCP配置 (.mcp.json)
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"]
    }
  }
}
```

这个配置告诉HAPI在启动会话时自动启动Chrome DevTools MCP服务器。

## 快速开始

### 方法1：使用测试脚本

```bash
cd /Users/tanfulin/llm/hapi
./test-mcp-devtools.sh
```

### 方法2：手动启动

```bash
cd /Users/tanfulin/llm/hapi
hapi
```

## Chrome DevTools MCP功能

### 可用的MCP工具

当hapi会话启动后，以下Chrome DevTools工具会自动可用：

#### 1. **list_tabs**
列出所有打开的Chrome标签页

**示例提示词**：
```
"Show me all open Chrome tabs"
"List all browser tabs"
```

#### 2. **get_console_logs**
获取当前标签页的控制台日志

**示例提示词**：
```
"Get console logs from the active tab"
"Show me any JavaScript errors in the console"
```

#### 3. **execute_script**
在页面中执行JavaScript代码

**示例提示词**：
```
"Execute console.log('Hello from Claude!') in the active tab"
"Run document.title in the current page"
"Get all links from the page using querySelectorAll"
```

#### 4. **get_cookies**
获取当前页面的cookies

**示例提示词**：
```
"Show me the cookies for this page"
"Get all cookies from the active tab"
```

#### 5. **navigate_to**
导航到指定URL

**示例提示词**：
```
"Navigate to https://google.com"
"Open https://github.com in the browser"
```

#### 6. **take_screenshot**
捕获当前页面的截图

**示例提示词**：
```
"Take a screenshot of the current page"
"Capture the visible area"
```

#### 7. **get_page_content**
获取页面的HTML内容

**示例提示词**：
```
"Get the page source"
"Show me the HTML content"
```

## 使用场景示例

### 场景1：调试Web应用

**目标**：调试HAPI Web界面的登录流程

```bash
# 1. 启动hapi会话
cd /Users/tanfulin/llm/hapi
hapi

# 2. 在会话中与Claude对话
```

**示例对话**：
```
你: Navigate to https://your-hapi-server.com

Claude: [使用navigate_to工具打开页面]

你: Check if there are any console errors

Claude: [使用get_console_logs获取控制台日志并分析]

你: Execute document.querySelector('.login-form') to check if the login form exists

Claude: [使用execute_script执行JavaScript并返回结果]
```

### 场景2：自动化测试

**目标**：自动测试登录流程

**示例对话**：
```
你: Open https://your-hapi-server.com and test the login flow

Claude会自动：
1. 导航到URL
2. 检查页面加载状态
3. 查找登录表单
4. 执行测试脚本
5. 检查控制台错误
6. 返回测试结果
```

### 场景3：页面分析

**目标**：分析网页结构和性能

**示例对话**：
```
你: Analyze the structure of https://your-hapi-server.com

Claude会：
1. 导航到页面
2. 获取页面HTML
3. 分析DOM结构
4. 检查加载的资源
5. 查看控制台日志
6. 提供优化建议
```

### 场景4：实时调试

**目标**：在开发过程中实时调试

```
你: I'm developing a React component. Navigate to http://localhost:3000 and help me debug it

Claude会：
1. 打开本地开发服务器
2. 检查React DevTools
3. 获取控制台错误
4. 执行调试脚本
5. 提供修复建议
```

## 完整测试流程

### 步骤1：准备Chrome浏览器

```bash
# 确保Chrome浏览器正在运行
# 可以打开一些测试页面
open -a "Google Chrome" https://your-hapi-server.com
```

### 步骤2：启动HAPI会话

```bash
cd /Users/tanfulin/llm/hapi
hapi
```

会话启动时，你会看到：
```
HAPI CLI starting...
Loading MCP servers...
✓ chrome-devtools MCP server started
...
```

### 步骤3：测试MCP连接

在会话中尝试：

```
你: List all Chrome tabs

Claude: [返回所有打开的标签页列表]
```

### 步骤4：执行调试任务

```
你: Navigate to https://your-hapi-server.com and check if the page loads correctly

Claude会：
1. 导航到URL
2. 等待页面加载
3. 检查控制台错误
4. 验证页面标题和关键元素
5. 报告结果
```

## 高级用法

### 组合多个工具

**示例：完整的页面审计**

```
你: Perform a complete audit of https://your-hapi-server.com:
1. Navigate to the page
2. Take a screenshot
3. Get all console logs
4. Check for JavaScript errors
5. List all cookies
6. Get the page title and meta description

Claude会自动执行所有这些步骤并提供综合报告
```

### 自定义JavaScript执行

**示例：性能测试**

```
你: Execute this script in the active tab to measure page performance:

performance.timing.loadEventEnd - performance.timing.navigationStart

Claude: [执行脚本并返回页面加载时间]
```

### 持续监控

**示例：监控控制台错误**

```
你: Keep monitoring the console logs and alert me if any errors appear

Claude: [定期检查控制台并报告新的错误]
```

## 故障排查

### MCP服务器未启动

**问题**：会话启动时未看到 "chrome-devtools MCP server started"

**解决方案**：
```bash
# 检查MCP配置
cat .mcp.json

# 测试MCP服务器
npx -y chrome-devtools-mcp --version

# 重新安装
npm cache clean --force
```

### Chrome连接失败

**问题**：MCP无法连接到Chrome

**解决方案**：
```bash
# 确保Chrome正在运行
ps aux | grep Chrome

# 重启Chrome并启用远程调试
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

### 工具调用失败

**问题**：执行MCP工具时出错

**解决方案**：
1. 确保有活动的Chrome标签页
2. 检查Chrome DevTools协议是否启用
3. 验证.mcp.json配置正确
4. 查看hapi日志：`tail -f ~/.hapi/logs/*.log`

## 常见问题

### Q: MCP服务器每次都要下载吗？
A: 第一次使用时会下载，之后会使用缓存版本。使用 `-y` 参数可以自动确认。

### Q: 可以同时使用多个MCP服务器吗？
A: 可以！在 `.mcp.json` 中添加多个服务器配置：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  }
}
```

### Q: 如何查看MCP工具的详细信息？
A: 在hapi会话中询问：
```
"What MCP tools are available?"
"Show me the chrome-devtools MCP capabilities"
```

### Q: MCP调试会影响性能吗？
A: MCP服务器运行在单独的进程中，对浏览器性能影响很小。

## 安全注意事项

1. **权限控制**：MCP服务器可以执行JavaScript代码，确保只在信任的网站上使用
2. **敏感数据**：避免在生产环境中执行可能暴露敏感数据的脚本
3. **Cookie访问**：使用get_cookies时注意保护用户隐私
4. **远程调试**：如果使用远程调试端口，确保防火墙配置正确

## 实用技巧

### 1. 快速检查页面状态
```
"Quick health check for https://your-hapi-server.com"
```

### 2. 批量测试
```
"Test these URLs and report any errors:
- https://your-hapi-server.com
- https://your-hapi-server.com/api/register
- https://your-hapi-server.com/api/auth"
```

### 3. 性能分析
```
"Measure page load time and identify slow resources for https://your-hapi-server.com"
```

### 4. 自动化工作流
```
"Create a test workflow:
1. Open the login page
2. Fill in test credentials
3. Submit the form
4. Verify successful login
5. Take a screenshot"
```

## 相关资源

- **Chrome DevTools Protocol**: https://chromedevtools.github.io/devtools-protocol/
- **MCP Documentation**: https://modelcontextprotocol.io/
- **HAPI项目文档**:
  - [AUTO_LOGIN.md](AUTO_LOGIN.md) - CLI自动登录
  - [DEPLOYMENT.md](DEPLOYMENT.md) - Docker部署
  - [README.md](README.md) - 项目概览

## 下一步

现在你可以：

1. **运行测试脚本**：
   ```bash
   ./test-mcp-devtools.sh
   ```

2. **开始调试任务**：
   ```bash
   hapi
   # 然后开始与Claude对话，使用MCP工具
   ```

3. **探索更多MCP服务器**：
   - filesystem MCP - 文件系统访问
   - git MCP - Git仓库操作
   - database MCP - 数据库查询
   - 等等...

祝调试愉快！🎉
