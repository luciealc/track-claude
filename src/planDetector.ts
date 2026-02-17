import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ClaudeCredentials {
  claudeAiOauth?: {
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

/**
 * Detects the user's plan type from ~/.claude/.credentials.json.
 * Returns 'pro', 'max', or undefined if detection fails.
 */
export function detectPlanType(): string | undefined {
  const candidates = getCredentialPaths();

  for (const credPath of candidates) {
    try {
      const raw = fs.readFileSync(credPath, 'utf-8');
      const creds: ClaudeCredentials = JSON.parse(raw);
      const subType = creds.claudeAiOauth?.subscriptionType;

      if (subType) {
        // subscriptionType is 'pro', 'max_5x', 'max_20x', etc.
        if (subType.startsWith('max')) {
          return 'max';
        }
        return subType; // 'pro', 'free', etc.
      }
    } catch {
      // File doesn't exist or isn't readable
    }
  }

  return undefined;
}

function getCredentialPaths(): string[] {
  const paths: string[] = [];

  // Native path
  paths.push(path.join(os.homedir(), '.claude', '.credentials.json'));

  // WSL paths (when running from Windows)
  if (process.platform === 'win32') {
    const wslDistros = ['Ubuntu', 'Ubuntu-22.04', 'Ubuntu-24.04', 'Debian', 'kali-linux'];
    const windowsUser = os.userInfo().username;

    for (const distro of wslDistros) {
      paths.push(`\\\\wsl.localhost\\${distro}\\home\\${windowsUser}\\.claude\\.credentials.json`);
    }

    // Also scan /home/* in each distro
    for (const distro of wslDistros) {
      const homesDir = `\\\\wsl.localhost\\${distro}\\home`;
      try {
        const users = fs.readdirSync(homesDir, { withFileTypes: true });
        for (const user of users) {
          if (user.isDirectory()) {
            paths.push(path.join(homesDir, user.name, '.claude', '.credentials.json'));
          }
        }
      } catch {
        // Distro not available
      }
    }
  }

  return paths;
}
