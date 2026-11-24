/**
 * TSDraw desktop launcher (compiled with Bun into one executable: TSDraw.exe).
 *
 * Serves the single-file app (dist-standalone/tsdraw.html, embedded at build time) on 127.0.0.1 and
 * opens it in an app window (Edge or Chrome "--app" mode, else the default browser).
 * A fixed port keeps the same origin between runs, so settings and API keys saved in the browser stay.
 * Starting TSDraw again while it runs just opens another window. The launcher quits by itself about a
 * minute after the last TSDraw window is closed (each window sends a heartbeat).
 *
 * Build: npm run build:desktop   (see "Distribution" in README.md)
 */
import html from '../dist-standalone/tsdraw.html' with { type: 'text' };
import { existsSync } from 'node:fs';

const PORT = Number(process.env.TSDRAW_PORT) || 47130;
const HOST = '127.0.0.1';
const URL_BASE = `http://${HOST}:${PORT}/`;
const IDLE_EXIT_MS = 60_000;
/** Inlined by the build (bun build --env=TSDRAWBUILD_*); see desktop/build.mjs. */
const VERSION = process.env.TSDRAWBUILD_VERSION ?? '';

// Each page pings the launcher; when no page has pinged for a while, the launcher exits.
const HEARTBEAT = `<script>(function(){var p=function(){fetch('/__tsdraw/alive',{method:'POST'}).catch(function(){})};p();setInterval(p,15000);})();</script>`;
const page = html.includes('</body>') ? html.replace('</body>', `${HEARTBEAT}</body>`) : html + HEARTBEAT;

let lastSeen = Date.now();

async function alreadyRunning(): Promise<boolean> {
  try {
    const r = await fetch(`${URL_BASE}__tsdraw/ping`, { signal: AbortSignal.timeout(1500) });
    return r.ok && (await r.text()) === 'tsdraw';
  } catch {
    return false;
  }
}

function startServer(): void {
  Bun.serve({
    hostname: HOST,
    port: PORT,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === '/__tsdraw/ping') return new Response('tsdraw');
      if (path === '/__tsdraw/alive') {
        lastSeen = Date.now();
        return new Response('ok');
      }
      if (path === '/' || path === '/index.html' || path === '/tsdraw.html') {
        return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return new Response('Not found', { status: 404 });
    },
  });
  setInterval(() => {
    if (Date.now() - lastSeen > IDLE_EXIT_MS) {
      console.log('No TSDraw window is open any more: closing.');
      process.exit(0);
    }
  }, 5_000);
}

/** A Chromium browser that can open the app in its own window (no tabs or address bar). */
function appBrowser(): string | null {
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean) as string[];
    const rel = ['Microsoft\\Edge\\Application\\msedge.exe', 'Google\\Chrome\\Application\\chrome.exe'];
    for (const r of rel) for (const root of roots) if (existsSync(`${root}\\${r}`)) return `${root}\\${r}`;
  } else if (process.platform === 'darwin') {
    for (const p of [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ])
      if (existsSync(p)) return p;
  } else {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'])
      if (existsSync(p)) return p;
  }
  return null;
}

function openWindow(): void {
  if (process.env.TSDRAW_NO_BROWSER) return; // for tests: serve only
  const browser = appBrowser();
  const cmd = browser
    ? [browser, `--app=${URL_BASE}`, '--window-size=1400,900']
    : process.platform === 'win32'
      ? ['cmd', '/c', 'start', '', URL_BASE]
      : process.platform === 'darwin'
        ? ['open', URL_BASE]
        : ['xdg-open', URL_BASE];
  Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' }).unref();
}

if (await alreadyRunning()) {
  openWindow();
  process.exit(0);
}
try {
  startServer();
} catch (err) {
  console.error(`TSDraw could not start on port ${PORT}: ${err instanceof Error ? err.message : err}`);
  console.error('Another program uses that port. Set TSDRAW_PORT to another number and start TSDraw again.');
  await Bun.sleep(15_000);
  process.exit(1);
}
console.log(`TSDraw ${VERSION ? 'v' + VERSION + ' ' : ''}is running at ${URL_BASE}`);
console.log('This window can stay minimised; TSDraw closes it about a minute after its last window is closed.');
openWindow();
