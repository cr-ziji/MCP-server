let isConnected = false;
let messageId = 1;

document.getElementById('connect-btn').addEventListener('click', toggleConnection);
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 设置事件监听器
window.electronAPI.onMCPMessage(handleMCPMessage);
window.electronAPI.onMCPConnectionStatus(handleConnectionStatus);
window.electronAPI.onMCPError(handleError);

function toggleConnection() {
    if (isConnected) {
        disconnect();
    } else {
        connect();
    }
}

async function connect() {
    const connectionType = document.getElementById('connection-type').value;
    const serverAddress = document.getElementById('server-address').value;

    try {
        const success = await window.electronAPI.connectToMCPServer(connectionType, serverAddress);
        if (success) {
            isConnected = true;
            updateUI();
            addMessage('system', '已连接到 MCP 服务器');
        }
    } catch (error) {
        addMessage('system', `连接失败: ${error.message}`, true);
    }
}

function disconnect() {
    // 在实际应用中，这里应该关闭连接
    isConnected = false;
    updateUI();
    addMessage('system', '已断开与 MCP 服务器的连接');
}

function updateUI() {
    const connectBtn = document.getElementById('connect-btn');
    const status = document.getElementById('connection-status');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (isConnected) {
        connectBtn.textContent = '断开连接';
        status.textContent = '已连接';
        status.className = 'status connected';
        messageInput.disabled = false;
        sendBtn.disabled = false;
    } else {
        connectBtn.textContent = '连接';
        status.textContent = '未连接';
        status.className = 'status disconnected';
        messageInput.disabled = true;
        sendBtn.disabled = true;
    }
}

async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    const apiKey = document.getElementById('api-key').value;

    if (!message) return;

    addMessage('user', message);
    messageInput.value = '';

    try {
        // 首先尝试通过 MCP 处理消息
        const mcpResponse = await processWithMCP(message);

        if (mcpResponse.handled) {
            // MCP 工具处理了请求
            addMessage('assistant', mcpResponse.result);
        } else if (apiKey) {
            // 使用 DeepSeek API 处理
            const response = await window.electronAPI.callDeepSeekAPI(message, apiKey);
            addMessage('assistant', response);
        } else {
            addMessage('system', '需要 DeepSeek API 密钥来处理此消息', true);
        }
    } catch (error) {
        addMessage('system', `处理消息时出错: ${error.message}`, true);
    }
}

async function processWithMCP(message) {
    try {
        // 检查是否是工具调用请求
        if (message.startsWith('/read ')) {
            const filePath = message.substring(6).trim();
            const request = {
                jsonrpc: "2.0",
                id: messageId++,
                method: "tools/call",
                params: {
                    name: "file_read",
                    arguments: {
                        path: filePath
                    }
                }
            };

            await window.electronAPI.sendMCPMessage(request);
            return { handled: true, result: "已请求读取文件" };
        }

        if (message.startsWith('/write ')) {
            const parts = message.substring(7).split(' ');
            const filePath = parts[0];
            const content = parts.slice(1).join(' ');

            const request = {
                jsonrpc: "2.0",
                id: messageId++,
                method: "tools/call",
                params: {
                    name: "file_write",
                    arguments: {
                        path: filePath,
                        content: content
                    }
                }
            };

            await window.electronAPI.sendMCPMessage(request);
            return { handled: true, result: "已请求写入文件" };
        }

        if (message.startsWith('/search ')) {
            const query = message.substring(8).trim();

            const request = {
                jsonrpc: "2.0",
                id: messageId++,
                method: "tools/call",
                params: {
                    name: "web_search",
                    arguments: {
                        query: query,
                        max_results: 5
                    }
                }
            };

            await window.electronAPI.sendMCPMessage(request);
            return { handled: true, result: "已请求搜索" };
        }

        return { handled: false };
    } catch (error) {
        throw new Error(`MCP 处理失败: ${error.message}`);
    }
}

function handleMCPMessage(data) {
    try {
        const message = JSON.parse(data);

        if (message.result && message.result.content) {
            const content = message.result.content[0];
            if (content.text) {
                addMessage('assistant', `MCP 工具结果:\n${content.text}`);
            }
        }

        if (message.error) {
            addMessage('system', `MCP 错误: ${message.error.message}`, true);
        }
    } catch (error) {
        console.error('处理 MCP 消息时出错:', error);
    }
}

function handleConnectionStatus(status) {
    isConnected = status === 'connected';
    updateUI();
    addMessage('system', `MCP 连接状态: ${status}`);
}

function handleError(error) {
    addMessage('system', `错误: ${error}`, true);
}

function addMessage(role, content, isError = false) {
    const messagesContainer = document.getElementById('messages');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${role}-message`;

    if (isError) {
        messageElement.style.color = '#d32f2f';
    }

    messageElement.textContent = content;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 初始化 UI
updateUI();