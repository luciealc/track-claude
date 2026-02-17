import * as vscode from 'vscode';
import { AggregatedUsage, PLAN_LIMITS, WINDOW_MS } from './types';
import { MessageCounts } from './messageCounter';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'claudeTracker.showDashboard';
    this.statusBarItem.tooltip = 'Click to open Claude Activity Dashboard';
    this.statusBarItem.text = '$(pulse) Claude: --';
    this.statusBarItem.show();
  }

  update(aggregated: AggregatedUsage, planType: string, messages?: MessageCounts): void {
    const limit = PLAN_LIMITS[planType] || PLAN_LIMITS.max;
    const usagePercent = Math.min((aggregated.totalTokens / limit) * 100, 100);
    const resetTime = this.formatResetTime(aggregated.oldestEntryTime);

    const totalFormatted = this.formatTokenCount(aggregated.totalTokens);
    const limitFormatted = this.formatTokenCount(limit);

    this.statusBarItem.text = `$(pulse) Claude: ${totalFormatted} / ${limitFormatted} (${usagePercent.toFixed(1)}%) | Reset: ${resetTime}`;

    // Color thresholds: Green (<60%), Yellow (60-85%), Red (>85%)
    if (usagePercent >= 85) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (usagePercent >= 60) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }

    // Detailed tooltip
    const tooltipLines = [
      `Claude Code Activity Tracker`,
      `──────────────────────`,
      `Input tokens: ${aggregated.totalInputTokens.toLocaleString()}`,
      `Output tokens: ${aggregated.totalOutputTokens.toLocaleString()}`,
      `Cache creation: ${aggregated.totalCacheCreationTokens.toLocaleString()}`,
      `Cache read: ${aggregated.totalCacheReadTokens.toLocaleString()}`,
      `──────────────────────`,
      `Total: ${aggregated.totalTokens.toLocaleString()} / ${limit.toLocaleString()}`,
      `Usage: ${usagePercent.toFixed(1)}%`,
      `Plan: ${planType.toUpperCase()}`,
      `Window resets: ${resetTime}`,
    ];

    if (messages) {
      tooltipLines.push(
        `──────────────────────`,
        `All-time messages: ${messages.totalMessages.toLocaleString()}`,
        `  You: ${messages.userMessages.toLocaleString()}`,
        `  Claude: ${messages.assistantMessages.toLocaleString()}`,
      );
    }

    tooltipLines.push(`──────────────────────`, `Click to open dashboard`);
    this.statusBarItem.tooltip = tooltipLines.join('\n');
  }

  private formatTokenCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  }

  private formatResetTime(oldestEntryTime: Date | null): string {
    if (!oldestEntryTime) {
      return 'no activity';
    }

    // The oldest entry expires (falls out of the window) at its timestamp + 5h
    const expiresAt = oldestEntryTime.getTime() + WINDOW_MS;
    const diffMs = expiresAt - Date.now();

    if (diffMs <= 0) {
      return 'now';
    }

    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
