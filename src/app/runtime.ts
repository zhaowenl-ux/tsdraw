/**
 * How this copy of TSDraw runs.
 *   Served (npm run dev / preview): AI requests go through the dev server, which adds the API key.
 *   Standalone (npm run build:standalone → one HTML file opened from disk): there is no server, so
 *   AI requests go straight to the provider with the key entered in File › Settings › AI.
 */

/** Set by vite.standalone.config.ts (`define`); absent otherwise. */
declare const __TSDRAW_STANDALONE__: boolean | undefined;

export const STANDALONE: boolean = typeof __TSDRAW_STANDALONE__ !== 'undefined' && !!__TSDRAW_STANDALONE__;

export type AiProvider = 'claude' | 'openai' | 'grok';

const PROVIDER_HOST: Record<AiProvider, string> = {
  claude: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  grok: 'https://api.x.ai',
};
const PROXY_PREFIX: Record<AiProvider, string> = {
  claude: '/api/anthropic',
  openai: '/api/openai',
  grok: '/api/xai',
};

/** Header that carries a key entered in the app to the dev server (which strips it). */
export const API_KEY_HEADER = 'x-tsdraw-api-key';

/** URL and headers for a request to an AI provider; `path` like "/v1/messages". */
export function aiRequest(id: AiProvider, path: string, key: string | undefined): { url: string; headers: Record<string, string> } {
  const k = key?.trim() ?? '';
  if (!STANDALONE) return { url: PROXY_PREFIX[id] + path, headers: k ? { [API_KEY_HEADER]: k } : {} };
  const headers: Record<string, string> =
    id === 'claude'
      ? { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : { authorization: `Bearer ${k}` };
  return { url: PROVIDER_HOST[id] + path, headers };
}
