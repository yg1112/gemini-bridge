console.log("🚀 Gemini Bridge Loaded");

// 监听来自 Background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📥 Received message from background:", request);
    if (request.prompt) {
        runPrompt(request.id, request.prompt);
    }
    return true; // 保持消息通道开放
});

async function runPrompt(id, text) {
    console.log(`🎯 Running prompt (ID: ${id}):`, text.substring(0, 50) + "...");
    
    // 1. 找到输入框 (尝试多种选择器)
    let inputArea = document.querySelector('div[contenteditable="true"]');
    
    // 如果找不到，尝试其他选择器
    if (!inputArea) {
        inputArea = document.querySelector('textarea[placeholder*="message"], textarea[aria-label*="message"]');
    }
    if (!inputArea) {
        inputArea = document.querySelector('[contenteditable="true"][role="textbox"]');
    }
    
    if (!inputArea) {
        console.error("❌ 找不到 Gemini 输入框！");
        // 发送错误响应
        chrome.runtime.sendMessage({
            type: 'GEMINI_RESPONSE',
            id: id,
            content: "错误：找不到 Gemini 输入框，请确保你在聊天界面！"
        });
        return;
    }

    console.log("✅ 找到输入框");

    // 2. 填入文本 (模拟用户输入)
    inputArea.focus();
    
    // 清空现有内容
    inputArea.innerText = '';
    inputArea.textContent = '';
    
    // 使用多种方法填入文本
    try {
        document.execCommand('insertText', false, text);
    } catch (e) {
        // 如果 execCommand 失败，直接设置内容
        inputArea.innerText = text;
        inputArea.textContent = text;
        
        // 触发输入事件
        const inputEvent = new Event('input', { bubbles: true });
        inputArea.dispatchEvent(inputEvent);
    }

    console.log("✅ 文本已填入");

    // 3. 点击发送按钮 (尝试多种选择器)
    await new Promise(r => setTimeout(r, 500)); // 等待 UI 响应
    
    let sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="发送"]');
    if (!sendBtn) {
        sendBtn = document.querySelector('button[data-testid*="send"], button[type="submit"]');
    }
    if (!sendBtn) {
        // 尝试通过键盘事件发送
        console.log("⚠️ 找不到发送按钮，尝试模拟回车...");
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        inputArea.dispatchEvent(enterEvent);
    } else {
        sendBtn.click();
        console.log("✅ 已点击发送按钮");
    }

    // 4. 监听回复生成
    waitForResponse(id);
}

function waitForResponse(id) {
    console.log("⏳ Waiting for Gemini response (ID: " + id + ")...");
    
    // 获取当前已有的所有回答，用于对比
    // 尝试多种选择器来找到响应容器
    let existingResponses = document.querySelectorAll('model-response');
    if (existingResponses.length === 0) {
        existingResponses = document.querySelectorAll('[data-model-response], [class*="response"], [class*="message"]');
    }
    
    const initialCount = existingResponses.length;
    console.log(`📊 初始响应数量: ${initialCount}`);
    
    let debounceTimer = null;
    let lastTextLength = 0;
    let stableCount = 0;
    const maxStableChecks = 3; // 连续3次长度不变则认为完成

    const observer = new MutationObserver((mutations) => {
        // 尝试多种选择器
        let responses = document.querySelectorAll('model-response');
        if (responses.length === 0) {
            responses = document.querySelectorAll('[data-model-response]');
        }
        if (responses.length === 0) {
            // 尝试找到包含文本的响应区域
            responses = document.querySelectorAll('[class*="response"] [class*="text"], [class*="message"] [class*="content"]');
        }
        
        if (responses.length > initialCount) {
            const lastResponse = responses[responses.length - 1];
            const responseText = lastResponse.innerText || lastResponse.textContent || '';
            const currentLength = responseText.length;
            
            console.log(`📝 检测到响应，当前长度: ${currentLength}`);
            
            if (currentLength > 0) {
                // 检查文本长度是否稳定
                if (currentLength === lastTextLength) {
                    stableCount++;
                    console.log(`📊 文本长度稳定 (${stableCount}/${maxStableChecks})`);
                } else {
                    stableCount = 0;
                    lastTextLength = currentLength;
                }
                
                // 如果文本长度稳定，或者超过一定长度，认为生成完成
                if (stableCount >= maxStableChecks || currentLength > 1000) {
                    // 防抖：再等2秒确保完全生成
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        observer.disconnect();
                        console.log("✅ Response captured! 长度:", responseText.length);
                        
                        // 发送回 Background
                        chrome.runtime.sendMessage({
                            type: 'GEMINI_RESPONSE',
                            id: id,
                            content: responseText
                        }).catch(err => {
                            console.error("❌ Failed to send response:", err);
                        });
                    }, 2000);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // 超时保护：120秒后强制返回
    setTimeout(() => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        observer.disconnect();
        console.warn("⏱️ 响应超时，返回空响应");
        chrome.runtime.sendMessage({
            type: 'GEMINI_RESPONSE',
            id: id,
            content: "错误：等待 Gemini 响应超时"
        }).catch(err => console.error("❌ Failed to send timeout response:", err));
    }, 120000);
}
