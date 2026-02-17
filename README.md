# Claude Code Activity Tracker

VS Code extension that monitors local Claude Code activity to provide real-time token usage tracking, model selection history, and subscription status.

## Features

- **Live Status Bar** - Token usage percentage with color-coded thresholds (green/yellow/red)
- **Webview Dashboard** - 7-day bar charts with hover tooltips, model distribution pie chart, countdown timer
- **5-Hour Rolling Window** - Tracks Anthropic's rolling usage window with reset countdown
- **All-Time Message Counter** - Lifetime count of all messages exchanged with Claude
- **Model Tracking** - See which models (Opus, Sonnet, Haiku) are being used
- **Auto Plan Detection** - Reads your subscription type (Pro/Max) from Claude credentials
- **Privacy-First** - Only reads usage/model fields, never touches prompt content

## How It Works

Reads local `.jsonl` log files from `~/.claude/projects/` using:
- File system watcher for real-time updates
- Periodic polling (configurable interval)
- File byte offsets to avoid re-reading old data

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeTracker.planType` | `auto` | `auto`, `pro` ($20), or `max` ($100) - sets token ceiling |
| `claudeTracker.refreshRate` | `10` | Seconds between log scans |
| `claudeTracker.customLogPath` | `""` | Override default log directory |

See [CONFIGURATION.md](CONFIGURATION.md) for detailed documentation on each setting.

## Commands

- `Claude Tracker: Show Dashboard` - Open the webview dashboard
- `Claude Tracker: Refresh Usage` - Force a full re-scan of logs

## Development

```bash
npm install
npm run compile    # one-time build
npm run watch      # continuous build
```

Press F5 in VS Code to launch the Extension Development Host.

## Deployment (Local Install)

The extension is installed locally as a `.vsix` package. No marketplace publishing is needed.

### Prerequisites

- Node.js and npm (installed in WSL)
- VS Code (installed on Windows)

### Build and Install

1. **Install dependencies** (first time only):

   ```bash
   cd /home/aloccluce/Projects/track-claude
   npm install
   ```

2. **Package the extension** into a `.vsix` file:

   ```bash
   npx @vscode/vsce package --allow-missing-repository
   ```

   This compiles TypeScript and produces `claude-code-tracker-<version>.vsix` in the project root.

3. **Copy to Windows filesystem** (required for WSL — VS Code cannot install from UNC paths):

   ```bash
   cp claude-code-tracker-*.vsix /mnt/c/Users/alocc/
   ```

4. **Install into VS Code**:

   ```bash
   code --install-extension "C:\Users\alocc\claude-code-tracker-<version>.vsix"
   ```

   Replace `<version>` with the version in `package.json` (currently `0.3.0`).

5. **Reload VS Code** — `Ctrl+Shift+P` → "Reload Window"

The extension activates automatically on startup. No further action needed.

### Updating After Code Changes

Re-run steps 2–5. Bump the `version` in `package.json` before packaging if VS Code caches the old version.

### One-Liner (rebuild + reinstall)

```bash
cd /home/aloccluce/Projects/track-claude \
  && npx @vscode/vsce package --allow-missing-repository \
  && cp claude-code-tracker-*.vsix /mnt/c/Users/alocc/ \
  && code --install-extension "C:\Users\alocc\claude-code-tracker-0.3.0.vsix"
```

Then reload VS Code.

### Uninstalling

```bash
code --uninstall-extension aloccluce.claude-code-tracker
```

Or in VS Code: Extensions sidebar → find "Claude Code Activity Tracker" → Uninstall.
