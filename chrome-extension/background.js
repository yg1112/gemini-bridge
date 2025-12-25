// 维持 WebSocket 连接
let socket = null;
let reconnectTimer = null;
let isConnecting = false; // 防止重复连接

function connect() {
  // 如果正在连接或已连接，不重复连接
  if (isConnecting || (socket && socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  
  // 如果已连接，不重复连接
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  isConnecting = true;
  
  try {
    socket = new WebSocket('ws://localhost:3000/ws');

    socket.onopen = () => {
      console.log('✅ Connected to Proxy Server');
      isConnecting = false;
      // 清除重连定时器
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      
      // 自动刷新 Gemini 页面，确保注入最新的 content script
      chrome.tabs.query({url: 'https://gemini.google.com/*'}, (tabs) => {
        if (tabs && tabs.length > 0) {
          tabs.forEach(tab => {
            console.log('🔄 Auto-refreshing Gemini tab:', tab.id);
            chrome.tabs.reload(tab.id, {bypassCache: false});
          });
        } else {
          console.log('💡 No Gemini tabs open - ready for manual navigation');
        }
      });
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📥 Received message from proxy:', data.id);
        // 收到 Proxy 的指令，转发给 Content Script (当前激活的 Gemini 页面)
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('gemini.google.com')) {
            chrome.tabs.sendMessage(tabs[0].id, data).catch(err => {
              // 专门捕获"僵尸网页"错误
              const errorMsg = err.message || err.toString();
              if (errorMsg.includes('Receiving end does not exist') || 
                  errorMsg.includes('Could not establish connection')) {
                console.error('❌ 连接已断开：检测到扩展已重载，请务必刷新 Gemini 网页！');
                console.error('   💡 解决方法：在 Gemini 页面按 F5 或 Cmd+R 刷新页面');
              } else {
                console.error('❌ Failed to send message to content script:', err);
              }
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
      isConnecting = false;
      // 检查是否是连接被拒绝（服务器未启动）
      if (socket && socket.readyState === WebSocket.CLOSED) {
        console.error('❌ 无法连接代理服务器 (localhost:3000)。请确认：');
        console.error('   1. python3 proxy.py 是否正在运行？');
        console.error('   2. 是否需要重启扩展？');
      } else {
        console.error('❌ WebSocket error:', error);
      }
    };

    socket.onclose = (event) => {
      isConnecting = false;
      // 区分正常关闭和异常关闭
      if (event.code === 1006 || event.code === 1000) {
        // 1006 = 异常关闭（通常是服务器未启动）
        // 1000 = 正常关闭
        console.log('❌ WebSocket 连接已断开');
        console.log('   💡 如果这是首次连接失败，请确认：');
        console.log('      1. python3 proxy.py 是否正在运行？');
        console.log('      2. 端口 3000 是否被占用？');
      } else {
        console.log('❌ WebSocket 连接已关闭，代码:', event.code);
      }
      
      socket = null;
      
      // 只在没有重连定时器时才创建新的
      if (!reconnectTimer) {
        console.log('🔄 将在 3 秒后自动重连...');
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 3000);
      }
    };
  } catch (err) {
    isConnecting = false;
    console.error('❌ Failed to create WebSocket:', err);
    console.error('   💡 请确认：1. python3 proxy.py 是否正在运行？ 2. 是否需要重启扩展？');
    
    // 只在没有重连定时器时才创建新的
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
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

// 保持 Service Worker 活跃（每 20 秒检查一次连接状态）
setInterval(() => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    // 连接正常，无需操作
    // console.log('💓 Keep-alive ping'); // 注释掉以减少日志刷屏
  } else if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    // 只在没有重连定时器且不在连接中时才重连
    if (!reconnectTimer && !isConnecting) {
      console.log('🔄 检测到连接断开，尝试重连...');
      connect();
    }
  }
}, 20000);
