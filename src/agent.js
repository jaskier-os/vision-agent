/**
 * Vision Agent - analyzes images via LLM vision and reverse image search.
 * Uses ToolCallingClient for the agentic loop.
 *
 * Supports delegation to web-search agent for deeper research via DelegationError.
 */

import { BaseAgent, ToolCallingClient, DelegationError, DeviceInputError, isDeviceTool, buildDeviceCommand } from '@orchestrator/sdk';

const SYSTEM_PROMPT = `You are a vision agent. The user has sent a request and an image is attached.
When you need to identify or research something from the image, use tools in combination:
1. analyze_image to understand the image content
2. reverse_image_search to find matching images on the web
3. delegate_to_agent if the task requires capabilities outside your own (e.g. web research, security scanning)

Be concise. Focus on the user's actual question.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Use LLM vision to describe, analyze, or answer questions about the attached image. The image is already attached -- just provide a prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'What to analyze or describe about the image' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reverse_image_search',
      description: 'Reverse image search via Yandex. Finds matching/similar images across the web. No arguments needed -- uses the attached image automatically.',
      parameters: { type: 'object', properties: {} }
    }
  },
  // {
  //   type: 'function',
  //   function: {
  //     name: 'extract_text',
  //     description: 'Extract text from the image using OCR. Returns markdown-formatted text. Best for documents, screenshots, receipts, signs, handwritten text. No arguments needed.',
  //     parameters: { type: 'object', properties: {} }
  //   }
  // },
];

export class VisionAgent extends BaseAgent {
  /**
   * @param {Object} options
   * @param {string} options.orchestratorUrl
   * @param {string} options.communicatorUrl
   * @param {string} options.apiKey
   * @param {string} options.mcpUrl - URL of the MCP web-search server
   * @param {string} options.model
   * @param {string} [options.ocrUrl] - URL of the OCR microservice
   * @param {number} [options.healthPort]
   */
  constructor(options) {
    super(
      {
        id: 'vision',
        name: 'Vision Agent',
        capabilities: [
          'analyze image',
          'identify object',
          'describe image',
          'google lens',
          'reverse image search',
          'read text in image',
          'OCR',
          'what is this'
        ],
        inputTypes: ['text', 'image'],
        healthEndpoint: '/health'
      },
      {
        orchestratorUrl: options.orchestratorUrl,
        healthPort: options.healthPort || 0
      }
    );

    this.communicatorUrl = options.communicatorUrl;
    this.apiKey = options.apiKey;
    this.mcpUrl = options.mcpUrl;
    this.ocrUrl = options.ocrUrl;
    this.model = options.model;

    this.client = new ToolCallingClient({
      communicatorUrl: options.communicatorUrl,
      apiKey: options.apiKey,
      model: options.model
    });
  }

  /**
   * Handle an incoming request from the orchestrator.
   * @param {import('@orchestrator/sdk/types').AgentRequest} request
   * @returns {Promise<import('@orchestrator/sdk/types').AgentResponse>}
   */
  async handle(request) {
    const { requestId, text, imageBase64, context } = request;
    console.log(`[vision] Handling request ${requestId}: ${text}`);

    if (!imageBase64) {
      return {
        requestId,
        status: 'needs_input',
        deviceCommand: {
          type: 'take_photo',
          originalText: text
        }
      };
    }

    // Follow-up after device tool result
    if (context?.deviceToolResult && context.originalText) {
      const deviceInfo = `[Device tool "${context.commandType}" result: ${JSON.stringify(context.deviceResultData || {})}]`;
      const userContent = imageBase64
        ? [
            { type: 'image_url', image_url: { url: `data:${imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${imageBase64}` } },
            { type: 'text', text: `${context.originalText}\n\n${deviceInfo}` }
          ]
        : `${context.originalText}\n\n${deviceInfo}`;
      const allTools = [...TOOLS, ...(context.deviceTools || [])];
      const delegationTool = this.buildDelegationTool(context?.availableAgents);
      if (delegationTool) allTools.push(delegationTool);
      const messages = this.buildMessagesWithHistory(SYSTEM_PROMPT, userContent, context?.sessionHistory, context?.globalInstructions, context?.autonomousInstructions);
      const result = await this.client.execute({
        messages,
        tools: allTools,
        toolExecutor: (name, input) => this.executeToolOrDevice(name, input, imageBase64),
        onToolCall: (name, input) => this.sendToolStatus(requestId, name, input)
      });
      return { requestId, status: 'success', text: result.text };
    }

    // Merge device tools + dynamic delegation into the tool set
    const allTools = [...TOOLS, ...(context?.deviceTools || [])];
    const delegationTool = this.buildDelegationTool(context?.availableAgents);
    if (delegationTool) allTools.push(delegationTool);

    try {
      const userContent = [
        { type: 'image_url', image_url: { url: `data:${imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${imageBase64}` } },
        { type: 'text', text: text || 'Describe what you see in this image.' }
      ];
      const messages = this.buildMessagesWithHistory(SYSTEM_PROMPT, userContent, context?.sessionHistory, context?.globalInstructions, context?.autonomousInstructions);
      const result = await this.client.execute({
        messages,
        tools: allTools,
        toolExecutor: (name, input) => this.executeToolOrDevice(name, input, imageBase64),
        onToolCall: (name, input) => this.sendToolStatus(requestId, name, input)
      });

      return {
        requestId,
        status: 'success',
        text: result.text
      };
    } catch (err) {
      if (err instanceof DeviceInputError) {
        err.deviceCommand.originalText = text;
        return { requestId, status: 'needs_input', deviceCommand: err.deviceCommand };
      }
      if (err instanceof DelegationError) {
        console.log(`[vision] Delegating to ${err.agentId}: ${err.query}`);
        return {
          requestId,
          status: 'needs_agent',
          agentRequest: {
            targetAgentId: err.agentId,
            text: err.query
          }
        };
      }
      throw err;
    }
  }

  /**
   * Execute a tool -- routes device tools via DeviceInputError, vision tools locally.
   * @param {string} name
   * @param {Object} input
   * @param {string} imageBase64
   * @returns {Promise<string>}
   */
  executeToolOrDevice(name, input, imageBase64) {
    if (isDeviceTool(name)) {
      throw new DeviceInputError(buildDeviceCommand(name, input));
    }
    return this.executeTool(name, input, imageBase64);
  }

  /**
   * Execute a vision tool.
   * @param {string} name
   * @param {Object} args
   * @param {string} imageBase64 - Captured image data from the request
   * @returns {Promise<string>}
   */
  async executeTool(name, args, imageBase64) {
    switch (name) {
      case 'analyze_image':
        return await this.analyzeImage(imageBase64, args.prompt || 'Describe what you see.');
      case 'reverse_image_search':
        return await this.reverseImageSearch(imageBase64);
      // case 'extract_text':
      //   return await this.extractText(imageBase64);
      case 'delegate_to_agent':
        this.handleDelegation(args);
        return; // unreachable -- handleDelegation always throws
      default:
        return `Unknown tool: ${name}`;
    }
  }

  /**
   * Call the MCP web-search server's reverse_image_search tool (Yandex).
   * @param {string} imageBase64
   * @returns {Promise<string>}
   */
  async reverseImageSearch(imageBase64) {
    const response = await fetch(`${this.mcpUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/call',
        params: {
          name: 'reverse_image_search',
          arguments: { image_base64: imageBase64 }
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      return `Error calling reverse_image_search: HTTP ${response.status} - ${body}`;
    }

    const data = await response.json();

    if (data.result?.isError) {
      return `Tool error: ${data.result.content?.[0]?.text || 'Unknown error'}`;
    }

    const content = data.result?.content;
    if (Array.isArray(content)) {
      return content.map(c => c.text || '').join('\n');
    }

    return JSON.stringify(data.result);
  }

  /**
   * Extract text from the image using the OCR microservice.
   * @param {string} imageBase64
   * @returns {Promise<string>}
   */
  async extractText(imageBase64) {
    if (!this.ocrUrl) {
      return 'OCR service not configured (ocrUrl missing). Cannot extract text.';
    }

    const response = await fetch(`${this.ocrUrl}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ image_base64: imageBase64 })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OCR service error ${response.status}: ${body}`);
    }

    const data = await response.json();
    return data.text || '';
  }

  /**
   * Use LLM vision to analyze the image with a custom prompt.
   * @param {string} imageBase64
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async analyzeImage(imageBase64, prompt) {
    const response = await fetch(`${this.communicatorUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${imageBase64}` } },
              { type: 'text', text: prompt }
            ]
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Communicator API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
