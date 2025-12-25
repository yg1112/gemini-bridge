#!/usr/bin/env python3
"""详细测试 WebSocket 和 HTTP 交互"""
import asyncio
import json
import websockets
import requests
import threading
import time

async def websocket_client():
    """WebSocket 客户端，模拟 Chrome 扩展"""
    uri = "ws://localhost:3000/ws"
    print("🔌 正在连接 WebSocket...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket 连接成功！")
            
            # 等待接收来自服务器的消息
            print("⏳ 等待服务器发送消息...")
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=15.0)
                print(f"📥 收到服务器消息: {message}")
                
                data = json.loads(message)
                request_id = data.get("id")
                prompt = data.get("prompt", "")
                
                print(f"   请求 ID: {request_id}")
                print(f"   Prompt: {prompt[:50]}...")
                
                # 模拟 Gemini 响应
                print("🤖 模拟 Gemini 生成响应...")
                await asyncio.sleep(1)
                
                response = {
                    "id": request_id,
                    "content": f"这是模拟的 Gemini 回复。我收到了你的消息：'{prompt[:30]}...'"
                }
                
                response_json = json.dumps(response)
                print(f"📤 发送响应: {response_json[:80]}...")
                await websocket.send(response_json)
                print("✅ 响应已发送")
                
            except asyncio.TimeoutError:
                print("❌ 等待消息超时")
                
    except Exception as e:
        print(f"❌ WebSocket 错误: {e}")

def send_http_request():
    """在另一个线程发送 HTTP 请求"""
    time.sleep(2)  # 等待 WebSocket 连接建立
    print("\n📡 发送 HTTP 请求...")
    
    try:
        response = requests.post(
            "http://localhost:3000/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "测试消息：你好，这是一条测试消息"}]
            },
            timeout=20
        )
        
        print(f"📥 HTTP 响应状态: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            print(f"✅ 收到完整响应:")
            print(f"   {content}")
        else:
            print(f"❌ 错误响应: {response.text}")
    except Exception as e:
        print(f"❌ HTTP 请求错误: {e}")

async def main():
    # 在后台线程发送 HTTP 请求
    http_thread = threading.Thread(target=send_http_request, daemon=True)
    http_thread.start()
    
    # 运行 WebSocket 客户端
    await websocket_client()
    
    # 等待 HTTP 线程完成
    http_thread.join(timeout=5)

if __name__ == "__main__":
    print("=" * 60)
    print("详细测试：HTTP + WebSocket 完整流程")
    print("=" * 60)
    asyncio.run(main())

