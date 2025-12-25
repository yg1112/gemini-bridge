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
        if (inputArea) break;
    }

    if (!inputArea) {
        console.error("❌ 找不到输入框");
        chrome.runtime.sendMessage({ type: 'GEMINI_RESPONSE', id: id, content: "Error: Input box not found on page." });
        setStatus('error');
        return;
    }

    // 2. 填入文本
    inputArea.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    
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
        if (sendBtn) break;
    }
    
    if (sendBtn) {
        sendBtn.click();
    } else {
        // 回退方案：回车键
        const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter'
        });
        inputArea.dispatchEvent(enterEvent);
    }

    // 4. 等待响应
    waitForResponse(id);
}

function waitForResponse(id) {
    console.log("⏳ Waiting for response...");
    
    let lastText = "";
    let stableCount = 0;
    const maxStable = 5; // 连续 5 次检查文本没变，认为生成结束
    const checkInterval = 1000; // 每秒检查一次
    
    // 获取当前页面所有文本内容作为基准
    // 注意：这里我们简化逻辑，获取页面上最后一条消息
    const checkLoop = setInterval(() => {
        // 尝试获取最新的回复容器
        // Gemini 的回复通常在特定的 container 里，但直接抓取最后生成的文本更通用
        const responses = document.querySelectorAll('.message-content, model-response, [data-message-id]');
        
        let currentText = "";
        if (responses.length > 0) {
            currentText = responses[responses.length - 1].innerText;
        } else {
            // 实在找不到特定类名，就抓取 main 区域的文本长度变化
            const main = document.querySelector('main');
            if (main) currentText = main.innerText;
        }

        console.log(`Checking stability... Length: ${currentText.length}`);

        if (currentText.length > lastText.length) {
            // 还在生成中
            lastText = currentText;
            stableCount = 0;
        } else if (currentText.length === lastText.length && currentText.length > 0) {
            // 长度稳定
            stableCount++;
        }

        // 如果稳定了 N 秒，且内容不为空 (或者超时 120s)
        if (stableCount >= maxStable) {
            clearInterval(checkLoop);
            console.log("✅ Response captured!");
            setStatus('success');
            
            // 提取真正的增量文本（如果是对话流，这里可能需要优化，目前先返回全部最后一轮）
            chrome.runtime.sendMessage({
                type: 'GEMINI_RESPONSE',
                id: id,
                content: lastText // 简单返回捕获到的文本
            });
        }
    }, checkInterval);
    
    // 120秒硬超时
    setTimeout(() => {
        clearInterval(checkLoop);
        if (stableCount < maxStable) {
             chrome.runtime.sendMessage({ type: 'GEMINI_RESPONSE', id: id, content: "Error: Timeout waiting for DOM stability." });
        }
    }, 120000);
}
