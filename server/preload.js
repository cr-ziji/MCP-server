const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectToMCPServer: (type, address) => ipcRenderer.invoke('connect-mcp-server', { type, address }),
  sendMCPMessage: (message) => ipcRenderer.invoke('send-mcp-message', message),
  callDeepSeekAPI: (message, apiKey) => ipcRenderer.invoke('call-deepseek-api', { message, apiKey }),

  onMCPMessage: (callback) => ipcRenderer.on('mcp-message', (event, data) => callback(data)),
  onMCPConnectionStatus: (callback) => ipcRenderer.on('mcp-connection-status', (event, status) => callback(status)),
  onMCPError: (callback) => ipcRenderer.on('mcp-error', (event, error) => callback(error)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});