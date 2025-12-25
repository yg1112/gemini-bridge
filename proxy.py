import asyncio
import json
import time
import uuid
from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI()

# 全局变量存储 WebSocket 连接和挂起的请求
connected_client: WebSocket = None
pending_responses = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global connected_client
    await websocket.accept()
    connected_client = websocket
    print("🟢 Chrome Extension Connected!")
    try:
        while True:
            # 接收 Chrome 发回的 Gemini 回复
            data = await websocket.receive_text()
            message = json.loads(data)
            request_id = message.get("id")
            content = message.get("content")
            
            # 如果有 HTTP 请求在等这个 ID，解锁它
            if request_id in pending_responses:
                pending_responses[request_id].set_result(content)
    except Exception as e:
        print(f"🔴 WebSocket Disconnected: {e}")
        connected_client = None

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    global connected_client
    
    if not connected_client:
        return JSONResponse({"error": "Chrome Extension not connected"}, status_code=503)

    # 1. 解析 Aider 发来的请求
    body = await request.json()
    messages = body.get("messages", [])
    if not messages:
        return JSONResponse({"error": "No messages provided"}, status_code=400)

    # 提取最后一条用户指令 (Aider 通常把 Context 打包在最后一条)
    last_user_message = messages[-1]["content"]
    request_id = str(uuid.uuid4())

    # 2. 创建一个 Future 对象挂起当前请求
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    pending_responses[request_id] = future

    # 3. 通过 WebSocket 发给 Chrome
    print(f"🟡 Forwarding to Gemini: {last_user_message[:50]}...")
    await connected_client.send_text(json.dumps({
        "id": request_id,
        "prompt": last_user_message
    }))

    # 4. 阻塞等待 Chrome 返回 (超时设置为 120秒，因为 Gemini 生成慢)
    try:
        gemini_response = await asyncio.wait_for(future, timeout=120.0)
    except asyncio.TimeoutError:
        del pending_responses[request_id]
        return JSONResponse({"error": "Gemini timed out"}, status_code=504)

    # 5. 伪装成 OpenAI 格式返回给 Aider
    print(f"🟢 Received from Gemini: {len(gemini_response)} chars")
    del pending_responses[request_id]
    
    return {
        "id": "chatcmpl-" + request_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "gemini-web-bridge",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": gemini_response
            },
            "finish_reason": "stop"
        }],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    }

if __name__ == "__main__":
    # 运行在 localhost:3000
    uvicorn.run(app, host="0.0.0.0", port=3000)
