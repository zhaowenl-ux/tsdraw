/**
 * Connection to the Claude desktop app, through the tsdraw MCP server (mcp/tsdraw-mcp.mjs).
 *
 * Claude Desktop runs that server; this page connects to it on 127.0.0.1 and waits for commands
 * (draw a molecule, read the drawing, take a picture, clear). Each command is run here and the
 * result is posted back. When the server is not running the browser simply keeps retrying.
 */

export interface BridgeCommand {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

/** Runs a command from Claude; returns its result (sent back to Claude) or throws with a reason. */
export type BridgeHandler = (tool: string, args: Record<string, unknown>) => unknown | Promise<unknown>;

export const DEFAULT_BRIDGE_PORT = 7865;

export function connectDesktopBridge(
  handle: BridgeHandler,
  onStatus: (connected: boolean) => void,
  port = DEFAULT_BRIDGE_PORT
): () => void {
  const base = `http://127.0.0.1:${port}`;
  const events = new EventSource(`${base}/events`);
  events.onopen = () => onStatus(true);
  events.onerror = () => onStatus(false); // the browser reconnects by itself
  events.onmessage = async (e) => {
    let command: BridgeCommand;
    try {
      command = JSON.parse(e.data);
    } catch {
      return;
    }
    let reply: { id: string; ok: boolean; result?: unknown; error?: string };
    try {
      reply = { id: command.id, ok: true, result: await handle(command.tool, command.args ?? {}) };
    } catch (err) {
      reply = { id: command.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    // text/plain keeps this a simple request (no CORS preflight).
    await fetch(`${base}/reply`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(reply) }).catch(
      () => onStatus(false)
    );
  };
  return () => events.close();
}
