# Chrome 扩展连接检查清单

## ❌ 当前状态：Chrome 扩展未连接

请按以下步骤检查：

### 1. 检查扩展是否已安装
- 打开 `chrome://extensions/`
- 确认 "Gemini Neural Bridge" 扩展已启用
- 检查是否有错误提示（红色错误信息）

### 2. 检查扩展后台日志
- 在 `chrome://extensions/` 页面，找到 "Gemini Neural Bridge"
- 点击 "service worker" 或 "背景页" 链接
- 查看控制台，应该看到：
  - ✅ `Connected to Proxy Server` （连接成功）
  - 或 ❌ `Disconnected. Retrying in 3s...` （连接失败）

### 3. 检查 WebSocket 连接
如果看到连接失败，可能的原因：
- 服务器未运行：运行 `python3 proxy.py`
- 端口被占用：检查 `lsof -i :3000`
- 防火墙阻止：macOS 可能阻止本地 WebSocket 连接

### 4. 确保 Gemini 页面已打开
- 打开 https://gemini.google.com/
- 确保页面完全加载
- 扩展的 content script 需要在 Gemini 页面上运行

### 5. 检查 Content Script
- 在 Gemini 页面上按 F12 打开开发者工具
- 查看 Console，应该看到：`🚀 Gemini Bridge Loaded`

### 6. 手动测试连接
运行以下命令测试服务器：
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

如果返回 `{"error":"Chrome Extension not connected"}`，说明扩展未连接。

### 7. 重新加载扩展
如果以上都正常但仍未连接：
1. 在 `chrome://extensions/` 中点击扩展的"重新加载"按钮
2. 刷新 Gemini 页面
3. 检查后台日志

