import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LogFile {
  filePath: string;
  mtime: number;
  size: number;
  projectFolder: string;
}

/**
 * Resolves the Claude projects log directory for the current platform.
 * On Windows, also checks for WSL log paths since Claude Code typically runs in WSL.
 */
export function getClaudeLogDir(customPath?: string): string {
  if (customPath) {
    return customPath;
  }

  // Native path (works for macOS, Linux, or Windows-native Claude Code)
  const nativePath = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(nativePath)) {
    return nativePath;
  }

  // On Windows, check common WSL distro paths via \\wsl.localhost\
  if (process.platform === 'win32') {
    const wslDistros = ['Ubuntu', 'Ubuntu-22.04', 'Ubuntu-24.04', 'Debian', 'kali-linux'];
    const windowsUser = os.userInfo().username;

    for (const distro of wslDistros) {
      // Try matching the Windows username as the WSL username
      const wslPath = path.join(`\\\\wsl.localhost\\${distro}\\home\\${windowsUser}`, '.claude', 'projects');
      if (fs.existsSync(wslPath)) {
        return wslPath;
      }
    }

    // Brute-force: scan /home/* inside each distro for .claude/projects
    for (const distro of wslDistros) {
      const homesDir = `\\\\wsl.localhost\\${distro}\\home`;
      try {
        const users = fs.readdirSync(homesDir, { withFileTypes: true });
        for (const user of users) {
          if (!user.isDirectory()) { continue; }
          const candidate = path.join(homesDir, user.name, '.claude', 'projects');
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      } catch {
        // Distro doesn't exist or isn't running
      }
    }
  }

  // Fallback to native path even if it doesn't exist yet
  return nativePath;
}

/**
 * Recursively finds all *.jsonl files in the Claude projects directory.
 * Only returns files modified within the last 24 hours for performance.
 * Sorted by mtime descending (most recently modified first).
 */
export function discoverLogFiles(baseDir: string, maxAgeMs: number = 24 * 60 * 60 * 1000): LogFile[] {
  const results: LogFile[] = [];
  const cutoff = Date.now() - maxAgeMs;

  if (!fs.existsSync(baseDir)) {
    return results;
  }

  try {
    const projectFolders = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const entry of projectFolders) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(baseDir, entry.name);
      scanDirectory(projectDir, entry.name, cutoff, results);
    }
  } catch {
    // Permission denied or directory doesn't exist
  }

  // Sort by mtime descending (most recently modified first)
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

function scanDirectory(dir: string, projectFolder: string, cutoff: number, results: LogFile[]): void {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dir, file.name);

      if (file.isDirectory()) {
        scanDirectory(fullPath, projectFolder, cutoff, results);
        continue;
      }

      if (!file.name.endsWith('.jsonl')) {
        continue;
      }

      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs >= cutoff) {
          results.push({
            filePath: fullPath,
            mtime: stat.mtimeMs,
            size: stat.size,
            projectFolder,
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }
}
