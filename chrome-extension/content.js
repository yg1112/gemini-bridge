// content.js - v4.0 Singleton Architecture
(function() {
    // --- 1. 单例控制 (核心修复) ---
    // 生成当前实例的唯一 ID
    const currentInstanceId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    console.log(`🚀 Bridge Instance Starting: ${currentInstanceId}`);

    // 抢占全局控制权
    window.__BRIDGE_INSTANCE_ID = currentInstanceId;

    // --- 2. 状态定义 ---
    const STATE = {
        IDLE: 'idle',
        TYPING: 'typing',
        WAITING: 'waiting',
        GENERATING: 'generating',
        COMPLETE: 'complete'
    };
    let currentState = STATE.IDLE;

    // --- 3. 消息监听器 ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // [关键] 自杀检查：如果当前全局 ID 不等于我的 ID，说明我是旧脚本，闭嘴退出
        if (window.__BRIDGE_INSTANCE_ID !== currentInstanceId) {
            console.warn(`👻 [Zombie] Instance ${currentInstanceId.substring(0, 10)}... is obsolete. Ignoring.`);
            return false;
        }

        console.log("📥 Received:", request);

        // PING 响应
        if (request.type === 'PING') {
            sendResponse({ status: 'pong', instanceId: currentInstanceId });
            return;
        }

        // 立即握手
        sendResponse({ status: 'processing' });

        if (request.prompt) {
            runTask(request.id, request.prompt);
        }
        return false;
    });

    // --- 4. 任务执行主流程 ---
    async function runTask(id, text) {
        try {
            currentState = STATE.TYPING;
            setStatus('working');
            console.log(`🎯 [runTask] ID: ${id}, Text: "${text.substring(0, 30)}..."`);

            // A. 寻找并聚焦输入框
            const inputArea = await waitForElement([
                'div[contenteditable="true"]',
                'rich-textarea div p',
                '[role="textbox"]'
            ]);
            console.log("✅ Found input area");
            
            inputArea.focus();
            await sleep(100);
            
            // B. 拟人化输入
            console.log("⌨️ Starting human-like typing...");
            
            // 先清空
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            await sleep(50);
            
            // 逐字输入
            for (const char of text) {
                // 检查是否被新脚本中断
                if (window.__BRIDGE_INSTANCE_ID !== currentInstanceId) {
                    console.warn("👻 Interrupted by new instance");
                    return;
                }

                document.execCommand('insertText', false, char);
                await sleep(Math.random() * 35 + 15);
            }
            console.log("✅ Text filled");

            // C. 发送指令
            await sleep(300 + Math.random() * 200);
            
            const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="发送"], .send-button');
            if (sendBtn && !sendBtn.disabled) {
                console.log("🖱️ Clicking send button");
                sendBtn.click();
            } else {
                console.log("⌨️ Using Enter key");
                const enterEvent = new KeyboardEvent('keydown', {
                    bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter'
                });
                inputArea.dispatchEvent(enterEvent);
            }

            // D. 监控响应
            await waitForResponse(id);

        } catch (e) {
            console.error("❌ Task Failed:", e);
            reportResult(id, `Error: ${e.message}`);
            setStatus('error');
        } finally {
            currentState = STATE.IDLE;
        }
    }

    // --- 5. 响应监控 (MutationObserver + 状态机) ---
    function waitForResponse(id) {
        return new Promise((resolve, reject) => {
            console.log("⏳ Waiting for response...");
            currentState = STATE.WAITING;

            let responseText = "";
            let silenceTimer = null;
            let hasStarted = false;
            let startWaitTime = Date.now();
            
            // 观察器：监听 DOM 变化
            const observer = new MutationObserver((mutations) => {
                // 自杀检查
                if (window.__BRIDGE_INSTANCE_ID !== currentInstanceId) {
                    console.warn("👻 Observer killed by new instance");
                    observer.disconnect();
                    return;
                }

                // 检测 Stop 按钮（最可靠的生成中标志）
                const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"]');
                
                if (stopBtn) {
                    if (!hasStarted) {
                        console.log("🚀 Generation Started (Stop button found)");
                        hasStarted = true;
                        currentState = STATE.GENERATING;
                    }
                    // 还在生成，重置静默计时器
                    if (silenceTimer) {
                        clearTimeout(silenceTimer);
                        silenceTimer = null;
                    }
                } 
                else if (hasStarted) {
                    // 曾经开始过，现在 Stop 按钮没了 -> 可能结束了
                    if (!silenceTimer) {
                        console.log("⏸️ Stop button gone, waiting for stability...");
                        silenceTimer = setTimeout(() => {
                            finish();
                        }, 1500);
                    }
                }
                else {
                    // 还没开始，检测页面变化
                    const elapsed = Date.now() - startWaitTime;
                    
                    // 备用检测：页面文本增长
                    const modelResponses = document.querySelectorAll('model-response');
                    if (modelResponses.length > 0) {
                        const lastResponse = modelResponses[modelResponses.length - 1];
                        const text = lastResponse.innerText || "";
                        if (text.length > 10) {
                            console.log("🚀 Generation Started (text detected)");
                            hasStarted = true;
                            currentState = STATE.GENERATING;
                        }
                    }
                    
                    // 超时检查
                    if (elapsed > 15000 && !hasStarted) {
                        console.error("❌ No response started after 15s");
                        observer.disconnect();
                        reportResult(id, "Error: Gemini did not start responding. Message may not have been sent.");
                        setStatus('error');
                        resolve();
                    }
                }
            });

            observer.observe(document.body, { 
                childList: true, 
                subtree: true, 
                characterData: true 
            });

            // 提取结果并结束
            const finish = () => {
                observer.disconnect();
                currentState = STATE.COMPLETE;
                
                // 提取最后一条回答
                const responses = document.querySelectorAll('model-response');
                if (responses.length > 0) {
                    const lastNode = responses[responses.length - 1];
                    // 尝试找 .markdown 子元素
                    const markdown = lastNode.querySelector('.markdown');
                    responseText = markdown 
                        ? (markdown.textContent || markdown.innerText)
                        : (lastNode.innerText || lastNode.textContent);
                    
                    // 清理
                    responseText = responseText
                        .replace(/Show thinking/g, '')
                        .replace(/View analysis/g, '')
                        .replace(/Gemini can make mistakes.*$/gim, '')
                        .trim();
                }
                
                if (!responseText || responseText.length < 5) {
                    responseText = "Error: Could not extract response text";
                }

                console.log(`✅ Generation Complete! Length: ${responseText.length}`);
                console.log(`📄 Preview: ${responseText.substring(0, 100)}...`);
                
                reportResult(id, responseText);
                setStatus('success');
                resolve();
            };

            // 60秒硬超时兜底
            setTimeout(() => {
                if (currentState !== STATE.IDLE && currentState !== STATE.COMPLETE) {
                    observer.disconnect();
                    console.warn("⏱️ Hard Timeout (60s)");
                    
                    if (hasStarted) {
                        // 如果已经开始生成，尝试提取现有内容
                        finish();
                    } else {
                        reportResult(id, "Error: Timeout - Gemini did not respond");
                        setStatus('error');
                        resolve();
                    }
                }
            }, 60000);
        });
    }

    // --- 辅助工具 ---
    function reportResult(id, content) {
        console.log(`📤 Sending result for ID: ${id}`);
        chrome.runtime.sendMessage({ 
            type: 'GEMINI_RESPONSE', 
            id: id, 
            content: content 
        }).catch(err => console.error("Failed to send result:", err));
    }

    function setStatus(status) {
        if (status === 'working') {
            document.body.style.borderTop = "5px solid orange";
        } else if (status === 'success') {
            document.body.style.borderTop = "5px solid green";
            setTimeout(() => document.body.style.borderTop = "none", 2000);
        } else if (status === 'error') {
            document.body.style.borderTop = "5px solid red";
            setTimeout(() => document.body.style.borderTop = "none", 3000);
        } else {
            document.body.style.borderTop = "none";
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
        throw new Error("Element not found: " + selectors.join(", "));
    }

    console.log(`✅ Instance ${currentInstanceId} Ready and Listening.`);
})();
