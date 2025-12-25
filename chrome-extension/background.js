// 维持 WebSocket 连接
let socket = null;
let reconnectTimer = null;

function connect() {
  try {
    socket = new WebSocket('ws://localhost:3000/ws');

    socket.onopen = () => {
      console.log('✅ Connected to Proxy Server');
      // 清除重连定时器
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📥 Received message from proxy:', data.id);
        // 收到 Proxy 的指令，转发给 Content Script (当前激活的 Gemini 页面)
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('gemini.google.com')) {
            chrome.tabs.sendMessage(tabs[0].id, data).catch(err => {
              console.error('❌ Failed to send message to content script:', err);
            });
          } else {
            console.warn('⚠️ No active Gemini tab found');
          }
        });
      } catch (err) {
        console.error('❌ Error processing message:', err);
      }
    };

    socket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('❌ Disconnected. Retrying in 3s...');
      socket = null;
      reconnectTimer = setTimeout(connect, 3000);
    };
  } catch (err) {
    console.error('❌ Failed to create WebSocket:', err);
    reconnectTimer = setTimeout(connect, 3000);
  }
}

// 监听 Content Script 发回的结果，并传回 Proxy
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GEMINI_RESPONSE' && socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({
        id: message.id,
        content: message.content
      }));
      console.log('📤 Sent response to proxy:', message.id);
    } catch (err) {
      console.error('❌ Failed to send response:', err);
    }
  } else if (message.type === 'GEMINI_RESPONSE') {
    console.error('❌ Socket not ready, state:', socket ? socket.readyState : 'null');
  }
  return true; // 保持消息通道开放
});

// 启动连接
connect();

// 保持 Service Worker 活跃（每 20 秒发送一次 ping）
setInterval(() => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    // 可以发送一个 ping 消息保持连接
    console.log('💓 Keep-alive ping');
  } else if (!socket || socket.readyState === WebSocket.CLOSED) {
    console.log('🔄 Reconnecting...');
    connect();
  }
}, 20000);
