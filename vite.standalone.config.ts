import { defineConfig, mergeConfig, type Plugin, type UserConfig } from 'vite';
import appConfig from './vite.app.config.ts';

// One self-contained HTML file for distribution: dist-standalone/tsdraw.html, with all JavaScript and
// CSS inside it. It opens straight from disk (double-click), with no server. Without a server, the AI
// panel calls the providers directly with a key entered in File › Settings › AI (see src/app/runtime.ts).
//
//   npm run build:standalone

/** Put the built JS and CSS into the HTML page and drop the separate files. */
function inlineIntoHtml(): Plugin {
  return {
    name: 'tsdraw-inline-into-html',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && name.endsWith('.js')) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${escapeRe(name)}"[^>]*></script>`);
          if (!tag.test(page)) continue;
          // "</script" inside the code would end the inline script early.
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          page = page.replace(tag, () => `<script type="module">\n${code}\n</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escapeRe(name)}"[^>]*>`);
          if (!tag.test(page)) continue;
          page = page.replace(tag, () => `<style>\n${String(file.source)}\n</style>`);
          delete bundle[name];
        }
      }
      html.source = page;
      html.fileName = 'tsdraw.html';
    },
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig((env) => {
  const base = typeof appConfig === 'function' ? appConfig(env) : appConfig;
  return mergeConfig(base as UserConfig, {
    base: './',
    plugins: [inlineIntoHtml()],
    define: {
      __TSDRAW_STANDALONE__: 'true',
    },
    build: {
      outDir: 'dist-standalone',
      emptyOutDir: true,
      // Images and fonts become data: URLs; nothing is left as a separate file.
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      modulePreload: false,
    },
  } satisfies UserConfig);
});
