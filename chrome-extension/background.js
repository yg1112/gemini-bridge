// background.js - v4.0 Singleton Architecture
let socket = null;
let isConnecting = false;

function connect() {
    if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) return;
    isConnecting = true;

    console.log("🔌 Connecting to Proxy Server...");
    socket = new WebSocket('ws://localhost:3000/ws');

    socket.onopen = async () => {
        console.log('✅ Connected to Proxy Server');
        isConnecting = false;
        
        // 连接成功后，唤醒/注入所有 Gemini 页面
        await wakeUpTabs();
    };

    socket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log(`📨 Received from proxy: ${data.id}`);
            
            // 找到目标 Gemini 标签页
            const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
            
            // 优先使用活跃的标签页
            let targetTab = tabs.find(t => t.active);
            if (!targetTab && tabs.length > 0) {
                targetTab = tabs[0];
            }
            
            if (targetTab) {
                await sendToTab(targetTab.id, data);
            } else {
                console.error("❌ No Gemini tab found");
            }
        } catch (e) {
            console.error("❌ Error processing message:", e);
        }
    };

    socket.onclose = () => {
        console.log("❌ WebSocket disconnected");
        socket = null;
        isConnecting = false;
        setTimeout(connect, 3000);
    };
    
    socket.onerror = (e) => {
        console.error("❌ WebSocket error:", e);
        socket = null;
        isConnecting = false;
    };
}

async function wakeUpTabs() {
    try {
        const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
        console.log(`🔍 Found ${tabs.length} Gemini tab(s)`);
        
        for (const tab of tabs) {
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
                console.log(`🟢 Tab ${tab.id} alive (Instance: ${response.instanceId?.substring(0, 10)}...)`);
            } catch (e) {
                // Ping 失败，注入代码
                console.log(`🟡 Tab ${tab.id} not responding, injecting...`);
                await injectScript(tab.id);
            }
        }
    } catch (e) {
        console.error("❌ Wake up failed:", e);
    }
}

async function injectScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        console.log(`✅ Injected into tab ${tabId}`);
    } catch (e) {
        console.error(`❌ Injection failed for tab ${tabId}:`, e);
    }
}

async function sendToTab(tabId, data) {
    try {
        await chrome.tabs.sendMessage(tabId, data);
        console.log(`📤 Sent to tab ${tabId}`);
    } catch (e) {
        console.log(`⚠️ Send failed, injecting and retrying...`);
        await injectScript(tabId);
        await new Promise(r => setTimeout(r, 500));
        try {
            await chrome.tabs.sendMessage(tabId, data);
            console.log(`📤 Retry successful`);
        } catch (e2) {
            console.error(`❌ Retry failed:`, e2);
        }
    }
}

// 监听来自 content.js 的响应
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GEMINI_RESPONSE') {
        console.log(`📥 Response from content: ID=${message.id}, Length=${message.content?.length || 0}`);
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                id: message.id,
                content: message.content
            }));
            console.log("✅ Response sent to proxy");
        } else {
            console.error("❌ WebSocket not connected, cannot send response");
        }
    }
    return true;
});

// 初始连接
connect();

// Watchdog: 每 5 秒检查连接状态
setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log("💓 Reconnecting...");
        connect();
    }
}, 5000);

console.log("🎉 Gemini Bridge Background v4.0 initialized");
