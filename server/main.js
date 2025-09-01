const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const fetch = require('node-fetch');

let mainWindow;
let mcpConnection = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// 连接到 MCP 服务器
async function connectToMCPServer(connectionType, address) {
  try {
    if (mcpConnection) {
      try {
        mcpConnection.close();
      } catch (e) {}
      mcpConnection = null;
    }

    if (connectionType === 'websocket') {
      mcpConnection = new WebSocket(address || 'ws://localhost:3001');

      mcpConnection.on('open', () => {
        mainWindow.webContents.send('mcp-connection-status', 'connected');
      });

      mcpConnection.on('message', (data) => {
        mainWindow.webContents.send('mcp-message', data.toString());
      });

      mcpConnection.on('close', () => {
        mainWindow.webContents.send('mcp-connection-status', 'disconnected');
      });

      mcpConnection.on('error', (error) => {
        mainWindow.webContents.send('mcp-error', error.message);
      });

    } else if (connectionType === 'http') {
      // HTTP 连接处理
      mcpConnection = {
        baseUrl: address || 'http://localhost:3000',
        send: async (message) => {
          try {
            const response = await fetch(`${mcpConnection.baseUrl}/api/mcp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(message)
            });

            const data = await response.json();
            mainWindow.webContents.send('mcp-message', JSON.stringify(data));
          } catch (error) {
            mainWindow.webContents.send('mcp-error', error.message);
          }
        }
      };

      mainWindow.webContents.send('mcp-connection-status', 'connected');
    }

    return true;
  } catch (error) {
    mainWindow.webContents.send('mcp-error', error.message);
    return false;
  }
}

// IPC 处理
ipcMain.handle('connect-mcp-server', async (event, { type, address }) => {
  return await connectToMCPServer(type, address);
});

ipcMain.handle('send-mcp-message', async (event, message) => {
  if (!mcpConnection) {
    throw new Error('Not connected to MCP server');
  }

  if (mcpConnection.send) {
    // HTTP 连接
    await mcpConnection.send(message);
  } else if (mcpConnection.readyState === WebSocket.OPEN) {
    // WebSocket 连接
    mcpConnection.send(JSON.stringify(message));
  }
});

ipcMain.handle('call-deepseek-api', async (event, { message, apiKey }) => {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: message }],
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    throw new Error(`DeepSeek API call failed: ${error.message}`);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});