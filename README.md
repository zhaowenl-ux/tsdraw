# TSDraw

TypeScript-based chemical structure drawing application, built from scratch.

## Download

Current version: **0.20**

| Get TSDraw as | Download | How to use |
|---|---|---|
| Windows installer | [TSDraw-Setup-0.20.exe](https://github.com/zhaowenl-ux/tsdraw/raw/main/release/TSDraw-Setup-0.20.exe) (42 MB) | Run it, then start TSDraw from the Start menu. Installs for your user only; no administrator rights. |
| Single HTML file (any OS) | [tsdraw.html](https://github.com/zhaowenl-ux/tsdraw/raw/main/release/tsdraw.html) (0.3 MB) | Save it and double-click it. Nothing to install. |
| Source (developers) | `git clone https://github.com/zhaowenl-ux/tsdraw` | `npm install`, then `npm run dev` (see [Distribution](#distribution)). |

The installer is not code-signed: Windows SmartScreen may say "Windows protected your PC". Choose
**More info › Run anyway**. Online features (PubChem, ChEMBL, PubMed, Wikipedia, OPSIN, AI assistant) need
the internet; AI keys are entered in File › Settings › AI.

## Project Structure

```
src/
  core/           Core data structures
    Element.ts    Element class and PeriodicTable
    index.ts      Core exports
  index.ts        Root exports

tests/            Unit tests
```

## Development

```bash
npm install
npm run build
npm run test
```

## Foundation (Phase 1)

- [x] Element class with atomic number, weight, valence, charges
- [x] PeriodicTable singleton with all common elements (40+ elements)
- [x] Vector3D class with 3D geometry operations
- [x] Atom class (Element reference + ID + charge + 3D position)
- [x] Bond class (atom IDs, type, chirality, E/Z conformation)
- [ ] Molecule class (atoms + bonds container)
- [ ] ChemDocument class

## Bond Features

- Bond types: single, double, triple, aromatic
- Chirality: wedge, hash, either (3D stereochemistry)
- Conformation: E/Z or cis/trans (for double bonds)
- Methods: connects(), getOtherAtom(), type checkers, serialization

## Distribution

TSDraw ships three ways:

| Method | For | Build | Result |
|---|---|---|---|
| **1. npm** (from source) | developers | `npm install` then `npm run dev` | dev server at http://localhost:5173/tsdraw-drawing-ui_2.html |
| **2. Single HTML file** | anyone, nothing to install | `npm run build:standalone` | `dist-standalone/tsdraw.html` (~0.3 MB) |
| **3. Desktop app** (Bun) | Windows users | `npm run build:desktop` | `dist-desktop/win/TSDraw.exe` (portable, ~115 MB) and `dist-desktop/TSDraw-Setup-<version>.exe` (installer, ~42 MB) |

The finished HTML file and installer are committed in [`release/`](release/) so they can be downloaded
from GitHub (see [Download](#download)).

### 1. npm (from source)

```bash
git clone https://github.com/zhaowenl-ux/tsdraw
cd tsdraw
npm install
npm run dev          # http://localhost:5173/tsdraw-drawing-ui_2.html
npm run test         # unit tests (vitest)
```

The dev server forwards the AI panel's requests to Anthropic, OpenAI and xAI. Keys go in `.env.local`
(`ANTHROPIC_API_KEY=...`, `OPENAI_API_KEY=...`, `XAI_API_KEY=...`; git ignores this file) or in
File › Settings › AI. Opening `tsdraw-drawing-ui_2.html` directly from disk does **not** work: it loads the
TypeScript sources, which only the dev server can serve.

### 2. Single HTML file

```bash
npm run build:standalone
```

Writes `dist-standalone/tsdraw.html` (built by `vite.standalone.config.ts`): one HTML file with all JavaScript
and CSS inside. It opens with a double-click; no server or install is needed. PubChem, ChEMBL, PubMed,
Wikipedia/Wikidata and OPSIN lookups work from it directly. With no server, the AI panel calls Claude,
ChatGPT or Grok straight from the page with a key entered in File › Settings › AI (kept in that browser only;
see `src/app/runtime.ts`).

### 3. Desktop app (Bun executable + Windows installer)

```bash
npm run build:desktop            # Windows exe + installer
npm run build:desktop -- --all   # also Linux x64 and macOS arm64/x64 executables
```

`desktop/build.mjs` builds the single HTML file if needed, then compiles `desktop/launcher.ts` with
[Bun](https://bun.sh) into `TSDraw.exe`: one executable with the Bun runtime and the app inside. When started it
serves the app on `http://127.0.0.1:47130` (set `TSDRAW_PORT` for another port) and opens it in an Edge or Chrome
app window, else the default browser. The fixed port keeps settings and keys between runs. Starting it again
opens another window; it quits about a minute after the last window is closed.

Then, if NSIS is installed, it builds the installer from `desktop/installer.nsi`: per-user (no administrator
rights) into `%LOCALAPPDATA%\Programs\TSDraw`, with a Start menu shortcut, an optional desktop shortcut and an
uninstall entry in Settings › Apps.

Requirements:
- **Bun**: used from the PATH if installed; otherwise the script downloads it with npm into `node_modules/.cache`.
- **NSIS** for the installer: `winget install NSIS.NSIS` (Windows), `apt install nsis` (Linux) or
  `brew install makensis` (macOS). Without it only `TSDraw.exe` is built.
- The exe icon is set only when building on Windows.

Files: `desktop/launcher.ts` (the program), `desktop/build.mjs` (build script), `desktop/installer.nsi`
(installer), `desktop/release.mjs` (release copy), `desktop/tsdraw.ico` (icon).

The exe and installer are not code-signed, so SmartScreen warns on first run. Signing needs a code-signing
certificate (e.g. `signtool sign` on `TSDraw.exe` before building the installer, then on the installer).

### Publishing a new version

1. Bump `APP_VERSION` in `src/app/version.ts` (e.g. `0.21`).
2. Check: `npx tsc -p tsconfig.json --noEmit` and `npm run test`.
3. Build both packages:
   ```bash
   npm run build:standalone
   npm run build:desktop
   ```
4. Copy them into `release/`:
   ```bash
   npm run release      # release/tsdraw.html and release/TSDraw-Setup-<version>.exe
   ```
   `TSDraw.exe` itself is not copied: GitHub refuses files over 100 MB (the installer contains it).
5. Update the version and file name in the [Download](#download) table above, and `git rm` the previous
   `release/TSDraw-Setup-<old>.exe` (each installer adds ~42 MB to the repository history, so keep only the latest).
6. Commit and push:
   ```bash
   git add -A
   git commit -m "TSDraw <version>"
   git push origin main
   ```
