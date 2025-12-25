#!/usr/bin/env python3
"""测试 WebSocket 连接和消息传递"""
import asyncio
import json
import websockets
import requests
import time

async def test_websocket():
    """模拟 Chrome 扩展连接"""
    uri = "ws://localhost:3000/ws"
    
    async with websockets.connect(uri) as websocket:
        print("✅ WebSocket 连接成功")
        
        # 等待一下，让服务器注册连接
        await asyncio.sleep(0.5)
        
        # 模拟收到一个请求
        test_request = {
            "id": "test-123",
            "prompt": "Hello, this is a test message"
        }
        
        # 发送测试消息（模拟 Proxy 发送给 Chrome）
        await websocket.send(json.dumps(test_request))
        print(f"📤 发送测试消息: {test_request['prompt']}")
        
        # 等待响应
        try:
            response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
            print(f"📥 收到响应: {response}")
        except asyncio.TimeoutError:
            print("⏱️  等待响应超时（这是正常的，因为需要 Chrome 扩展实际响应）")
        
        # 模拟 Chrome 扩展发送 Gemini 响应
        gemini_response = {
            "id": "test-123",
            "content": "This is a simulated Gemini response"
        }
        await websocket.send(json.dumps(gemini_response))
        print(f"📤 模拟发送 Gemini 响应: {gemini_response['content']}")
        
        await asyncio.sleep(0.5)

async def test_http_with_websocket():
    """测试 HTTP 请求 + WebSocket 响应"""
    async def websocket_handler():
        uri = "ws://localhost:3000/ws"
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket 连接成功（用于响应 HTTP 请求）")
            
            # 等待 HTTP 请求转发过来
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                data = json.loads(message)
                request_id = data.get("id")
                prompt = data.get("prompt", "")
                print(f"📥 收到 HTTP 请求转发 (ID: {request_id}): {prompt[:50]}...")
                
                # 模拟 Gemini 响应（延迟一下模拟生成时间）
                await asyncio.sleep(1)
                response = {
                    "id": request_id,
                    "content": f"模拟 Gemini 回复: 收到了你的消息 '{prompt[:30]}...'"
                }
                await websocket.send(json.dumps(response))
                print(f"📤 发送模拟响应 (ID: {request_id})")
                
            except asyncio.TimeoutError:
                print("⏱️  等待 HTTP 请求超时")
    
    # 启动 WebSocket 连接（在后台运行）
    ws_task = asyncio.create_task(websocket_handler())
    await asyncio.sleep(1.5)  # 等待 WebSocket 连接建立
    
    # 发送 HTTP 请求
    print("\n📡 发送 HTTP 请求...")
    try:
        response = requests.post(
            "http://localhost:3000/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "测试消息：你好 Gemini"}]
            },
            timeout=15
        )
        
        print(f"📥 HTTP 响应状态: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            print(f"✅ 收到响应: {content[:100]}...")
        else:
            print(f"❌ 错误: {response.text}")
    except requests.exceptions.Timeout:
        print("❌ HTTP 请求超时")
    
    await ws_task

if __name__ == "__main__":
    print("=" * 50)
    print("测试 1: WebSocket 基本连接")
    print("=" * 50)
    asyncio.run(test_websocket())
    
    print("\n" + "=" * 50)
    print("测试 2: HTTP + WebSocket 完整流程")
    print("=" * 50)
    asyncio.run(test_http_with_websocket())

