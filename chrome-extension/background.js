// 维持 WebSocket 连接
let socket = null;
let reconnectTimer = null;
let isConnecting = false;

function connect() {
  if (isConnecting || (socket && socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  isConnecting = true;
  
  try {
    socket = new WebSocket('ws://localhost:3000/ws');

    socket.onopen = () => {
      console.log('✅ Connected to Proxy Server');
      isConnecting = false;
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      
      // 唤醒所有 Gemini 标签页 - 使用动态注入而不是刷新
      reviveGeminiTabs();
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📥 Received message from proxy:', data.id);
        
        // 转发给当前活跃的 Gemini 页面
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('gemini.google.com')) {
            chrome.tabs.sendMessage(tabs[0].id, data).catch(err => {
              const errorMsg = err.message || err.toString();
              if (errorMsg.includes('Receiving end does not exist') || 
                  errorMsg.includes('Could not establish connection')) {
                console.error('❌ Content script not responding, attempting dynamic injection...');
                // 尝试重新注入 content script
                injectContentScript(tabs[0].id).then(() => {
                  // 注入后延迟重试发送
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tabs[0].id, data).catch(retryErr => {
                      console.error('❌ Failed to send after injection:', retryErr);
                    });
                  }, 500);
                });
              } else {
                console.error('❌ Failed to send message:', err);
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
      if (socket && socket.readyState === WebSocket.CLOSED) {
        console.error('❌ 无法连接代理服务器 (localhost:3000)');
        console.error('   请确认 python3 proxy.py 是否正在运行');
      } else {
        console.error('❌ WebSocket error:', error);
      }
    };

    socket.onclose = (event) => {
      isConnecting = false;
      console.log('❌ WebSocket 连接已断开');
      socket = null;
      
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
    
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
  }
}

// 动态注入 content script 到指定标签页
async function injectContentScript(tabId) {
  try {
    console.log('💉 Injecting content script into tab:', tabId);
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    console.log('✅ Content script injected successfully');
  } catch (err) {
    console.warn('⚠️ Failed to inject content script:', err.message);
  }
}

// 唤醒 Gemini 标签页 - 只处理当前活跃的标签页
async function reviveGeminiTabs() {
  try {
    // 只查询活跃的 Gemini 标签页
    const tabs = await chrome.tabs.query({
      url: 'https://gemini.google.com/*',
      active: true,
      currentWindow: true
    });
    
    if (!tabs || tabs.length === 0) {
      // 如果没有活跃的，找第一个 Gemini 标签页
      const allTabs = await chrome.tabs.query({url: 'https://gemini.google.com/*'});
      if (allTabs && allTabs.length > 0) {
        console.log(`💡 No active Gemini tab, using first one: ${allTabs[0].id}`);
        await checkAndInjectTab(allTabs[0]);
      } else {
        console.log('💡 No Gemini tabs open');
      }
      return;
    }
    
    const activeTab = tabs[0];
    console.log(`🔍 Checking active Gemini tab: ${activeTab.id}`);
    await checkAndInjectTab(activeTab);
    
  } catch (err) {
    console.error('❌ Error reviving tabs:', err);
  }
}

// 检查并注入单个标签页
async function checkAndInjectTab(tab) {
  try {
    // 发送 PING 测试连接
    const response = await chrome.tabs.sendMessage(tab.id, {type: 'PING'});
    if (response && response.status === 'alive') {
      console.log(`✅ Tab ${tab.id} is alive and responsive`);
    }
  } catch (err) {
    // PING 失败，注入 content script
    console.log(`🔧 Tab ${tab.id} not responding, injecting content script...`);
    await injectContentScript(tab.id);
  }
}

// 监听 Content Script 发回的结果
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
  return true;
});

// 启动连接
connect();

// 保持 Service Worker 活跃
setInterval(() => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    // 连接正常
  } else if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    if (!reconnectTimer && !isConnecting) {
      console.log('🔄 检测到连接断开，尝试重连...');
      connect();
    }
  }
}, 20000);
