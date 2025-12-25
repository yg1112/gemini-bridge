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
    waitForResponse(id);
}

function waitForResponse(id) {
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
    const maxStable = 5; // 连续 5 次检查文本没变，认为生成结束
    const checkInterval = 1000; // 每秒检查一次
    let checkCount = 0;
    
    const checkLoop = setInterval(() => {
        checkCount++;
        const currentText = getPageText();
        const currentLength = currentText.length;
        
        // 尝试多种选择器获取响应
        const responses = document.querySelectorAll('.message-content, model-response, [data-message-id], [class*="response"], [class*="message"]');
        let responseText = "";
        if (responses.length > 0) {
            responseText = responses[responses.length - 1].innerText || responses[responses.length - 1].textContent || "";
        }

        console.log(`🔍 [waitForResponse] Check #${checkCount}: Page length=${currentLength}, Response elements=${responses.length}, Stable=${stableCount}/${maxStable}`);

        // 检测文本是否在增长
        if (currentLength > lastLength) {
            console.log(`📈 [waitForResponse] Text growing: ${lastLength} -> ${currentLength}`);
            lastText = currentText;
            lastLength = currentLength;
            stableCount = 0;
        } else if (currentLength === lastLength && currentLength > initialLength) {
            // 长度稳定且比初始长度大（说明有内容）
            stableCount++;
            console.log(`📊 [waitForResponse] Text stable (${stableCount}/${maxStable}): ${currentLength} chars`);
        }

        // 如果稳定了 N 秒，且内容不为空
        if (stableCount >= maxStable && currentLength > initialLength) {
            clearInterval(checkLoop);
            console.log("✅ [waitForResponse] Response captured! Length:", currentLength);
            setStatus('success');
            
            // 提取增量文本（最后一条消息）
            let finalText = currentText;
            if (responseText) {
                finalText = responseText;
            } else {
                // 如果没有找到特定响应元素，返回整个页面的增量部分
                finalText = currentText.substring(initialLength);
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
        console.warn(`⏱️ [waitForResponse] Timeout after 120s, stableCount=${stableCount}`);
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
