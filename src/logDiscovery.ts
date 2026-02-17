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
 */
export function getClaudeLogDir(customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  if (process.platform === 'win32') {
    return path.join(os.homedir(), '.claude', 'projects');
  }
  return path.join(os.homedir(), '.claude', 'projects');
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
