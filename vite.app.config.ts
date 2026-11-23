import { defineConfig, loadEnv } from 'vite';

// Config for the interactive drawing application (tsdraw-drawing-ui_2.html + src/app).
// The library build stays in vite.config.ts.
//
// The "Ask AI" panel talks to Claude, ChatGPT or Grok through this dev/preview server:
//   /api/anthropic -> https://api.anthropic.com   key: ANTHROPIC_API_KEY
//   /api/openai    -> https://api.openai.com      key: OPENAI_API_KEY
//   /api/xai       -> https://api.x.ai            key: XAI_API_KEY
// The server adds the API key: one entered in the app (File › Settings › AI, kept in the browser), or else
// the one in .env.local (which git ignores). Providers with neither report a missing key in the panel.

// A key entered in the app (File › Settings › AI) arrives in this header and wins over .env.local.
// It is removed before the request goes on to the provider.
const KEY_HEADER = 'x-tsdraw-api-key';

type ProxyReq = { setHeader: (k: string, v: string) => void; removeHeader: (k: string) => void };
type IncomingReq = { headers: Record<string, string | string[] | undefined> };
type Middleware = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (body: string) => void }, next: () => void) => void;

function forward(prefix: string, target: string, envKey: string, addHeaders: (req: ProxyReq, key: string) => void) {
  return {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ''),
    configure: (proxy: { on: (event: string, fn: (proxyReq: ProxyReq, req: IncomingReq) => void) => void }) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const fromApp = req.headers[KEY_HEADER];
        const key = (typeof fromApp === 'string' && fromApp.trim()) || envKey;
        proxyReq.removeHeader(KEY_HEADER);
        addHeaders(proxyReq, key);
        // A server-to-server call: drop the browser's origin headers.
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const anthropicKey = env.ANTHROPIC_API_KEY ?? '';
  const openaiKey = env.OPENAI_API_KEY ?? '';
  const xaiKey = env.XAI_API_KEY ?? '';

  const aiProxy = {
    '/api/anthropic': forward('/api/anthropic', 'https://api.anthropic.com', anthropicKey, (req, key) => {
      req.setHeader('x-api-key', key);
      req.setHeader('anthropic-version', '2023-06-01');
    }),
    '/api/openai': forward('/api/openai', 'https://api.openai.com', openaiKey, (req, key) => {
      req.setHeader('authorization', `Bearer ${key}`);
    }),
    '/api/xai': forward('/api/xai', 'https://api.x.ai', xaiKey, (req, key) => {
      req.setHeader('authorization', `Bearer ${key}`);
    }),
  };

  // Settings › AI asks which providers have a key in .env.local (only yes/no, never the key itself).
  const keyStatus: Middleware = (req, res, next) => {
    if (req.url !== '/api/tsdraw/key-status') return next();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ claude: !!anthropicKey, openai: !!openaiKey, grok: !!xaiKey }));
  };
  const keyStatusPlugin = {
    name: 'tsdraw-key-status',
    configureServer(server: { middlewares: { use: (fn: Middleware) => void } }) {
      server.middlewares.use(keyStatus);
    },
    configurePreviewServer(server: { middlewares: { use: (fn: Middleware) => void } }) {
      server.middlewares.use(keyStatus);
    },
  };

  // Shown in Help › About: when this copy was built, e.g. "2026-11-23 14:05 UTC".
  const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return {
    plugins: [keyStatusPlugin],
    define: {
      __TSDRAW_BUILD_TIME__: JSON.stringify(buildTime),
    },
    server: {
      open: '/tsdraw-drawing-ui_2.html',
      proxy: aiProxy,
    },
    preview: {
      proxy: aiProxy,
    },
    build: {
      outDir: 'dist-app',
      emptyOutDir: true,
      rollupOptions: {
        input: 'tsdraw-drawing-ui_2.html',
      },
    },
  };
});
