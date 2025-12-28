# HAPI MCP DevTools - 快速开始

## ✅ 当前配置状态

**HAPI CLI**: ✅ 已安装并配置
- Server: https://your-hapi-server.com
- Token: ✅ 已配置
- Machine ID: d15f62f7-6089-4f54-9fd1-b4903324aa43

**MCP配置**: ✅ chrome-devtools已配置

**Chrome**: 已启动并打开 https://your-hapi-server.com

## 🚀 立即开始

### 方法1：使用自动化脚本（推荐）

```bash
cd /Users/tanfulin/llm/hapi
./start-hapi-with-mcp.sh
```

这个脚本会：
- ✅ 检查所有配置
- ✅ 启动Chrome浏览器
- ✅ 加载MCP服务器
- ✅ 显示使用示例
- ✅ 启动HAPI会话

### 方法2：手动启动

```bash
# 1. 确保Chrome在运行
open -a "Google Chrome" https://your-hapi-server.com

# 2. 进入项目目录
cd /Users/tanfulin/llm/hapi

# 3. 启动hapi会话
hapi
```

## 💡 测试MCP功能

会话启动后，尝试这些命令：

### 1️⃣ 列出Chrome标签页
```
"Show me all open Chrome tabs"
```

### 2️⃣ 检查控制台错误
```
"Navigate to https://your-hapi-server.com and check for any console errors"
```

### 3️⃣ 执行JavaScript
```
"Execute document.title in the current tab"
```

### 4️⃣ 获取页面信息
```
"Get the page title and all h1 headings from https://your-hapi-server.com"
```

### 5️⃣ 截图
```
"Take a screenshot of the current page"
```

## 📚 完整文档

详细的使用指南请参考：
- **[MCP_DEVTOOLS_GUIDE.md](MCP_DEVTOOLS_GUIDE.md)** - 完整的MCP调试指南

## 🔧 如果需要重新登录

使用新的自动登录功能：

```bash
# 1. 退出当前登录（可选）
hapi auth logout

# 2. 自动登录
hapi auth login --auto
```

会提示输入：
- Server URL: https://your-hapi-server.com
- 用户名: [你的用户名]
- 密码: [你的密码]

然后自动完成：
- ✅ JWT认证
- ✅ CLI token生成
- ✅ 配置保存

## 🎯 常用MCP调试场景

### 场景1：测试登录流程
```
"Navigate to https://your-hapi-server.com, find the login form,
fill in credentials, and verify the login works"
```

### 场景2：检查页面性能
```
"Measure the page load time and identify any slow resources
on https://your-hapi-server.com"
```

### 场景3：查找JavaScript错误
```
"Check all console logs and report any errors or warnings
from the current page"
```

### 场景4：DOM操作
```
"Find all buttons on the page and list their text content"
```

### 场景5：Cookie检查
```
"Show me all cookies and check if authentication tokens are present"
```

## ⚡ 现在就开始！

运行以下命令启动：

```bash
cd /Users/tanfulin/llm/hapi && ./start-hapi-with-mcp.sh
```

或者直接：

```bash
cd /Users/tanfulin/llm/hapi && hapi
```

祝调试愉快！🎉
