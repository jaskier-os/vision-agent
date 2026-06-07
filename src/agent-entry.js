/**
 * Agent entry point for vision.
 * Creates and starts the VisionAgent (connects to orchestrator).
 */

import 'dotenv/config';
import { VisionAgent } from './agent.js';

const config = {
  orchestratorUrl: process.env.ORCHESTRATOR_URL || 'ws://localhost:10001',
  communicatorUrl: process.env.COMMUNICATOR_URL || 'http://localhost:10000',
  apiKey: process.env.API_KEY || '',
  mcpUrl: process.env.MCP_URL || `http://localhost:${process.env.MCP_HTTP_PORT || '10002'}`,
  ocrUrl: process.env.OCR_URL || 'http://localhost:10006',
  model: process.env.MODEL || 'sonnet',
  healthPort: parseInt(process.env.HEALTH_PORT || '0', 10)
};

console.log('[vision] Starting agent mode');
console.log(`[vision] Orchestrator: ${config.orchestratorUrl}`);
console.log(`[vision] Communicator: ${config.communicatorUrl}`);
console.log(`[vision] MCP server:   ${config.mcpUrl}`);
console.log(`[vision] OCR service:  ${config.ocrUrl}`);

const agent = new VisionAgent(config);
await agent.start();

console.log('[vision] Agent started and connected to orchestrator');
