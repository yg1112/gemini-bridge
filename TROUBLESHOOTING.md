# 故障排查指南

## 改进内容

已更新 `background.js`，添加了：
- ✅ 更好的错误处理和日志
- ✅ Socket 状态检查
- ✅ Keep-alive 机制（每 20 秒保持连接）
- ✅ 自动重连机制
- ✅ 检查 Gemini 标签页是否存在

## 重新加载步骤

1. **重新加载扩展**
   - 打开 `chrome://extensions/`
   - 找到 "Gemini Neural Bridge"
   - 点击刷新按钮 🔄

2. **打开 Gemini 页面**
   - 访问 https://gemini.google.com/
   - 确保页面完全加载

3. **检查连接**
   - 在扩展卡片上点击 "service worker"
   - 应该看到：`✅ Connected to Proxy Server`
   - 在 Gemini 页面的 Console（F12）应该看到：`🚀 Gemini Bridge Loaded`

4. **测试连接**
   ```bash
   curl -X POST http://localhost:3000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"test"}]}'
   ```
   
   如果返回 `{"error":"Gemini timed out"}` 说明连接成功（等待 Gemini 响应）
   如果返回 `{"error":"Chrome Extension not connected"}` 说明扩展未连接

