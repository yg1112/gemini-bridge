// background.js - v6.1 True Manual Mode (No Auto-Lock)
let socket = null;
let isConnecting = false;
let dedicatedTabId = null;

function connect() {
    if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) return;
    isConnecting = true;

    console.log("🔌 Connecting to Proxy...");
    socket = new WebSocket('ws://localhost:3000/ws');

    socket.onopen = async () => {
        console.log('✅ Connected to Proxy');
        isConnecting = false;
        
        // 只唤醒所有标签页，让它们显示 UI，但不自动锁定任何一个
        const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
        console.log(`🔍 Found ${tabs.length} Gemini tab(s)`);

        for (const tab of tabs) {
            // 注入脚本确保 UI 存在
            await injectScript(tab.id);
            await sleep(200);
            
            // 发送侦查报告请求，让 Content Script 更新自己的 UI
            try {
                await chrome.tabs.sendMessage(tab.id, { type: 'SCOUT_REPORT' });
            } catch (e) {}
        }

        // ❌ 不再自动锁定！等待用户手动选择
        console.log("🧘 Waiting for user to manually click 'Connect' in a Gemini tab...");
    };

    socket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log(`📨 Received from proxy: ${data.id}`);
            
            if (dedicatedTabId) {
                console.log(`📤 Sending to dedicated tab: ${dedicatedTabId}`);
                try {
                    await chrome.tabs.sendMessage(dedicatedTabId, data);
                } catch (err) {
                    console.warn("⚠️ Target tab died, releasing lock...");
                    dedicatedTabId = null;
                }
            } else {
                // 没有锁定的 Tab，提示用户
                console.warn("⚠️ No tab connected! Please click 'Connect' in a Gemini tab first.");
            }
        } catch (e) {
            console.error("❌ Error:", e);
        }
    };

    socket.onclose = () => {
        console.log("❌ WebSocket disconnected");
        isConnecting = false;
        socket = null;
        setTimeout(connect, 3000);
    };
    
    socket.onerror = (e) => {
        console.error("❌ WebSocket error:", e);
        isConnecting = false;
    };
}

async function injectScript(tabId) {
    try {
        // 先尝试 ping
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        console.log(`🟢 Tab ${tabId} already has bridge`);
    } catch (e) {
        // Ping 失败，注入
        console.log(`💉 Injecting into tab ${tabId}...`);
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            console.log(`✅ Injected into tab ${tabId}`);
        } catch (err) {
            console.error(`❌ Injection failed for tab ${tabId}:`, err);
        }
    }
}

async function lockTab(tabId) {
    // 1. 释放旧锁
    if (dedicatedTabId && dedicatedTabId !== tabId) {
        try {
            await chrome.tabs.sendMessage(dedicatedTabId, { type: 'LOCK_RELEASED' });
            console.log(`🔓 Released old tab: ${dedicatedTabId}`);
        } catch (e) {}
    }

    // 2. 锁定新的
    dedicatedTabId = tabId;
    try {
        await chrome.tabs.sendMessage(tabId, { type: 'LOCK_GRANTED' });
        console.log(`🔒 Locked to tab ${tabId}`);
    } catch (e) {
        console.error("❌ Lock failed:", e);
        dedicatedTabId = null;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// 监听标签页关闭
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === dedicatedTabId) {
        console.log("🔓 Dedicated tab closed. Releasing lock.");
        dedicatedTabId = null;
    }
});

// 监听来自 content.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 用户手动点击了 "Connect" 按钮
    if (request.type === 'MANUAL_LOCK_REQUEST') {
        if (sender.tab) {
            console.log(`👆 User manually selected tab ${sender.tab.id}`);
            lockTab(sender.tab.id);
        }
        return;
    }
    
    // 转发响应给 WebSocket
    if (request.type === 'GEMINI_RESPONSE') {
        console.log(`📥 Response from content: ID=${request.id}, Length=${request.content?.length || 0}`);
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                id: request.id,
                content: request.content
            }));
            console.log("✅ Response sent to proxy");
        } else {
            console.error("❌ WebSocket not connected");
        }
    }
    
    return true;
});

// 初始连接
connect();

// Watchdog
setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log("💓 Reconnecting...");
        connect();
    }
}, 5000);

console.log("🎉 Gemini Bridge Background v6.1 (True Manual Mode) initialized");
