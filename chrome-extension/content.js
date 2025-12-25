// 防止重复注入 - 使用 IIFE 包装
(function() {
    if (window.GEMINI_BRIDGE_LOADED) {
        console.log("🔄 Gemini Bridge already loaded, skipping re-injection");
        return;
    }
    window.GEMINI_BRIDGE_LOADED = true;

    console.log("🚀 Gemini Bridge Loaded - v2.0 Debug Mode");

// 视觉反馈辅助函数
function setStatus(status) {
    if (status === 'working') {
        document.body.style.border = "5px solid red";
    } else if (status === 'success') {
        document.body.style.border = "5px solid green";
        setTimeout(() => document.body.style.border = "none", 1000);
    } else {
        document.body.style.border = "none";
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📥 Received prompt:", request);
    
    // 处理 PING 消息（健康检查）
    if (request.type === 'PING') {
        sendResponse({status: "alive"});
        return;
    }
    
    // 处理正常的提示消息
    if (request.prompt) {
        sendResponse({status: "received"});
        setStatus('working');
        runPrompt(request.id, request.prompt);
    }
});

async function runPrompt(id, text) {
    console.log(`🎯 [runPrompt] ID: ${id}, Text length: ${text.length}`);
    
    // 1. 寻找输入框
    const selectors = [
        'div[contenteditable="true"]',
        'rich-textarea div p',
        'textarea',
        '[role="textbox"]'
    ];
    
    let inputArea = null;
    for (const sel of selectors) {
        inputArea = document.querySelector(sel);
        if (inputArea) {
            console.log(`✅ [runPrompt] Found input with selector: ${sel}`);
            break;
        }
    }

    if (!inputArea) {
        console.error("❌ [runPrompt] 找不到输入框");
        chrome.runtime.sendMessage({ 
            type: 'GEMINI_RESPONSE', 
            id: id, 
            content: "Error: Input box not found on page." 
        });
        setStatus('error');
        return;
    }

    // 2. 填入文本
    console.log("📝 [runPrompt] Filling text...");
    inputArea.focus();
    
    if (inputArea.contentEditable === 'true') {
        inputArea.innerText = '';
        inputArea.focus();
        document.execCommand('insertText', false, text);
    } else {
        inputArea.value = text;
    }
    
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    inputArea.dispatchEvent(inputEvent);
    
    console.log("✅ [runPrompt] Text filled");
    
    // 3. 拟人化延迟 - 模拟人类的"思考时间"
    const humanDelay = Math.random() * 500 + 500; // 500ms-1000ms 随机延迟
    console.log(`⏱️ [runPrompt] Human-like delay: ${Math.round(humanDelay)}ms`);
    await new Promise(r => setTimeout(r, humanDelay));
    
    // 4. 使用键盘方式发送
    console.log("🚀 [runPrompt] Sending with Enter key");
    
    const sendEnter = () => {
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            view: window
        };
        
        inputArea.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        inputArea.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
        inputArea.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
    };
    
    // 连续发送两次 Enter
    sendEnter();
    await new Promise(r => setTimeout(r, 50));
    sendEnter();
    
    // 验证发送
    await new Promise(r => setTimeout(r, 1500));
    const currentText = inputArea.innerText || inputArea.textContent || inputArea.value || "";
    const sendSuccess = currentText.trim().length === 0;
    
    if (sendSuccess) {
        console.log("✅ [runPrompt] Send successful - input cleared");
    } else {
        console.warn("⚠️ [runPrompt] Input not cleared, continuing anyway");
    }

    // 5. 等待响应
    console.log("⏳ [runPrompt] Starting to wait for response...");
    waitForResponse(id, text);
}

function waitForResponse(id, userPrompt = "") {
    console.log("⏳ [waitForResponse] Starting to wait for response, ID:", id);
    
    const getPageText = () => {
        const main = document.querySelector('main');
        return main ? main.innerText : document.body.innerText;
    };
    
    const initialText = getPageText();
    const initialLength = initialText.length;
    console.log(`📊 [waitForResponse] Initial text length: ${initialLength}`);
    
    let lastText = initialText;
    let lastLength = initialLength;
    let stableCount = 0;
    const maxStable = 3;
    const checkInterval = 800;
    let checkCount = 0;
    let hasDetectedGrowth = false;
    let lastGrowthTime = Date.now();
    
    const checkLoop = setInterval(() => {
        checkCount++;
        const currentText = getPageText();
        const currentLength = currentText.length;
        
        // 检测"Stop responding"按钮
        const stopBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(btn => {
            const text = btn.innerText || btn.textContent || "";
            return text.includes("Stop responding") || text.includes("停止响应");
        });
        const isGenerating = !!stopBtn;
        
        // 检测输入框是否可用
        const inputArea = document.querySelector('div[contenteditable="true"], rich-textarea div p, textarea, [role="textbox"]');
        const isInputReady = inputArea && !inputArea.hasAttribute('disabled') && inputArea.offsetParent !== null;
        
        // 获取响应文本
        let responseText = "";
        const modelResponses = document.querySelectorAll('model-response.ng-star-inserted');
        if (modelResponses.length > 0) {
            const lastModelResponse = modelResponses[modelResponses.length - 1];
            const messageContent = lastModelResponse.querySelector('message-content .markdown, .markdown-main-panel, [id^="message-content-id"]');
            if (messageContent) {
                responseText = messageContent.innerText || messageContent.textContent || "";
            }
        }
        
        if (!responseText) {
            const messageContents = document.querySelectorAll('message-content');
            if (messageContents.length > 0) {
                const lastMessage = messageContents[messageContents.length - 1];
                const markdown = lastMessage.querySelector('.markdown');
                if (markdown) {
                    responseText = markdown.innerText || markdown.textContent || "";
                }
            }
        }

        console.log(`🔍 [waitForResponse] Check #${checkCount}: Length=${currentLength}, ResponseText=${responseText.length}, Stable=${stableCount}/${maxStable}, Generating=${isGenerating}`);

        if (currentLength > lastLength) {
            console.log(`📈 [waitForResponse] Text growing: ${lastLength} -> ${currentLength}`);
            lastText = currentText;
            lastLength = currentLength;
            stableCount = 0;
            hasDetectedGrowth = true;
            lastGrowthTime = Date.now();
        } else if (currentLength === lastLength && currentLength > initialLength) {
            if (!isGenerating) {
                stableCount++;
                console.log(`📊 [waitForResponse] Text stable (${stableCount}/${maxStable}): ${currentLength} chars`);
            } else {
                console.log(`⏸️ [waitForResponse] Still generating, resetting stability`);
                stableCount = 0;
            }
        }

        const isComplete = (
            (stableCount >= maxStable && hasDetectedGrowth && currentLength > initialLength && !isGenerating) ||
            (isInputReady && hasDetectedGrowth && currentLength > initialLength && stableCount >= 2 && !isGenerating) ||
            (responseText && responseText.length > 0 && stableCount >= 2 && !isGenerating)
        );

        if (isComplete) {
            clearInterval(checkLoop);
            console.log("✅ [waitForResponse] Response captured! Length:", currentLength);
            setStatus('success');
            
            let finalText = "";
            
            if (responseText && responseText.length > 0) {
                finalText = responseText;
                console.log("📝 [waitForResponse] Using responseText, length:", finalText.length);
            } else {
                const chatMessages = document.querySelectorAll('[class*="message"], [data-message-id]');
                if (chatMessages.length > 0) {
                    for (let i = chatMessages.length - 1; i >= 0; i--) {
                        const msg = chatMessages[i];
                        const msgText = msg.innerText || msg.textContent || "";
                        if (msgText.length > 0 && 
                            !msgText.includes("Expand menu") && 
                            !msgText.includes("New chat") &&
                            !msgText.includes("Use microphone") &&
                            !msgText.includes("Settings & help") &&
                            !msgText.includes("Add files") &&
                            msgText !== userPrompt) {
                            finalText = msgText;
                            console.log("📝 [waitForResponse] Found message from chat area");
                            break;
                        }
                    }
                }
                
                if (!finalText || finalText.length < 10) {
                    finalText = currentText.substring(initialLength)
                        .replace(/Expand menu.*?New chat/gi, '')
                        .replace(/Use microphone.*?Gemini/gi, '')
                        .replace(/Settings & help.*/gi, '')
                        .replace(/Add files.*/gi, '')
                        .trim();
                }
            }
            
            chrome.runtime.sendMessage({
                type: 'GEMINI_RESPONSE',
                id: id,
                content: finalText.trim() || "Response received but content extraction failed"
            }).catch(err => {
                console.error("❌ [waitForResponse] Failed to send response:", err);
            });
        }
    }, checkInterval);
    
    // 120秒硬超时
    setTimeout(() => {
        clearInterval(checkLoop);
        console.warn(`⏱️ [waitForResponse] Timeout after 120s`);
        
        if (stableCount < maxStable) {
            if (hasDetectedGrowth && lastLength > initialLength) {
                console.log("🔄 [waitForResponse] Returning partial response");
                
                let partialText = "";
                const modelResponses = document.querySelectorAll('model-response.ng-star-inserted');
                if (modelResponses.length > 0) {
                    const lastModelResponse = modelResponses[modelResponses.length - 1];
                    const messageContent = lastModelResponse.querySelector('message-content .markdown, .markdown-main-panel');
                    if (messageContent) {
                        partialText = messageContent.innerText || messageContent.textContent || "";
                    }
                }
                
                if (partialText && partialText.length > 0) {
                    chrome.runtime.sendMessage({ 
                        type: 'GEMINI_RESPONSE', 
                        id: id, 
                        content: partialText.trim()
                    }).catch(err => console.error("❌ Failed to send partial response:", err));
                } else {
                    const diffText = lastText.substring(initialLength);
                    chrome.runtime.sendMessage({ 
                        type: 'GEMINI_RESPONSE', 
                        id: id, 
                        content: diffText.trim() || "Response partially captured"
                    }).catch(err => console.error("❌ Failed to send diff response:", err));
                }
            } else {
                chrome.runtime.sendMessage({ 
                    type: 'GEMINI_RESPONSE', 
                    id: id, 
                    content: "Error: Timeout waiting for response" 
                }).catch(err => console.error("❌ Failed to send timeout response:", err));
            }
        }
    }, 120000);
}

})(); // 结束 IIFE
