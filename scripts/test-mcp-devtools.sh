#!/bin/bash

# HAPI MCP Devtools 调试指南

echo "========================================="
echo "HAPI + Chrome DevTools MCP 调试测试"
echo "========================================="
echo ""

# 1. 检查配置
echo "1️⃣  检查MCP配置..."
if [ -f ".mcp.json" ]; then
    echo "✅ MCP配置文件存在"
    cat .mcp.json | jq .
else
    echo "❌ MCP配置文件不存在"
    exit 1
fi

echo ""
echo "2️⃣  检查hapi认证状态..."
hapi auth status

echo ""
echo "========================================="
echo "启动测试会话"
echo "========================================="
echo ""
echo "在hapi会话中，你可以使用以下MCP工具："
echo ""
echo "Chrome DevTools MCP 提供的工具："
echo "  • list_tabs - 列出所有打开的Chrome标签页"
echo "  • get_console_logs - 获取控制台日志"
echo "  • execute_script - 在页面中执行JavaScript"
echo "  • get_cookies - 获取当前页面的cookies"
echo "  • navigate_to - 导航到指定URL"
echo ""
echo "示例命令："
echo '  "List all open Chrome tabs"'
echo '  "Execute console.log(\"Hello from MCP!\") in the active tab"'
echo '  "Get all console logs from the current page"'
echo ""
echo "========================================="
echo ""
echo "准备启动hapi会话..."
echo "会话启动后，MCP服务器会自动连接。"
echo ""
echo "按Enter继续启动会话，或Ctrl+C取消"
read -r

# 启动hapi会话
cd /Users/tanfulin/llm/hapi
hapi
