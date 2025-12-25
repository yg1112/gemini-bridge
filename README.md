# Gemini Neural Bridge

让 Aider 通过 Chrome 扩展调用 Gemini Web 版的代理系统。

> **注意**: 这是一个实验性项目，用于演示如何通过浏览器扩展桥接 Web AI 服务。

## 工作原理

```
Aider → HTTP API → Proxy Server → WebSocket → Chrome Extension → Gemini Web
```

1. **Aider** 发送 HTTP 请求到本地代理服务器
2. **Proxy Server** 通过 WebSocket 转发请求到 Chrome 扩展
3. **Chrome Extension** 在 Gemini 网页上自动输入并获取响应
4. 响应通过相同路径返回给 Aider

## 安装依赖

```bash
pip install -r requirements.txt
```

## 使用步骤

### 1. 启动 Proxy 服务器

```bash
python3 proxy.py
```

服务器将在 `http://localhost:3000` 启动。

### 2. 安装 Chrome 扩展

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角的 **"Developer mode" (开发者模式)**
3. 点击 **"Load unpacked"**，选择 `chrome-extension` 文件夹
4. 打开 [Google Gemini](https://gemini.google.com/) 标签页
5. 检查终端：应该显示 `🟢 Chrome Extension Connected!`

### 3. 启动 Aider

```bash
aider --model openai/gemini-web --openai-api-base http://localhost:3000/v1 --no-git
```

### 4. 测试

在 Aider 中输入指令，观察 Chrome 中的 Gemini 页面自动响应。

## 项目结构

```
gemini-bridge/
├── proxy.py              # FastAPI 中转服务器
├── requirements.txt      # Python 依赖
├── README.md            # 使用说明
└── chrome-extension/     # Chrome 扩展
    ├── manifest.json
    ├── background.js
    └── content.js
```

## 故障排查

- **找不到输入框**：检查 Gemini 页面 DOM 结构，更新 `content.js` 中的选择器
- **WebSocket 连接失败**：确保 Proxy 服务器正在运行
- **响应超时**：检查 Chrome 扩展是否正确安装并连接到 Gemini 页面

