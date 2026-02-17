import * as fs from 'fs';
import { LogFile } from './logDiscovery';

export interface MessageCounts {
  userMessages: number;
  assistantMessages: number;
  totalMessages: number;
}

interface FileMessageState {
  byteOffset: number;
  lastModified: number;
  userCount: number;
  assistantCount: number;
}

/**
 * Tracks per-file message counts using byte offsets so we never recount.
 */
const fileState = new Map<string, FileMessageState>();

/**
 * Counts all user and assistant messages across the given log files.
 * Uses byte offsets to incrementally count only new lines.
 */
export function countMessages(logFiles: LogFile[]): MessageCounts {
  for (const logFile of logFiles) {
    countNewMessages(logFile);
  }

  let userMessages = 0;
  let assistantMessages = 0;

  for (const state of fileState.values()) {
    userMessages += state.userCount;
    assistantMessages += state.assistantCount;
  }

  return {
    userMessages,
    assistantMessages,
    totalMessages: userMessages + assistantMessages,
  };
}

function countNewMessages(logFile: LogFile): void {
  const existing = fileState.get(logFile.filePath);

  if (existing && existing.lastModified === logFile.mtime && existing.byteOffset > 0) {
    return; // File unchanged
  }

  const startOffset = existing?.byteOffset ?? 0;
  let newUser = 0;
  let newAssistant = 0;

  try {
    const fd = fs.openSync(logFile.filePath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      if (stat.size <= startOffset) {
        fileState.set(logFile.filePath, {
          byteOffset: stat.size,
          lastModified: logFile.mtime,
          userCount: existing?.userCount ?? 0,
          assistantCount: existing?.assistantCount ?? 0,
        });
        return;
      }

      const bufferSize = stat.size - startOffset;
      const buffer = Buffer.alloc(bufferSize);
      fs.readSync(fd, buffer, 0, bufferSize, startOffset);

      const text = buffer.toString('utf-8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) { continue; }

        try {
          const obj = JSON.parse(trimmed);
          if (obj.type === 'user' && obj.message?.role === 'user') {
            newUser++;
          } else if (obj.type === 'assistant' && obj.message?.role === 'assistant') {
            newAssistant++;
          }
        } catch {
          // Skip malformed lines
        }
      }

      fileState.set(logFile.filePath, {
        byteOffset: stat.size,
        lastModified: logFile.mtime,
        userCount: (existing?.userCount ?? 0) + newUser,
        assistantCount: (existing?.assistantCount ?? 0) + newAssistant,
      });
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Skip unreadable files
  }
}

export function resetMessageCounts(): void {
  fileState.clear();
}
