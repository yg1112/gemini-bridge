// 引用 content.js 覆盖
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
    if (request.prompt) {
        setStatus('working');
        runPrompt(request.id, request.prompt);
    }
    return true;
});

async function runPrompt(id, text) {
    console.log(`🎯 [runPrompt] ID: ${id}, Text length: ${text.length}`);
    
    // 1. 寻找输入框 (更新的选择器列表)
    const selectors = [
        'div[contenteditable="true"]',
        'rich-textarea div p', // 新版 Gemini 常见
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
        chrome.runtime.sendMessage({ type: 'GEMINI_RESPONSE', id: id, content: "Error: Input box not found on page." });
        setStatus('error');
        return;
    }

    // 2. 填入文本
    console.log("📝 [runPrompt] Filling text...");
    inputArea.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    console.log("✅ [runPrompt] Text filled");
    
    // 3. 点击发送
    await new Promise(r => setTimeout(r, 800)); // 稍等 UI 反应
    
    const sendBtnSelectors = [
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        '.send-button', // 通用类名猜测
        'button[data-testid="send-button"]'
    ];
    
    let sendBtn = null;
    for (const sel of sendBtnSelectors) {
        sendBtn = document.querySelector(sel);
        if (sendBtn) {
            console.log(`✅ [runPrompt] Found send button with selector: ${sel}`);
            break;
        }
    }
    
    if (sendBtn) {
        console.log("🚀 [runPrompt] Clicking send button");
        sendBtn.click();
    } else {
        console.log("⚠️ [runPrompt] No send button found, using Enter key");
        // 回退方案：回车键
        const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter'
        });
        inputArea.dispatchEvent(enterEvent);
    }

    // 4. 等待响应
    console.log("⏳ [runPrompt] Starting to wait for response...");
    waitForResponse(id, text);
}

function waitForResponse(id, userPrompt = "") {
    console.log("⏳ [waitForResponse] Starting to wait for response, ID:", id);
    
    // 记录初始文本长度作为基准
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
    const maxStable = 3; // 连续 3 次检查文本没变，认为生成结束（减少等待时间）
    const checkInterval = 800; // 每 800ms 检查一次（更频繁）
    let checkCount = 0;
    let hasDetectedGrowth = false; // 是否检测到文本增长
    
    const checkLoop = setInterval(() => {
        checkCount++;
        const currentText = getPageText();
        const currentLength = currentText.length;
        
        // 检测响应完成的多种方法
        // 1. 检测"Show thinking"按钮（Gemini响应完成的标志）
        const showThinkingBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(btn => {
            const text = btn.innerText || btn.textContent || "";
            return text.includes("Show thinking") || text.includes("thinking");
        });
        // 2. 检测输入框重新可用（响应完成后输入框会重新可用）
        const inputArea = document.querySelector('div[contenteditable="true"], rich-textarea div p, textarea, [role="textbox"]');
        const isInputReady = inputArea && !inputArea.hasAttribute('disabled') && inputArea.offsetParent !== null;
        
        // 3. 尝试多种选择器获取响应（根据实际 DOM 结构优化）
        let responseText = "";
        
        // 方法1: 使用 model-response 标签（最准确）
        const modelResponses = document.querySelectorAll('model-response.ng-star-inserted');
        if (modelResponses.length > 0) {
            const lastModelResponse = modelResponses[modelResponses.length - 1];
            // 在 model-response 中查找 message-content 或 .markdown 容器
            const messageContent = lastModelResponse.querySelector('message-content .markdown, .markdown-main-panel, [id^="message-content-id"]');
            if (messageContent) {
                responseText = messageContent.innerText || messageContent.textContent || "";
            }
        }
        
        // 方法2: 直接查找 message-content（备用）
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

        console.log(`🔍 [waitForResponse] Check #${checkCount}: Length=${currentLength}, ResponseText=${responseText.length}, Stable=${stableCount}/${maxStable}, InputReady=${isInputReady}`);

        // 检测文本是否在增长
        if (currentLength > lastLength) {
            console.log(`📈 [waitForResponse] Text growing: ${lastLength} -> ${currentLength}`);
            lastText = currentText;
            lastLength = currentLength;
            stableCount = 0;
            hasDetectedGrowth = true;
        } else if (currentLength === lastLength && currentLength > initialLength) {
            // 长度稳定且比初始长度大（说明有内容）
            stableCount++;
            console.log(`📊 [waitForResponse] Text stable (${stableCount}/${maxStable}): ${currentLength} chars`);
        }

        // 检测完成条件：多种方式
        const isComplete = (
            // 方式1: 文本稳定且检测到过增长
            (stableCount >= maxStable && hasDetectedGrowth && currentLength > initialLength) ||
            // 方式2: 输入框重新可用且文本长度大于初始值（说明响应已完成）
            (isInputReady && hasDetectedGrowth && currentLength > initialLength && stableCount >= 2) ||
            // 方式3: 找到响应文本且稳定
            (responseText && responseText.length > 0 && stableCount >= 2)
        );

        if (isComplete) {
            clearInterval(checkLoop);
            console.log("✅ [waitForResponse] Response captured! Length:", currentLength);
            setStatus('success');
            
            // 提取增量文本（最后一条消息）
            let finalText = "";
            
            // 方法1: 使用已找到的响应文本
            if (responseText && responseText.length > 0) {
                finalText = responseText;
                console.log("📝 [waitForResponse] Using responseText, length:", finalText.length);
            } else {
                // 方法2: 查找对话区域中的最后一条消息（排除用户消息）
                const chatMessages = document.querySelectorAll('[class*="message"], [data-message-id], [class*="conversation"] [class*="item"]');
                if (chatMessages.length > 0) {
                    // 从后往前找，跳过用户消息和UI元素
                    for (let i = chatMessages.length - 1; i >= 0; i--) {
                        const msg = chatMessages[i];
                        const msgText = msg.innerText || msg.textContent || "";
                        // 排除UI元素关键词和用户消息
                        if (msgText.length > 0 && 
                            !msgText.includes("Expand menu") && 
                            !msgText.includes("New chat") &&
                            !msgText.includes("Use microphone") &&
                            !msgText.includes("Settings & help") &&
                            !msgText.includes("Add files") &&
                            msgText !== userPrompt) { // 排除用户刚发送的消息
                            finalText = msgText;
                            console.log("📝 [waitForResponse] Found message from chat area, length:", finalText.length);
                            break;
                        }
                    }
                }
                
                // 方法3: 如果还是找不到，尝试从main区域提取最后一段文本
                if (!finalText || finalText.length < 10) {
                    const main = document.querySelector('main');
                    if (main) {
                        // 获取所有文本节点，找到最后一段有意义的文本
                        const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
                        const textNodes = [];
                        let node;
                        while (node = walker.nextNode()) {
                            const text = node.textContent.trim();
                            if (text.length > 5 && 
                                !text.includes("Expand") && 
                                !text.includes("New chat") &&
                                !text.includes("Settings")) {
                                textNodes.push(text);
                            }
                        }
                        if (textNodes.length > 0) {
                            // 取最后一段文本（通常是Gemini的回复）
                            finalText = textNodes[textNodes.length - 1];
                            console.log("📝 [waitForResponse] Using last text node, length:", finalText.length);
                        }
                    }
                }
                
                // 方法4: 最后手段 - 提取增量部分但清理UI元素
                if (!finalText || finalText.length < 10) {
                    const diffText = currentText.substring(initialLength);
                    // 移除常见的UI元素文本
                    finalText = diffText
                        .replace(/Expand menu.*?New chat/gi, '')
                        .replace(/Use microphone.*?Gemini/gi, '')
                        .replace(/Settings & help.*/gi, '')
                        .replace(/Add files.*/gi, '')
                        .trim();
                    console.log("📝 [waitForResponse] Using cleaned diff text, length:", finalText.length);
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
        console.warn(`⏱️ [waitForResponse] Timeout after 120s, stableCount=${stableCount}, hasDetectedGrowth=${hasDetectedGrowth}`);
        if (stableCount < maxStable) {
            chrome.runtime.sendMessage({ 
                type: 'GEMINI_RESPONSE', 
                id: id, 
                content: "Error: Timeout waiting for DOM stability." 
            }).catch(err => {
                console.error("❌ [waitForResponse] Failed to send timeout response:", err);
            });
        }
    }, 120000);
}
