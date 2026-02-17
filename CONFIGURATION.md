# Configuration Guide

All settings are accessible via **Settings** (`Ctrl+,`) and searching for `claudeTracker`.

---

## claudeTracker.planType

Controls which token ceiling is used for the usage percentage meter.

| Value | Token Limit | Description |
|-------|-------------|-------------|
| `auto` (default) | varies | Reads your plan from `~/.claude/.credentials.json` automatically |
| `pro` | 45M tokens | Pro plan ($20/month) |
| `max` | 225M tokens | Max plan ($100/month) |

### How auto-detection works

When set to `auto`, the extension reads the `subscriptionType` field from your local Claude credentials file (`~/.claude/.credentials.json`). This file is created and maintained by the Claude Code CLI when you log in.

- `"subscriptionType": "pro"` maps to the Pro token ceiling
- `"subscriptionType": "max_5x"` or `"max_20x"` maps to the Max token ceiling

If the credentials file is missing or unreadable, it falls back to `pro`.

### When to set manually

Set this manually if:
- You recently changed plans and the credentials file hasn't updated yet
- Auto-detection shows the wrong plan
- You want to test what your usage looks like against a different plan's limits

### Example

```json
"claudeTracker.planType": "pro"
```

---

## claudeTracker.refreshRate

How often (in seconds) the extension scans log files for new usage data.

| Property | Value |
|----------|-------|
| Default | `10` |
| Minimum | `2` |
| Maximum | `300` |

The extension uses two update mechanisms:
1. **File system watcher** - triggers instantly when a log file changes
2. **Polling interval** - this setting controls the fallback polling rate

Lower values give more responsive updates but use slightly more resources. The file watcher handles most real-time updates, so this is mainly a safety net.

### Recommendations

| Use case | Value |
|----------|-------|
| Active coding session, want live tracking | `5` |
| Normal use (default) | `10` |
| Background monitoring, conserve resources | `30`-`60` |
| Minimal overhead | `120`-`300` |

### Example

```json
"claudeTracker.refreshRate": 5
```

Changes take effect immediately without reloading VS Code.

---

## claudeTracker.customLogPath

Override the directory where the extension looks for Claude Code log files.

| Property | Value |
|----------|-------|
| Default | `""` (empty = auto-detect) |

### Auto-detection behavior

When empty, the extension searches for logs in this order:

1. `~/.claude/projects/` (native path on macOS/Linux)
2. `\\wsl.localhost\<distro>\home\<user>\.claude\projects\` (WSL paths when running on Windows)

It tries common WSL distro names: Ubuntu, Ubuntu-22.04, Ubuntu-24.04, Debian, kali-linux.

### When to set manually

Set this if:
- Auto-detection doesn't find your logs (uncommon distro name, non-standard home directory)
- You have multiple WSL distros and want to target a specific one
- Your `.claude` directory is in a non-standard location

### WSL users on Windows

If auto-detection fails, use the UNC path format:

```json
"claudeTracker.customLogPath": "\\\\wsl.localhost\\Ubuntu\\home\\youruser\\.claude\\projects"
```

Note the double backslashes — JSON requires escaping `\` as `\\`.

### macOS / Linux users

```json
"claudeTracker.customLogPath": "/home/youruser/.claude/projects"
```

---

## Commands

These are not settings, but available via the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Claude Tracker: Show Dashboard` | Opens the webview dashboard with charts, model breakdown, and countdown timer |
| `Claude Tracker: Refresh Usage` | Clears cached data and re-scans all log files from scratch |

### When to use Refresh

Use `Claude Tracker: Refresh Usage` if:
- The status bar numbers seem stale or incorrect
- You deleted or moved log files
- You switched Claude accounts

---

## Status Bar Indicator

The status bar item (bottom-right of VS Code) shows:

```
$(pulse) Claude: 3.9M / 45.0M (8.6%) | Reset: 3h 42m
```

### Color thresholds

| Color | Usage | Meaning |
|-------|-------|---------|
| Default (no highlight) | 0-59% | Normal usage |
| Yellow background | 60-84% | Approaching limit |
| Red background | 85-100% | Near or at limit |

Click the status bar item to open the full dashboard.
