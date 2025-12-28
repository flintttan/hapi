#!/bin/bash

# HAPI MCP DevTools 快速测试脚本
# 这个脚本演示如何使用HAPI + Chrome DevTools MCP进行调试

echo "=================================================="
echo "HAPI + Chrome DevTools MCP 快速测试"
echo "=================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查hapi是否已安装
echo "1️⃣  检查HAPI CLI..."
if command -v hapi &> /dev/null; then
    echo -e "${GREEN}✓${NC} HAPI CLI已安装: $(which hapi)"
else
    echo -e "${RED}✗${NC} HAPI CLI未安装"
    exit 1
fi

# 2. 检查认证状态
echo ""
echo "2️⃣  检查认证状态..."
if hapi auth status | grep -q "CLI_API_TOKEN: set"; then
    echo -e "${GREEN}✓${NC} 已登录"
    hapi auth status
else
    echo -e "${YELLOW}!${NC} 未登录，需要先登录"
    echo ""
    echo "请运行以下命令之一进行登录："
    echo "  • hapi auth login --auto    (推荐：自动登录)"
    echo "  • hapi auth login           (手动输入token)"
    echo "  • hapi auth setup           (完整设置向导)"
    exit 1
fi

# 3. 检查MCP配置
echo ""
echo "3️⃣  检查MCP配置..."
if [ -f ".mcp.json" ]; then
    echo -e "${GREEN}✓${NC} MCP配置文件存在"
    echo ""
    echo "当前MCP服务器配置："
    cat .mcp.json | jq -r '.mcpServers | to_entries[] | "  • \(.key)"' 2>/dev/null || cat .mcp.json
else
    echo -e "${RED}✗${NC} MCP配置文件不存在"
    echo ""
    echo "正在创建默认配置..."
    cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"]
    }
  }
}
EOF
    echo -e "${GREEN}✓${NC} 已创建.mcp.json配置文件"
fi

# 4. 检查Chrome浏览器
echo ""
echo "4️⃣  检查Chrome浏览器..."
if [ -d "/Applications/Google Chrome.app" ]; then
    echo -e "${GREEN}✓${NC} Chrome已安装"

    # 检查Chrome是否在运行
    if pgrep -x "Google Chrome" > /dev/null; then
        echo -e "${GREEN}✓${NC} Chrome正在运行"
    else
        echo -e "${YELLOW}!${NC} Chrome未运行"
        echo ""
        echo "正在启动Chrome..."
        open -a "Google Chrome" https://your-hapi-server.com &
        sleep 2
        echo -e "${GREEN}✓${NC} Chrome已启动"
    fi
else
    echo -e "${RED}✗${NC} Chrome未安装"
    echo "请安装Chrome浏览器：https://www.google.com/chrome/"
    exit 1
fi

# 5. 显示使用说明
echo ""
echo "=================================================="
echo "准备就绪！"
echo "=================================================="
echo ""
echo "📋 在HAPI会话中可以使用的Chrome DevTools MCP工具："
echo ""
echo "  1. 列出标签页:"
echo "     \"Show me all open Chrome tabs\""
echo ""
echo "  2. 获取控制台日志:"
echo "     \"Get console logs from the active tab\""
echo ""
echo "  3. 执行JavaScript:"
echo "     \"Execute document.title in the current page\""
echo ""
echo "  4. 获取Cookies:"
echo "     \"Show me the cookies for this page\""
echo ""
echo "  5. 导航到URL:"
echo "     \"Navigate to https://google.com\""
echo ""
echo "  6. 截图:"
echo "     \"Take a screenshot of the current page\""
echo ""
echo "  7. 获取页面内容:"
echo "     \"Get the HTML content of the page\""
echo ""
echo "=================================================="
echo ""
echo "🚀 测试示例："
echo ""
echo "  示例1 - 页面健康检查:"
echo "    \"Navigate to https://your-hapi-server.com and check for any console errors\""
echo ""
echo "  示例2 - 调试登录流程:"
echo "    \"Open https://your-hapi-server.com, find the login form, and test if it exists\""
echo ""
echo "  示例3 - 性能分析:"
echo "    \"Measure the page load time of https://your-hapi-server.com\""
echo ""
echo "=================================================="
echo ""
echo -e "${GREEN}按Enter启动HAPI会话${NC} (Ctrl+C取消)"
read -r

# 启动HAPI会话
echo ""
echo "正在启动HAPI会话..."
echo "MCP服务器将自动加载..."
echo ""

cd /Users/tanfulin/llm/hapi
exec hapi
