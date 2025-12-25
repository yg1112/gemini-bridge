#!/bin/bash

# Gemini Bridge 测试脚本 - 自动化测试流程

echo "🔄 Gemini Bridge 自动化测试脚本"
echo "================================"

# 步骤 1: 停止旧的 proxy.py
echo ""
echo "步骤 1/4: 停止旧的 proxy.py 进程..."
pkill -9 -f "proxy.py" 2>/dev/null
sleep 1
echo "✅ 已停止旧进程"

# 步骤 2: 启动 proxy.py
echo ""
echo "步骤 2/4: 启动 proxy.py..."
cd /Users/yukungao/github/gemini-bridge
python3 proxy.py > /tmp/proxy.log 2>&1 &
PROXY_PID=$!
echo "✅ proxy.py 已启动 (PID: $PROXY_PID)"

# 步骤 3: 等待服务就绪
echo ""
echo "步骤 3/4: 等待服务就绪..."
for i in {1..10}; do
    if lsof -ti:3000 >/dev/null 2>&1; then
        echo "✅ 端口 3000 已监听"
        break
    fi
    echo "   等待中... ($i/10)"
    sleep 1
done

# 额外等待 WebSocket 连接建立
echo "   等待 Chrome Extension 连接..."
sleep 5

# 步骤 4: 验证连接
echo ""
echo "步骤 4/4: 验证连接状态..."
HEALTH_CHECK=$(curl -s -X POST http://localhost:3000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}' \
    --max-time 3 2>&1)

if echo "$HEALTH_CHECK" | grep -q "Chrome Extension not connected"; then
    echo "⚠️  Chrome Extension 未连接"
    echo ""
    echo "请手动操作："
    echo "1. 打开 chrome://extensions/"
    echo "2. 点击 'Gemini Neural Bridge' 的刷新按钮"
    echo "3. 等待 3 秒"
    echo "4. 按任意键继续..."
    read -n 1 -s
fi

echo ""
echo "================================"
echo "✅ 准备就绪！"
echo ""

# 运行测试
echo "🧪 运行测试："
echo ""

RANDOM_PROMPTS=(
    "Name a fruit"
    "What color is the sky?"
    "Count from 1 to 3"
    "Name one animal"
    "What is the opposite of hot?"
)

# 随机选择一个问题
RANDOM_INDEX=$((RANDOM % ${#RANDOM_PROMPTS[@]}))
PROMPT="${RANDOM_PROMPTS[$RANDOM_INDEX]}"

echo "📤 发送提示: \"$PROMPT\""
echo ""

curl -X POST http://localhost:3000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}" \
    --max-time 30 2>&1

echo ""
echo ""
echo "================================"
echo "测试完成！"
echo ""
echo "💡 提示："
echo "- 查看 Gemini 页面 Console (F12) 以获取详细日志"
echo "- 查看 /tmp/proxy.log 以获取 proxy.py 日志"
echo ""

