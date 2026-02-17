export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface UsageEntry {
  timestamp: Date;
  model: string;
  usage: TokenUsage;
  sessionId: string;
  projectFolder: string;
}

export interface AggregatedUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  modelBreakdown: Map<string, number>;
  windowStart: Date;
  windowEnd: Date;
  /** Timestamp of the oldest entry in the window (null if no entries). */
  oldestEntryTime: Date | null;
  entries: UsageEntry[];
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
}

export interface FileOffset {
  filePath: string;
  byteOffset: number;
  lastModified: number;
}

/** Token limits by plan type (approximate). */
export const PLAN_LIMITS: Record<string, number> = {
  pro: 45_000_000,
  max: 225_000_000,
};

/** Rolling window duration in milliseconds (5 hours). */
export const WINDOW_MS = 5 * 60 * 60 * 1000;
