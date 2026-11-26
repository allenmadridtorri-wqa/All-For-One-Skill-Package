#!/usr/bin/env npx tsx
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { executeMcpTool, executeMcpToolAsync, MCP_BRIDGE_TOOLS } from '../core/mcp-bridge.ts';

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export function handleMcpJsonRpcMessage(
  req: JsonRpcRequest,
  workspaceDir: string = process.cwd(),
): JsonRpcResponse {
  const id = req.id ?? null;
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'all-for-one-antigravity-bridge',
          version: '3.2.0',
        },
      },
    };
  }

  if (req.method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_BRIDGE_TOOLS },
    };
  }

  if (req.method === 'tools/call') {
    const params = req.params ?? {};
    const name = String(params.name ?? '');
    const args =
      params.arguments && typeof params.arguments === 'object'
        ? (params.arguments as Record<string, unknown>)
        : {};
    const res = executeMcpTool(name, args, workspaceDir);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        isError: !res.ok,
        content: [
          {
            type: 'text',
            text: JSON.stringify(res.ok ? res.data : { error: res.error, data: res.data }, null, 2),
          },
        ],
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unsupported MCP method "${req.method}"` },
  };
}

export async function handleMcpJsonRpcMessageAsync(
  req: JsonRpcRequest,
  workspaceDir: string = process.cwd(),
): Promise<JsonRpcResponse> {
  if (req.method === 'tools/call') {
    const id = req.id ?? null;
    const params = req.params ?? {};
    const name = String(params.name ?? '');
    const args =
      params.arguments && typeof params.arguments === 'object'
        ? (params.arguments as Record<string, unknown>)
        : {};
    const res = await executeMcpToolAsync(name, args, workspaceDir);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        isError: !res.ok,
        content: [
          {
            type: 'text',
            text: JSON.stringify(res.ok ? res.data : { error: res.error, data: res.data }, null, 2),
          },
        ],
      },
    };
  }
  return handleMcpJsonRpcMessage(req, workspaceDir);
}

function startStdioMcpServer(): void {
  const workspaceDir = process.cwd();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed) as JsonRpcRequest;
      if (req.method === 'notifications/initialized') return;
      const resp = await handleMcpJsonRpcMessageAsync(req, workspaceDir);
      process.stdout.write(JSON.stringify(resp) + '\n');
    } catch (err) {
      const errResp: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: err instanceof Error ? err.message : 'Invalid JSON-RPC payload',
        },
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--list-tools')) {
    console.log(JSON.stringify(MCP_BRIDGE_TOOLS, null, 2));
  } else {
    startStdioMcpServer();
  }
}
