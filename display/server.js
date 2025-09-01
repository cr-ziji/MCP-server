const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport, WsServerTransport } = require('@modelcontextprotocol/sdk/server/transports');
const { ExpressApiServer } = require('@modelcontextprotocol/sdk/server/express');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptTemplatesRequestSchema,
  GetPromptTemplateRequestSchema,
  ListSamplesRequestSchema,
  GetSampleRequestSchema,
  SampleContent
} = require('@modelcontextprotocol/sdk/types');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

class DeepSeekMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'deepseek-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          sampling: {}
        }
      }
    );

    this.setupRequestHandlers();
    this.setupTools();
    this.setupResources();
    this.setupPromptTemplates();
    this.setupSamples();
  }

  setupRequestHandlers() {
    // 工具列表请求
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Object.values(this.tools).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // 工具调用请求
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools[request.params.name];
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`);
      }
      return await tool.handler(request.params.arguments || {});
    });

    // 资源列表请求
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Object.values(this.resources).map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }))
      };
    });

    // 读取资源请求
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = this.resources[request.params.uri];
      if (!resource) {
        throw new Error(`Resource not found: ${request.params.uri}`);
      }
      return await resource.handler();
    });

    // 提示模板列表请求
    this.server.setRequestHandler(ListPromptTemplatesRequestSchema, async () => {
      return {
        promptTemplates: Object.values(this.prompts).map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments
        }))
      };
    });

    // 获取提示模板请求
    this.server.setRequestHandler(GetPromptTemplateRequestSchema, async (request) => {
      const prompt = this.prompts[request.params.name];
      if (!prompt) {
        throw new Error(`Prompt template not found: ${request.params.name}`);
      }
      return await prompt.handler(request.params.arguments || {});
    });

    // 样本列表请求
    this.server.setRequestHandler(ListSamplesRequestSchema, async () => {
      return {
        samples: Object.values(this.samples).map(sample => ({
          uri: sample.uri,
          name: sample.name,
          description: sample.description
        }))
      };
    });

    // 获取样本请求
    this.server.setRequestHandler(GetSampleRequestSchema, async (request) => {
      const sample = this.samples[request.params.uri];
      if (!sample) {
        throw new Error(`Sample not found: ${request.params.uri}`);
      }
      return await sample.handler();
    });
  }

  setupTools() {
    this.tools = {
      'file_read': {
        name: 'file_read',
        description: '读取文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径'
            }
          },
          required: ['path']
        },
        handler: async (args) => {
          try {
            const content = await fs.readFile(args.path, 'utf-8');
            return {
              content: [{
                type: 'text',
                text: content
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `读取文件失败: ${error.message}`
              }],
              isError: true
            };
          }
        }
      },

      'file_write': {
        name: 'file_write',
        description: '写入文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径'
            },
            content: {
              type: 'string',
              description: '要写入的内容'
            }
          },
          required: ['path', 'content']
        },
        handler: async (args) => {
          try {
            await fs.ensureDir(path.dirname(args.path));
            await fs.writeFile(args.path, args.content);
            return {
              content: [{
                type: 'text',
                text: `文件已成功写入: ${args.path}`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `写入文件失败: ${error.message}`
              }],
              isError: true
            };
          }
        }
      },

      'web_search': {
        name: 'web_search',
        description: '执行网络搜索',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询'
            },
            max_results: {
              type: 'number',
              description: '最大结果数量',
              default: 5
            }
          },
          required: ['query']
        },
        handler: async (args) => {
          // 这里是模拟实现，实际应用中应该调用真实的搜索API
          const results = [
            `搜索结果 1: 关于 "${args.query}" 的信息`,
            `搜索结果 2: ${args.query} 的详细解释`,
            `搜索结果 3: ${args.query} 的相关资源`
          ].slice(0, args.max_results || 5);

          return {
            content: [{
              type: 'text',
              text: `搜索 "${args.query}" 的结果:\n${results.join('\n')}`
            }]
          };
        }
      }
    };
  }

  setupResources() {
    this.resources = {
      'resource://system/info': {
        uri: 'resource://system/info',
        name: 'system_info',
        description: '系统信息',
        mimeType: 'text/plain',
        handler: async () => {
          return {
            contents: [{
              uri: 'resource://system/info',
              mimeType: 'text/plain',
              text: `系统信息:\n- 平台: ${process.platform}\n- Node.js 版本: ${process.version}\n- 内存使用: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
            }]
          };
        }
      }
    };
  }

  setupPromptTemplates() {
    this.prompts = {
      'code_review': {
        name: 'code_review',
        description: '代码审查提示模板',
        arguments: {
          code: {
            type: 'string',
            description: '要审查的代码'
          },
          language: {
            type: 'string',
            description: '编程语言',
            default: 'javascript'
          }
        },
        handler: async (args) => {
          return {
            messages: [{
              role: 'user',
              content: {
                type: 'text',
                text: `请对以下${args.language}代码进行审查:\n\`\`\`${args.language}\n${args.code}\n\`\`\`\n请提供改进建议和潜在问题。`
              }
            }]
          };
        }
      }
    };
  }

  setupSamples() {
    this.samples = {
      'sample://python/hello-world': {
        uri: 'sample://python/hello-world',
        name: 'python_hello_world',
        description: 'Python Hello World 示例',
        handler: async () => {
          return {
            contents: [{
              uri: 'sample://python/hello-world',
              mimeType: 'text/plain',
              text: 'print("Hello, World!")'
            }]
          };
        }
      }
    };
  }

  async startStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('DeepSeek MCP Server running on STDIO');
  }

  async startWebSocket(port = 3001) {
    const wss = new WebSocket.Server({ port });
    console.error(`DeepSeek MCP Server running on WebSocket port ${port}`);

    wss.on('connection', (ws) => {
      const transport = new WsServerTransport(ws);
      this.server.connect(transport).catch(console.error);
    });
  }

  async startHttp(port = 3000) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    const apiServer = new ExpressApiServer(this.server);
    apiServer.registerRoutes(app);

    app.listen(port, () => {
      console.error(`DeepSeek MCP HTTP server running on port ${port}`);
    });
  }
}

// 启动服务器
const server = new DeepSeekMCPServer();

// 根据启动参数选择传输方式
const transportType = process.argv[2] || 'stdio';

if (transportType === 'stdio') {
  server.startStdio();
} else if (transportType === 'websocket') {
  server.startWebSocket(3001);
} else if (transportType === 'http') {
  server.startHttp(3000);
} else {
  console.error('Usage: node server.js [stdio|websocket|http]');
  process.exit(1);
}