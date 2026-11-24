/**
 * "Ask AI" chat for chemistry questions, with a tool that draws molecules in the editor.
 * Three providers can be switched at any time: Claude (Anthropic), ChatGPT (OpenAI) and Grok (xAI).
 *
 * Requests go to /api/anthropic, /api/openai or /api/xai: the dev/preview server forwards them to the
 * provider and adds the API key (see vite.app.config.ts): the key from .env.local, or one the user entered
 * in Settings › AI (stored in this browser and sent to the local dev server in the x-tsdraw-api-key header).
 * When the model wants to show a structure it calls `draw_molecule` with a SMILES; the app draws it
 * and reports back (or reports the parse error so the model can correct the SMILES).
 *
 * The conversation is kept in a provider-neutral form, so switching provider keeps the conversation:
 * the next question is sent to the new provider with the whole history translated to its format.
 */

import { aiRequest, API_KEY_HEADER, STANDALONE } from './runtime';
import type { AssistantTool } from './databases';

export type ProviderId = 'claude' | 'openai' | 'grok';

export interface ModelOption {
  id: string;
  label: string;
}

export interface Provider {
  id: ProviderId;
  /** Shown in the panel title, e.g. "Ask ChatGPT". */
  name: string;
  /** Environment variable the dev server reads the key from (for error messages). */
  keyVar: string;
  models: ModelOption[];
}

export const PROVIDERS: Provider[] = [
  {
    id: 'claude',
    name: 'Claude',
    keyVar: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (fast)' },
      { id: 'claude-opus-5-5', label: 'Opus 5.5 (best)' },
      { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (fastest)' },
    ],
  },
  {
    id: 'openai',
    name: 'ChatGPT',
    keyVar: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { id: 'gpt-6-astra', label: 'GPT-6 Astra (best)' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    ],
  },
  {
    id: 'grok',
    name: 'Grok',
    keyVar: 'XAI_API_KEY',
    models: [
      { id: 'grok-4.7', label: 'Grok 4.7' },
      { id: 'grok-4.6', label: 'Grok 4.6' },
    ],
  },
];

/** Kept for code written before the other providers were added. */
export const CLAUDE_MODELS = PROVIDERS[0].models;

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

const ENDPOINTS: Record<ProviderId, string> = {
  claude: '/v1/messages',
  openai: '/v1/responses',
  grok: '/v1/chat/completions',
};
const MAX_TOOL_ROUNDS = 8;
const MAX_TOKENS = 2048;

const SYSTEM = `You are a chemistry assistant built into tsdraw, a chemical structure drawing app used by medicinal and computational chemists.
- When the user asks for a structure (a drug, reagent, functional group, reaction product...), call draw_molecule with a correct isomeric SMILES (include stereochemistry and E/Z when the compound has them), once per distinct molecule. The app draws it on the canvas.
- Each message may include the structure currently drawn, as SMILES. Use it when the user refers to "this", "my molecule" or the drawing.
- Answer briefly and precisely. Use plain text; short lists are fine. Give formulas and key properties when useful.
- If you are not sure of a structure, say so rather than guessing.
- You can query public databases: search_compound and identify_structure (PubChem, with the ChEMBL id), find_similar (PubChem/ChEMBL similarity, PubChem substructure), search_pubmed (literature) and get_bioactivity (ChEMBL targets, potencies, mechanism, phase). Use them for facts that should be looked up rather than remembered, and say where numbers came from (CID, ChEMBL id, PMID). Never invent PMIDs or measured values.
- To draw a named compound you are unsure of, take its SMILES from search_compound first.`;

const DRAW_TOOL = {
  name: 'draw_molecule',
  description:
    "Draw a molecule on the user's canvas (added next to whatever is already drawn). Use an isomeric SMILES with stereochemistry where it applies.",
  parameters: {
    type: 'object',
    properties: {
      smiles: { type: 'string', description: 'Isomeric SMILES of the molecule' },
      name: { type: 'string', description: 'Common name, for the user' },
    },
    required: ['smiles'],
  },
};

/** A tool as the providers see it (name, description, JSON schema). */
interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ---------- Provider-neutral conversation ----------

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface ToolResult {
  id: string;
  content: string;
  isError: boolean;
}
type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; calls: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };

/** One model reply, already translated from the provider's format. */
interface Reply {
  text: string[];
  calls: ToolCall[];
}

/** What the panel shows as the conversation goes on. */
export type ChatEvent =
  | { kind: 'text'; text: string }
  | { kind: 'drawn'; name?: string; smiles: string; atoms: number }
  | { kind: 'draw-failed'; smiles: string; error: string }
  /** A database lookup by the assistant (`error` set when it failed). */
  | { kind: 'lookup'; text: string; error?: string };

/** Draws a SMILES in the editor; returns the number of atoms drawn, or throws with a reason. */
export type DrawMolecule = (smiles: string) => number;

/** Tool call ids must match ^[a-zA-Z0-9_-]+$ for Anthropic; ids from other providers may not. */
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_') || 'call';

function parseArgs(json: unknown): Record<string, unknown> {
  if (json && typeof json === 'object') return json as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(json ?? '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ---------- Request / response translation, one per provider ----------

function claudeRequest(model: string, turns: Turn[], tools: ToolSpec[]): unknown {
  const messages = turns.map((t) => {
    if (t.role === 'user') return { role: 'user', content: t.text };
    if (t.role === 'tool')
      return {
        role: 'user',
        content: t.results.map((r) => ({
          type: 'tool_result',
          tool_use_id: safeId(r.id),
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      };
    const content: unknown[] = [];
    if (t.text) content.push({ type: 'text', text: t.text });
    for (const c of t.calls) content.push({ type: 'tool_use', id: safeId(c.id), name: c.name, input: c.input });
    return { role: 'assistant', content: content.length ? content : [{ type: 'text', text: '(no reply)' }] };
  });
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: tools.map(({ parameters, ...tool }) => ({ ...tool, input_schema: parameters })),
    messages,
  };
}

function claudeReply(body: any): Reply {
  const blocks: any[] = Array.isArray(body?.content) ? body.content : [];
  return {
    text: blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text),
    calls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: parseArgs(b.input) })),
  };
}

/** OpenAI Responses API (tools on the newest GPT models are only on this API). Stateless: store=false. */
function openaiRequest(model: string, turns: Turn[], tools: ToolSpec[]): unknown {
  const input: unknown[] = [];
  for (const t of turns) {
    if (t.role === 'user') input.push({ role: 'user', content: t.text });
    else if (t.role === 'tool')
      for (const r of t.results)
        input.push({ type: 'function_call_output', call_id: r.id, output: r.isError ? `Error: ${r.content}` : r.content });
    else {
      if (t.text) input.push({ role: 'assistant', content: t.text });
      for (const c of t.calls)
        input.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.input) });
    }
  }
  return {
    model,
    instructions: SYSTEM,
    input,
    tools: tools.map((t) => ({ type: 'function', ...t })),
    max_output_tokens: MAX_TOKENS * 4, // reasoning tokens count against this limit
    store: false,
  };
}

function openaiReply(body: any): Reply {
  const items: any[] = Array.isArray(body?.output) ? body.output : [];
  const text: string[] = [];
  const calls: ToolCall[] = [];
  for (const item of items) {
    if (item.type === 'message' && Array.isArray(item.content))
      for (const part of item.content) if (part.type === 'output_text' && part.text) text.push(part.text);
    if (item.type === 'function_call') calls.push({ id: item.call_id ?? item.id, name: item.name, input: parseArgs(item.arguments) });
  }
  return { text, calls };
}

/** xAI Chat Completions (OpenAI-compatible). */
function grokRequest(model: string, turns: Turn[], tools: ToolSpec[]): unknown {
  const messages: unknown[] = [{ role: 'system', content: SYSTEM }];
  for (const t of turns) {
    if (t.role === 'user') messages.push({ role: 'user', content: t.text });
    else if (t.role === 'tool')
      for (const r of t.results)
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.isError ? `Error: ${r.content}` : r.content });
    else
      messages.push({
        role: 'assistant',
        content: t.text || null,
        ...(t.calls.length
          ? {
              tool_calls: t.calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      });
  }
  return { model, max_tokens: MAX_TOKENS * 4, messages, tools: tools.map((t) => ({ type: 'function', function: t })) };
}

function grokReply(body: any): Reply {
  const message = body?.choices?.[0]?.message ?? {};
  const calls: ToolCall[] = (message.tool_calls ?? []).map((c: any) => ({
    id: c.id,
    name: c.function?.name,
    input: parseArgs(c.function?.arguments),
  }));
  return { text: typeof message.content === 'string' && message.content ? [message.content] : [], calls };
}

const ADAPTERS: Record<
  ProviderId,
  { request: (model: string, turns: Turn[], tools: ToolSpec[]) => unknown; reply: (body: any) => Reply }
> = {
  claude: { request: claudeRequest, reply: claudeReply },
  openai: { request: openaiRequest, reply: openaiReply },
  grok: { request: grokRequest, reply: grokReply },
};

/** The error message from any of the three APIs ({error:{message}}, {error:"..."}, {message}). */
function errorDetail(body: any, fallback: string): string {
  if (typeof body?.error === 'string') return body.error;
  return body?.error?.message ?? body?.message ?? fallback;
}

// ---------- The chat ----------

/**
 * Header that carries an API key entered in Settings › AI. The dev server uses it instead of the
 * key in .env.local, and strips it before forwarding the request to the provider.
 */
export { API_KEY_HEADER };

const MODELS_ENDPOINT = '/v1/models';

/**
 * Check an API key by listing the provider's models (costs nothing). An empty key tests the
 * dev server's key from .env.local. Resolves to an error message, or null when the key works.
 */
export async function testApiKey(
  id: ProviderId,
  key: string,
  fetchFn: typeof fetch = (...args) => fetch(...args)
): Promise<string | null> {
  const provider = getProvider(id);
  let response: Response;
  try {
    if (STANDALONE && !key.trim()) return 'Enter a key first (this copy has no server with a .env.local key).';
    const req = aiRequest(id, MODELS_ENDPOINT, key);
    response = await fetchFn(req.url, { headers: req.headers });
  } catch {
    return STANDALONE
      ? `Cannot reach the ${provider.name} API (check the internet connection; some providers do not allow calls from a web page).`
      : 'Cannot reach the dev server. Start the app with "npm run dev".';
  }
  if (response.ok) return null;
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) return `${provider.name} rejected the key.`;
  if (response.status === 404 && !body?.error) return 'The API is only reachable through the dev server: run "npm run dev".';
  return `${provider.name} API error ${response.status}: ${errorDetail(body, response.statusText)}`;
}

export class ChemistryChat {
  private history: Turn[] = [];
  private _provider: ProviderId = 'claude';
  model = PROVIDERS[0].models[0].id;
  /** Keys entered in Settings › AI; a provider without one uses the dev server's key from .env.local. */
  apiKeys: Partial<Record<ProviderId, string>> = {};
  /** Tools offered besides draw_molecule (the database lookups). */
  tools: AssistantTool[] = [];

  constructor(
    private readonly draw: DrawMolecule,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args)
  ) {}

  get provider(): ProviderId {
    return this._provider;
  }

  /** Switch provider (the conversation is kept). Uses `model`, or the provider's first model. */
  setProvider(id: ProviderId, model?: string): void {
    this._provider = getProvider(id).id;
    this.model = model ?? getProvider(id).models[0].id;
  }

  clear(): void {
    this.history = [];
  }

  /**
   * Ask a question. `drawing` is the current structure as SMILES ('' if empty), sent as context.
   * `onEvent` receives the model's text and the molecules it drew, in order.
   */
  async ask(question: string, drawing: string, onEvent: (e: ChatEvent) => void): Promise<void> {
    const context = drawing ? `\n\n[Structure currently on the canvas, as SMILES: ${drawing}]` : '';
    const start = this.history.length;
    this.history.push({ role: 'user', text: question + context });
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await this.call();
        this.history.push({ role: 'assistant', text: reply.text.join('\n\n'), calls: reply.calls });
        for (const text of reply.text) if (text.trim()) onEvent({ kind: 'text', text });
        if (reply.calls.length === 0) return;
        const results: ToolResult[] = [];
        for (const c of reply.calls) results.push(await this.runTool(c, onEvent));
        this.history.push({ role: 'tool', results });
      }
    } catch (err) {
      // Drop this unfinished exchange so the next question starts from a consistent history.
      this.history.length = start;
      throw err;
    }
  }

  private async runTool(call: ToolCall, onEvent: (e: ChatEvent) => void): Promise<ToolResult> {
    if (call.name !== 'draw_molecule') {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool) return { id: call.id, content: `Unknown tool ${call.name}`, isError: true };
      const line = tool.describe(call.input);
      try {
        const content = await tool.run(call.input);
        onEvent({ kind: 'lookup', text: line });
        return { id: call.id, content, isError: false };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        onEvent({ kind: 'lookup', text: line, error });
        return { id: call.id, content: error, isError: true };
      }
    }
    const smiles = String(call.input.smiles ?? '');
    const name = typeof call.input.name === 'string' ? call.input.name : undefined;
    try {
      const atoms = this.draw(smiles);
      onEvent({ kind: 'drawn', name, smiles, atoms });
      return { id: call.id, content: `Drawn (${atoms} heavy atoms).`, isError: false };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      onEvent({ kind: 'draw-failed', smiles, error });
      return { id: call.id, content: `Could not draw that SMILES: ${error}`, isError: true };
    }
  }

  private async call(): Promise<Reply> {
    const provider = getProvider(this._provider);
    const adapter = ADAPTERS[provider.id];
    let response: Response;
    try {
      const req = aiRequest(provider.id, ENDPOINTS[provider.id], this.apiKeys[provider.id]);
      if (STANDALONE && !this.apiKeys[provider.id]?.trim())
        throw new Error(`No ${provider.name} API key: add one in File › Settings › AI.`);
      response = await this.fetchFn(req.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...req.headers },
        body: JSON.stringify(adapter.request(this.model, this.history, [DRAW_TOOL, ...this.tools])),
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('No ')) throw err;
      throw new Error(
        STANDALONE
          ? `Cannot reach the ${provider.name} API (check the internet connection; some providers do not allow calls from a web page).`
          : `Cannot reach the ${provider.name} API. Start the app with "npm run dev" (the dev server forwards the requests).`
      );
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 || (response.status === 403 && /key/i.test(errorDetail(body, '')))) {
        throw new Error(
          `No valid ${provider.name} API key: add one in File › Settings › AI (or put ${provider.keyVar}=... in tsdraw/.env.local and restart "npm run dev").`
        );
      }
      if (response.status === 404 && !body?.error) {
        throw new Error(`The ${provider.name} API is only reachable through the dev server: run "npm run dev".`);
      }
      throw new Error(`${provider.name} API error ${response.status}: ${errorDetail(body, response.statusText)}`);
    }
    return adapter.reply(body);
  }

}

/** Kept for code written before the other providers were added. */
export { ChemistryChat as ClaudeChat };
