// Build the TSDraw desktop app: TSDraw.exe (Bun single-file executable) and TSDraw-Setup-<version>.exe (NSIS).
//
//   npm run build:desktop            (Windows x64 exe + installer)
//   npm run build:desktop -- --all   (also Linux x64 and macOS arm64/x64 executables)
//
// Needs: Bun (downloaded with npm into node_modules/.cache when not installed) and, for the installer, NSIS's makensis on the PATH
// (Windows: `winget install NSIS.NSIS`; Linux: `apt install nsis`; macOS: `brew install makensis`).
// Run `npm run build:standalone` first, or let this script do it (it does when dist-standalone is missing).
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-desktop');
const all = process.argv.includes('--all');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const has = (cmd, flag = '--version') => spawnSync(`${cmd} ${flag}`, { shell: true, stdio: 'ignore' }).status === 0;

const html = join(root, 'dist-standalone', 'tsdraw.html');
if (!existsSync(html) || process.argv.includes('--rebuild')) run('npm run build:standalone');
const version = (readFileSync(join(root, 'src', 'app', 'version.ts'), 'utf8').match(/APP_VERSION = '([\d.]+)'/) ?? [])[1] ?? '0.0';
// Run Bun directly (no shell), so arguments need no quoting on any platform.
const bunWorks = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;
const bun = bunWorks ? 'bun' : localBun();

/**
 * Bun without a global install: npm-installed into node_modules/.cache/bun-tool. The "bun" npm package
 * puts the real binary in @oven/bun-<os>-<arch> and only links it in a postinstall step, which can leave
 * a stub behind on Windows, so the binary is taken from @oven directly.
 */
function localBun() {
  const dir = join(root, 'node_modules', '.cache', 'bun-tool');
  const exe = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const find = () => {
    const oven = join(dir, 'node_modules', '@oven');
    if (!existsSync(oven)) return null;
    for (const pkg of readdirSync(oven)) {
      const file = join(oven, pkg, 'bin', exe);
      if (existsSync(file) && statSync(file).size > 1_000_000) return file;
    }
    return null;
  };
  if (!find()) run(`npm install --no-save --no-audit --no-fund --prefix "${dir}" bun@1.4.5`);
  const file = find();
  if (!file) throw new Error('Could not get Bun. Install it (https://bun.sh) and run this again.');
  return file;
}

mkdirSync(join(out, 'win'), { recursive: true });
const targets = [['bun-windows-x64', join(out, 'win', 'TSDraw.exe')]];
if (all)
  targets.push(
    ['bun-linux-x64', join(out, 'linux-x64', 'tsdraw')],
    ['bun-darwin-arm64', join(out, 'macos-arm64', 'tsdraw')],
    ['bun-darwin-x64', join(out, 'macos-x64', 'tsdraw')]
  );
for (const [target, file] of targets) {
  mkdirSync(dirname(file), { recursive: true });
  // The exe icon can only be set when building on Windows (Bun uses Windows APIs for it).
  const icon = target.includes('windows') && process.platform === 'win32' ? ' --windows-icon=desktop/tsdraw.ico' : '';
  const args = ['build', 'desktop/launcher.ts', '--compile', '--minify', `--target=${target}`, '--env=TSDRAWBUILD_*', `--outfile=${file}`];
  if (icon) args.push(icon.trim());
  execFileSync(bun, args, { cwd: root, stdio: 'inherit', env: { ...process.env, TSDRAWBUILD_VERSION: version } });
}

// Files the installer adds next to the program.
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
copyFileSync(join(root, 'desktop', 'tsdraw.ico'), join(out, 'win', 'tsdraw.ico'));
writeFileSync(join(out, 'win', 'LICENSE.txt'), crlf(readFileSync(join(root, 'LICENSE'), 'utf8')));
writeFileSync(
  join(out, 'win', 'README.txt'),
  crlf(`TSDraw ${version}
Chemical structure drawing. https://github.com/zhaowenl-ux/tsdraw

Start TSDraw from the Start menu. It opens in its own window (Microsoft Edge or Google Chrome app
window, or your default browser). A small TSDraw window runs minimised in the taskbar while TSDraw is
open and closes by itself about a minute after the last TSDraw window is closed.

TSDraw uses http://127.0.0.1:47130 on this computer only. If another program uses that port, set the
environment variable TSDRAW_PORT to another number.

Online features (PubChem, ChEMBL, PubMed, Wikipedia, OPSIN, AI assistant) need the internet. AI keys are
entered in File > Settings > AI and stay in this computer's browser.

License: GNU General Public License v2.0 (LICENSE.txt).
`)
);

if (has('makensis', '-VERSION')) {
  const setup = join(out, `TSDraw-Setup-${version}.exe`);
  run(`makensis -V2 -DVERSION=${version} "-DSRC=${join(out, 'win')}" "-DOUT=${setup}" desktop/installer.nsi`);
  console.log(`\nInstaller: ${setup}`);
} else {
  console.log('\nmakensis (NSIS) not found: built dist-desktop/win/TSDraw.exe only, no installer.');
}
