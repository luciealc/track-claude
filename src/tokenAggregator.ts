import * as fs from 'fs';
import { LogFile } from './logDiscovery';
import {
  UsageEntry,
  AggregatedUsage,
  DailyUsage,
  FileOffset,
  TokenUsage,
  WINDOW_MS,
} from './types';

/**
 * Tracks file byte offsets so we only read new data on subsequent polls.
 */
const fileOffsets = new Map<string, FileOffset>();

/**
 * Parses new lines from log files, extracting only usage and model fields.
 * Uses file offsets to avoid re-reading previously parsed data.
 */
export function parseNewEntries(logFiles: LogFile[]): UsageEntry[] {
  const entries: UsageEntry[] = [];

  for (const logFile of logFiles) {
    const newEntries = readNewLines(logFile);
    entries.push(...newEntries);
  }

  return entries;
}

function readNewLines(logFile: LogFile): UsageEntry[] {
  const entries: UsageEntry[] = [];
  const existing = fileOffsets.get(logFile.filePath);

  let startOffset = 0;
  if (existing && existing.lastModified === logFile.mtime && existing.byteOffset > 0) {
    // File hasn't changed since last read - skip entirely
    return entries;
  }
  if (existing) {
    startOffset = existing.byteOffset;
  }

  try {
    const fd = fs.openSync(logFile.filePath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      if (stat.size <= startOffset) {
        fileOffsets.set(logFile.filePath, {
          filePath: logFile.filePath,
          byteOffset: stat.size,
          lastModified: logFile.mtime,
        });
        return entries;
      }

      const bufferSize = stat.size - startOffset;
      const buffer = Buffer.alloc(bufferSize);
      fs.readSync(fd, buffer, 0, bufferSize, startOffset);

      const text = buffer.toString('utf-8');
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const entry = parseLine(trimmed, logFile);
        if (entry) {
          entries.push(entry);
        }
      }

      fileOffsets.set(logFile.filePath, {
        filePath: logFile.filePath,
        byteOffset: stat.size,
        lastModified: logFile.mtime,
      });
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Skip files we can't read
  }

  return entries;
}

/**
 * Parses a single JSONL line, extracting only usage and model fields.
 * Deliberately ignores message content for privacy.
 */
function parseLine(line: string, logFile: LogFile): UsageEntry | null {
  try {
    const obj = JSON.parse(line);

    // Only interested in assistant messages with usage data
    if (obj.type !== 'assistant' || !obj.message?.usage) {
      return null;
    }

    const usage = obj.message.usage;
    const model: string = obj.message.model || 'unknown';
    const timestamp = obj.timestamp ? new Date(obj.timestamp) : new Date();

    // Extract the session ID from the parent data
    const sessionId: string = obj.sessionId || '';

    const tokenUsage: TokenUsage = {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
    };

    // Skip entries with zero total usage (streaming deltas with no new tokens)
    const total = tokenUsage.input_tokens + tokenUsage.output_tokens +
      tokenUsage.cache_creation_input_tokens + tokenUsage.cache_read_input_tokens;
    if (total === 0) {
      return null;
    }

    return {
      timestamp,
      model,
      usage: tokenUsage,
      sessionId,
      projectFolder: logFile.projectFolder,
    };
  } catch {
    return null;
  }
}

/**
 * Aggregates usage entries within the 5-hour rolling window.
 */
export function aggregateWindow(entries: UsageEntry[]): AggregatedUsage {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  const windowEntries = entries.filter(e => e.timestamp >= windowStart);

  const modelBreakdown = new Map<string, number>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  for (const entry of windowEntries) {
    totalInputTokens += entry.usage.input_tokens;
    totalOutputTokens += entry.usage.output_tokens;
    totalCacheCreationTokens += entry.usage.cache_creation_input_tokens;
    totalCacheReadTokens += entry.usage.cache_read_input_tokens;

    const modelTotal = entry.usage.input_tokens + entry.usage.output_tokens +
      entry.usage.cache_creation_input_tokens + entry.usage.cache_read_input_tokens;
    const current = modelBreakdown.get(entry.model) || 0;
    modelBreakdown.set(entry.model, current + modelTotal);
  }

  const totalTokens = totalInputTokens + totalOutputTokens +
    totalCacheCreationTokens + totalCacheReadTokens;

  // Find the oldest entry — its timestamp + 5h is when the first tokens expire
  let oldestEntryTime: Date | null = null;
  if (windowEntries.length > 0) {
    oldestEntryTime = windowEntries.reduce(
      (oldest, e) => e.timestamp < oldest ? e.timestamp : oldest,
      windowEntries[0].timestamp
    );
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens,
    modelBreakdown,
    windowStart,
    windowEnd: now,
    oldestEntryTime,
    entries: windowEntries,
  };
}

/**
 * Computes daily usage over the last 7 days for the dashboard charts.
 */
export function computeDailyUsage(entries: UsageEntry[], days: number = 7): DailyUsage[] {
  const now = new Date();
  const result: DailyUsage[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    const dayEntries = entries.filter(e => {
      return e.timestamp.toISOString().slice(0, 10) === dateStr;
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheTokens = 0;

    for (const entry of dayEntries) {
      inputTokens += entry.usage.input_tokens;
      outputTokens += entry.usage.output_tokens;
      cacheTokens += entry.usage.cache_creation_input_tokens + entry.usage.cache_read_input_tokens;
    }

    result.push({
      date: dateStr,
      inputTokens,
      outputTokens,
      cacheTokens,
      totalTokens: inputTokens + outputTokens + cacheTokens,
    });
  }

  return result;
}

/**
 * Resets the file offset cache. Useful when re-scanning from scratch.
 */
export function resetOffsets(): void {
  fileOffsets.clear();
}
