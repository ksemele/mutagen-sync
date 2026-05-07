# Development Guide

## Requirements

- Node.js 18+
- VSCode
- Mutagen installed and daemon running (see README for installation)

## Setup

```bash
npm install
```

## Build and install into VSCode

```bash
./build.sh
```

Compiles TypeScript, packages the VSIX (filename derived from `package.json`), and installs it into VSCode. After installation — **Cmd+Shift+P → Reload Window**.

## Run in development mode (F5)

```bash
npm run watch   # compile in watch mode
```

Then open this folder in VSCode and press **F5** — an Extension Development Host opens with the extension loaded live.

## Project structure

```
src/
  extension.ts           — activation, status bar, commands, auto-refresh
  mutagenService.ts      — mutagen CLI wrapper, output parser
  sessionTreeProvider.ts — session tree view in Explorer
test-env/
  README.md              — how to run the Docker-based test environment
  setup.sh               — start containers and create 3 test sessions
  teardown.sh            — clean up everything
```

## Test environment

A Docker-based manual test environment lives in `test-env/`. It creates three sessions demonstrating Watching, Paused, and Disconnected states. See [test-env/README.md](test-env/README.md) for usage.

---

## Versioning and releases

This project uses [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **PATCH** (`0.1.1`) — bug fixes, no new features
- **MINOR** (`0.2.0`) — new features, backwards-compatible
- **MAJOR** (`1.0.0`) — breaking changes

### Release checklist

1. **Update version** in `package.json`:
   ```bash
   npm version patch   # 0.1.0 → 0.1.1
   npm version minor   # 0.1.0 → 0.2.0
   npm version major   # 0.1.0 → 1.0.0
   ```
   `npm version` edits `package.json` and creates a git commit + tag automatically.

2. **Update `CHANGELOG.md`** — add a section for the new version before running `npm version`.

3. **Build and smoke-test locally**:
   ```bash
   ./build.sh
   # Cmd+Shift+P → Reload Window → verify the extension works
   ```

4. **Push to GitHub**:
   ```bash
   git push && git push --tags
   ```

5. **Create a GitHub release** (optional — uploads the VSIX as a downloadable asset):
   ```bash
   gh release create v0.x.y dist/mutagen-sync-0.x.y.vsix \
     --title "v0.x.y" \
     --notes "See CHANGELOG.md"
   ```

6. **Publish to VS Code Marketplace**:
   ```bash
   npm run publish
   ```

---

## Publishing to VS Code Marketplace

### One-time setup

1. **Create a Microsoft account** (or use an existing one).

2. **Create a publisher** at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage/publishers/).
   Use publisher ID `ksemele` (already set in `package.json`).

3. **Create a Personal Access Token (PAT)**:
   - Go to [dev.azure.com](https://dev.azure.com/) → your organization → **User Settings → Personal Access Tokens**
   - Click **New Token**
   - Set **Organization** to `All accessible organizations`
   - Under **Scopes**, select **Marketplace → Manage**
   - Copy the token (shown only once)

4. **Log in with vsce**:
   ```bash
   npx vsce login ksemele
   # paste your PAT when prompted
   ```

### Publishing

After completing the release checklist:

```bash
npm run publish
```

The extension appears on the Marketplace within a few minutes:
`https://marketplace.visualstudio.com/items?itemName=ksemele.mutagen-sync`

---

## GitHub repository preparation checklist

Before making the repository public:

- [ ] Update `repository`, `bugs`, `homepage` URLs in `package.json` to match your actual GitHub repo URL
- [ ] Verify `LICENSE` has the correct copyright year and name
- [ ] Confirm `test-env/keys/` and `test-env/sync-dirs/` are in `.gitignore` (SSH keys must not be published)
- [ ] Remove any leftover `.vsix` files from the project root: `rm -f *.vsix`
