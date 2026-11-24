// Copy the built distribution files into release/ (committed to GitHub, so people can download them):
//   release/tsdraw.html                  single-file app        (from npm run build:standalone)
//   release/TSDraw-Setup-<version>.exe   Windows installer      (from npm run build:desktop)
//
//   npm run release
//
// TSDraw.exe itself (~115 MB) is not copied: GitHub refuses files over 100 MB in a repository.
// Older TSDraw-Setup-*.exe files in release/ are left in place; remove them with `git rm` when they are
// no longer wanted.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = (readFileSync(join(root, 'src', 'app', 'version.ts'), 'utf8').match(/APP_VERSION = '([\d.]+)'/) ?? [])[1];
const html = join(root, 'dist-standalone', 'tsdraw.html');
const setup = join(root, 'dist-desktop', `TSDraw-Setup-${version}.exe`);

const missing = [
  [html, 'npm run build:standalone'],
  [setup, 'npm run build:desktop'],
].filter(([file]) => !existsSync(file));
if (missing.length) {
  for (const [file, cmd] of missing) console.error(`Missing ${file}: run "${cmd}" first.`);
  process.exit(1);
}
// The HTML file must be the same version as the installer.
const quoted = new RegExp(`[\`'"]${version.replace('.', '\\.')}[\`'"]`);
if (!quoted.test(readFileSync(html, 'utf8'))) {
  console.error(`dist-standalone/tsdraw.html is not version ${version}: run "npm run build:standalone" again.`);
  process.exit(1);
}

const out = join(root, 'release');
mkdirSync(out, { recursive: true });
copyFileSync(html, join(out, 'tsdraw.html'));
copyFileSync(setup, join(out, `TSDraw-Setup-${version}.exe`));
console.log(`release/tsdraw.html and release/TSDraw-Setup-${version}.exe are ready (v${version}).`);
console.log('Next: update the version in the README download links, then commit and push.');
