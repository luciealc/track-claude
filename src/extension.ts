import * as vscode from 'vscode';
import { getClaudeLogDir, discoverLogFiles } from './logDiscovery';
import { parseNewEntries, aggregateWindow, computeDailyUsage, resetOffsets } from './tokenAggregator';
import { countMessages, resetMessageCounts, MessageCounts } from './messageCounter';
import { StatusBarManager } from './statusBar';
import { DashboardPanel } from './webviewDashboard';
import { detectPlanType } from './planDetector';
import { UsageEntry } from './types';

let statusBar: StatusBarManager;
let pollInterval: ReturnType<typeof setInterval> | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let allEntries: UsageEntry[] = [];
let detectedPlanType: string | undefined;
let lifetimeMessages: MessageCounts = { userMessages: 0, assistantMessages: 0, totalMessages: 0 };

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new StatusBarManager();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTracker.showDashboard', () => {
      const panel = DashboardPanel.createOrShow(context.extensionUri);
      updateDashboard(panel);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTracker.refresh', () => {
      resetOffsets();
      resetMessageCounts();
      allEntries = [];
      refreshData();
      vscode.window.showInformationMessage('Claude Tracker: Refreshed usage data.');
    })
  );

  // Set up file system watcher on the Claude log directory
  const config = vscode.workspace.getConfiguration('claudeTracker');
  const customPath = config.get<string>('customLogPath') || '';
  const logDir = getClaudeLogDir(customPath || undefined);

  try {
    const watchPattern = new vscode.RelativePattern(logDir, '**/*.jsonl');
    fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

    fileWatcher.onDidChange(() => refreshData());
    fileWatcher.onDidCreate(() => refreshData());

    context.subscriptions.push(fileWatcher);
  } catch {
    // File watcher setup can fail if directory doesn't exist yet; polling will still work
  }

  // Set up periodic polling
  const refreshRate = config.get<number>('refreshRate') || 10;
  pollInterval = setInterval(() => refreshData(), refreshRate * 1000);

  context.subscriptions.push({
    dispose: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    },
  });

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeTracker.refreshRate')) {
        const newRate = vscode.workspace.getConfiguration('claudeTracker').get<number>('refreshRate') || 10;
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        pollInterval = setInterval(() => refreshData(), newRate * 1000);
      }
    })
  );

  // Auto-detect plan type from credentials
  detectedPlanType = detectPlanType();
  const previousPlan = context.globalState.get<string>('detectedPlanType');
  if (detectedPlanType && detectedPlanType !== previousPlan) {
    vscode.window.showInformationMessage(`Claude Tracker: Detected ${detectedPlanType.toUpperCase()} plan.`);
    context.globalState.update('detectedPlanType', detectedPlanType);
  }

  // Initial data load
  refreshData();
}

function getEffectivePlanType(): string {
  const config = vscode.workspace.getConfiguration('claudeTracker');
  const configured = config.get<string>('planType') || 'auto';
  if (configured !== 'auto') {
    return configured;
  }
  return detectedPlanType || 'pro';
}

function refreshData(): void {
  const config = vscode.workspace.getConfiguration('claudeTracker');
  const customPath = config.get<string>('customLogPath') || '';
  const planType = getEffectivePlanType();

  const logDir = getClaudeLogDir(customPath || undefined);
  // Use 7-day window for file discovery to match the dashboard chart range
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const logFiles = discoverLogFiles(logDir, sevenDaysMs);
  const newEntries = parseNewEntries(logFiles);

  // Merge new entries, avoiding duplicates by timestamp+model
  if (newEntries.length > 0) {
    allEntries.push(...newEntries);
  }

  // Count all-time messages (scans all files, not just 24h)
  const allLogFiles = discoverLogFiles(logDir, Infinity);
  lifetimeMessages = countMessages(allLogFiles);

  const aggregated = aggregateWindow(allEntries);
  statusBar.update(aggregated, planType, lifetimeMessages);

  // Update dashboard if it's open
  if (DashboardPanel.currentPanel) {
    updateDashboard(DashboardPanel.currentPanel);
  }
}

function updateDashboard(panel: DashboardPanel): void {
  const planType = getEffectivePlanType();

  const aggregated = aggregateWindow(allEntries);
  const dailyUsage = computeDailyUsage(allEntries);

  panel.update(aggregated, dailyUsage, planType, lifetimeMessages);
}

export function deactivate(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
}
