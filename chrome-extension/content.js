// content.js - v6.0 Smart UI & Manual Override (Gentleman Mode)
(function() {
    // 1. 单例控制
    const currentInstanceId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    window.__BRIDGE_INSTANCE_ID = currentInstanceId;

    // UI 元素引用
    let controlPanel = null;
    let isLocked = false;

    // --- 初始化 ---
    function init() {
        console.log(`🚀 Bridge v6.0 Initialized: ${currentInstanceId}`);
        createControlPanel();
        
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (window.__BRIDGE_INSTANCE_ID !== currentInstanceId) {
                console.warn(`👻 Zombie instance ${currentInstanceId.substring(0, 8)}... ignoring`);
                return false;
            }

            console.log("📥 Received:", request.type || request);

            // 1. 侦查请求：汇报当前页面状态
            if (request.type === 'SCOUT_REPORT') {
                const status = analyzePage();
                sendResponse(status);
                updateUI(status.isNewChat, false);
                return;
            }

            // 2. 锁定通知：我被选中了
            if (request.type === 'LOCK_GRANTED') {
                isLocked = true;
                setStatus('active');
                updateUI(analyzePage().isNewChat, true);
                sendResponse({ status: "locked" });
                return;
            }

            // 3. 解锁通知：我被释放了
            if (request.type === 'LOCK_RELEASED') {
                isLocked = false;
                setStatus('idle');
                updateUI(analyzePage().isNewChat, false);
                sendResponse({ status: "released" });
                return;
            }

            // 4. PING
            if (request.type === 'PING') {
                sendResponse({ status: 'pong', instanceId: currentInstanceId, isLocked });
                return;
            }

            // 5. 执行任务
            if (request.prompt) {
                sendResponse({ status: "processing" });
                runTask(request.id, request.prompt);
            }
            
            return false;
        });
    }

    // --- 页面分析逻辑 ---
    function analyzePage() {
        const historyCount = document.querySelectorAll('message-content, model-response').length;
        const isNewChat = historyCount <= 1;

        return {
            instanceId: currentInstanceId,
            isNewChat: isNewChat,
            historyCount: historyCount,
            title: document.title
        };
    }

    // --- UI 界面逻辑 ---
    function createControlPanel() {
        if (document.getElementById('gemini-bridge-panel')) {
            controlPanel = document.getElementById('gemini-bridge-panel');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'gemini-bridge-panel';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 99999;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 10px 14px;
            border-radius: 10px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        `;

        const statusText = document.createElement('span');
        statusText.id = 'gb-status-text';
        statusText.innerText = '🔍 Bridge Detected';

        const actionBtn = document.createElement('button');
        actionBtn.id = 'gb-action-btn';
        actionBtn.innerText = 'Connect';
        actionBtn.style.cssText = `
            background: #4CAF50;
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
            transition: all 0.2s ease;
        `;
        
        actionBtn.onmouseenter = () => actionBtn.style.opacity = '0.8';
        actionBtn.onmouseleave = () => actionBtn.style.opacity = '1';
        
        actionBtn.onclick = () => {
            console.log("👆 User manually activated this tab");
            chrome.runtime.sendMessage({ 
                type: 'MANUAL_LOCK_REQUEST', 
                instanceId: currentInstanceId 
            });
        };

        panel.appendChild(statusText);
        panel.appendChild(actionBtn);
        document.body.appendChild(panel);
        controlPanel = panel;
        
        // 初始状态
        updateUI(analyzePage().isNewChat, false);
    }

    function updateUI(isNewChat, locked) {
        if (!controlPanel) return;
        const text = controlPanel.querySelector('#gb-status-text');
        const btn = controlPanel.querySelector('#gb-action-btn');

        if (locked) {
            controlPanel.style.border = "2px solid #4CAF50";
            controlPanel.style.background = "rgba(76, 175, 80, 0.9)";
            text.innerText = "🟢 Bridge ACTIVE";
            btn.style.display = 'none';
            document.body.style.borderTop = "4px solid #4CAF50";
        } else {
            document.body.style.borderTop = "none";
            controlPanel.style.background = "rgba(0, 0, 0, 0.85)";
            
            if (isNewChat) {
                controlPanel.style.border = "2px solid #FFC107";
                text.innerText = "🟡 Ready (New Chat)";
                btn.innerText = "Connect";
                btn.style.display = 'block';
                btn.style.background = '#4CAF50';
            } else {
                controlPanel.style.border = "2px solid #FF5722";
                text.innerText = "🔴 Busy (Has History)";
                btn.innerText = "Force Connect";
                btn.style.display = 'block';
                btn.style.background = '#FF5722';
            }
        }
    }

    function setStatus(status) {
        if (status === 'active') {
            document.body.style.borderTop = "4px solid #4CAF50";
        } else if (status === 'working') {
            document.body.style.borderTop = "4px solid orange";
        } else if (status === 'success') {
            document.body.style.borderTop = "4px solid #4CAF50";
            setTimeout(() => {
                if (isLocked) document.body.style.borderTop = "4px solid #4CAF50";
                else document.body.style.borderTop = "none";
            }, 2000);
        } else if (status === 'error') {
            document.body.style.borderTop = "4px solid red";
            setTimeout(() => {
                if (isLocked) document.body.style.borderTop = "4px solid #4CAF50";
                else document.body.style.borderTop = "none";
            }, 3000);
        } else {
            if (!isLocked) document.body.style.borderTop = "none";
        }
    }

    // --- 任务执行 ---
    async function runTask(id, text) {
        try {
            setStatus('working');
            console.log(`🎯 [runTask] ID: ${id}, Text: "${text.substring(0, 30)}..."`);

            const inputArea = await waitForElement([
                'div[contenteditable="true"]',
                'rich-textarea div p',
                '[role="textbox"]'
            ]);
            
            inputArea.focus();
            await sleep(100);
            
            // 清空并逐字输入
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            await sleep(50);
            
            for (const char of text) {
                if (window.__BRIDGE_INSTANCE_ID !== currentInstanceId) return;
                document.execCommand('insertText', false, char);
                await sleep(Math.random() * 25 + 10);
            }
            
            console.log("✅ Text filled");
            await sleep(300 + Math.random() * 200);
            
            // 发送
            const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="发送"], .send-button');
            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
                console.log("🖱️ Clicked send button");
            } else {
                inputArea.dispatchEvent(new KeyboardEvent('keydown', {
                    keyCode: 13, key: 'Enter', code: 'Enter', bubbles: true
                }));
                console.log("⌨️ Sent with Enter key");
            }
            
            await waitForResponse(id);
            
        } catch (e) {
            console.error("❌ Task failed:", e);
            chrome.runtime.sendMessage({ type: 'GEMINI_RESPONSE', id, content: `Error: ${e.message}` });
            setStatus('error');
        }
    }

    // --- 响应监控 ---
    function waitForResponse(id) {
        return new Promise((resolve) => {
            console.log("⏳ Waiting for response...");
            let hasStarted = false;
            let silenceTimer = null;
            let startTime = Date.now();

            const observer = new MutationObserver(() => {
                if (window.__BRIDGE_INSTANCE_ID !== currentInstanceId) {
                    observer.disconnect();
                    return;
                }

                const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"]');
                
                if (stopBtn) {
                    if (!hasStarted) {
                        console.log("🚀 Generation started");
                        hasStarted = true;
                    }
                    if (silenceTimer) {
                        clearTimeout(silenceTimer);
                        silenceTimer = null;
                    }
                } else if (hasStarted) {
                    if (!silenceTimer) {
                        silenceTimer = setTimeout(() => {
                            finish();
                        }, 1500);
                    }
                } else {
                    // 检查是否有新内容
                    const elapsed = Date.now() - startTime;
                    if (elapsed > 15000) {
                        console.error("❌ No response after 15s");
                        observer.disconnect();
                        chrome.runtime.sendMessage({ 
                            type: 'GEMINI_RESPONSE', 
                            id, 
                            content: "Error: No response from Gemini" 
                        });
                        setStatus('error');
                        resolve();
                    }
                }
            });

            const finish = () => {
                observer.disconnect();
                
                let responseText = "";
                const responses = document.querySelectorAll('model-response');
                if (responses.length > 0) {
                    const lastNode = responses[responses.length - 1];
                    const markdown = lastNode.querySelector('.markdown');
                    responseText = markdown 
                        ? (markdown.textContent || markdown.innerText)
                        : (lastNode.innerText || lastNode.textContent);
                    
                    responseText = responseText
                        .replace(/Show thinking/g, '')
                        .replace(/View analysis/g, '')
                        .replace(/Gemini can make mistakes.*$/gim, '')
                        .trim();
                }
                
                if (!responseText || responseText.length < 3) {
                    responseText = "Error: Could not extract response";
                }

                console.log(`✅ Done! Length: ${responseText.length}`);
                chrome.runtime.sendMessage({ type: 'GEMINI_RESPONSE', id, content: responseText });
                setStatus('success');
                resolve();
            };

            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            // 60s 硬超时
            setTimeout(() => {
                observer.disconnect();
                if (hasStarted) {
                    finish();
                } else {
                    chrome.runtime.sendMessage({ type: 'GEMINI_RESPONSE', id, content: "Error: Timeout" });
                    setStatus('error');
                    resolve();
                }
            }, 60000);
        });
    }

    // --- 工具函数 ---
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function waitForElement(selectors, timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return el;
            }
            await sleep(100);
        }
        throw new Error("Element not found");
    }

    init();
    console.log(`✅ Instance ${currentInstanceId} Ready`);
})();
