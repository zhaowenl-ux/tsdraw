#!/usr/bin/env node
/**
 * tsdraw MCP server: lets the Claude desktop app draw molecules in tsdraw and read what is drawn.
 *
 * Claude Desktop starts this script (see mcp/README.md) and talks to it over stdio (MCP, JSON-RPC 2.0).
 * The tsdraw page open in your browser connects to it at http://127.0.0.1:7865 and receives the
 * commands; the page does the chemistry (SMILES/MOL parsing, layout) and sends back the result.
 *
 * Plain Node.js, no dependencies. Port: TSDRAW_BRIDGE_PORT (default 7865).
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.TSDRAW_BRIDGE_PORT || 7865);
const COMMAND_TIMEOUT_MS = 20000;
const log = (...args) => console.error('[tsdraw-mcp]', ...args); // stdout is reserved for MCP

// ---------------------------------------------------------------------------------------------
// Bridge to the tsdraw page: Server-Sent Events for commands, POST for replies.
// ---------------------------------------------------------------------------------------------

/** Open pages (SSE responses); commands go to the most recently connected one. */
const pages = [];
/** Commands waiting for the page's reply: id -> { resolve, reject, timer }. */
const waiting = new Map();

/** Only pages served from this computer may connect (any website could otherwise talk to the bridge). */
function localOrigin(origin) {
  if (!origin) return true; // same-origin or non-browser client
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (!localOrigin(origin)) {
    res.writeHead(403).end();
    return;
  }
  const cors = { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Headers': 'content-type' };
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST' }).end();
  } else if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    pages.push(res);
    log(`tsdraw page connected (${pages.length} open)`);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(keepAlive);
      pages.splice(pages.indexOf(res), 1);
      log(`tsdraw page disconnected (${pages.length} open)`);
    });
  } else if (req.method === 'POST' && url.pathname === '/reply') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const reply = JSON.parse(body);
        const pending = waiting.get(reply.id);
        if (pending) {
          clearTimeout(pending.timer);
          waiting.delete(reply.id);
          reply.ok ? pending.resolve(reply.result) : pending.reject(new Error(reply.error || 'failed'));
        }
        res.writeHead(204, cors).end();
      } catch {
        res.writeHead(400, cors).end();
      }
    });
  } else if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ pages: pages.length }));
  } else {
    res.writeHead(404, cors).end();
  }
});
server.on('error', (err) => log(`bridge could not listen on port ${PORT}: ${err.message}`));
server.listen(PORT, '127.0.0.1', () => log(`bridge listening on http://127.0.0.1:${PORT}`));

/** Send a command to the open tsdraw page and wait for its result. */
function command(tool, args) {
  const page = pages[pages.length - 1];
  if (!page) {
    return Promise.reject(
      new Error('tsdraw is not open. Start it with "npm run dev" in the tsdraw folder and keep the page open in the browser.')
    );
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('tsdraw did not answer in time (is the page still open?)'));
    }, COMMAND_TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    page.write(`data: ${JSON.stringify({ id, tool, args })}\n\n`);
  });
}

// ---------------------------------------------------------------------------------------------
// MCP (stdio, newline-delimited JSON-RPC)
// ---------------------------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'draw_molecule',
    description:
      'Draw a molecule in the tsdraw editor open in the user\'s browser. Give an isomeric SMILES (with stereochemistry and E/Z where they apply) or a MOL file. It is added next to what is already drawn unless replace is true.',
    inputSchema: {
      type: 'object',
      properties: {
        smiles: { type: 'string', description: 'Isomeric SMILES' },
        molfile: { type: 'string', description: 'MDL MOL file (V2000 or V3000), instead of SMILES' },
        name: { type: 'string', description: 'Name of the compound, shown to the user' },
        replace: { type: 'boolean', description: 'Clear the drawing first (default false)' },
      },
    },
  },
  {
    name: 'get_drawing',
    description:
      'Read the structure currently drawn in tsdraw (or only the selected atoms), as SMILES and/or MOL file, with its formula. Text labels such as NO2 are expanded.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['smiles', 'molfile', 'both'], description: 'Default: smiles' },
        selection_only: { type: 'boolean', description: 'Only the selected atoms (default false)' },
      },
    },
  },
  {
    name: 'get_drawing_image',
    description: 'A PNG picture of what is drawn in tsdraw, to look at the layout the user sees.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_drawing',
    description: 'Clear the tsdraw canvas (the user can undo it).',
    inputSchema: { type: 'object', properties: {} },
  },
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined) return; // notifications (initialized, cancelled...) need no answer
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'tsdraw', version: '0.1.0' },
          instructions:
            'Tools for tsdraw, a chemical structure editor open in the user\'s browser: draw molecules there and read what the user has drawn.',
        },
      });
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const name = params?.name;
      if (!TOOLS.some((t) => t.name === name)) throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
      try {
        const result = await command(name, params?.arguments || {});
        const content =
          name === 'get_drawing_image' && result?.png
            ? [{ type: 'image', data: result.png, mimeType: 'image/png' }]
            : [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }];
        send({ jsonrpc: '2.0', id, result: { content } });
      } catch (err) {
        // Tool failures go back to Claude as results it can read and act on.
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: err.message }], isError: true } });
      }
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    send({ jsonrpc: '2.0', id, error: { code: err.code || -32603, message: err.message } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    void handle(message);
  }
});
process.stdin.on('end', () => process.exit(0));
