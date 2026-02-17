import * as vscode from 'vscode';
import * as path from 'path';
import { getClaudeLogDir, discoverLogFiles } from './logDiscovery';
import { parseNewEntries, aggregateWindow, computeDailyUsage, resetOffsets } from './tokenAggregator';
import { StatusBarManager } from './statusBar';
import { DashboardPanel } from './webviewDashboard';
import { UsageEntry } from './types';

let statusBar: StatusBarManager;
let pollInterval: ReturnType<typeof setInterval> | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let allEntries: UsageEntry[] = [];

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

  // Initial data load
  refreshData();
}

function refreshData(): void {
  const config = vscode.workspace.getConfiguration('claudeTracker');
  const customPath = config.get<string>('customLogPath') || '';
  const planType = config.get<string>('planType') || 'max';

  const logDir = getClaudeLogDir(customPath || undefined);
  const logFiles = discoverLogFiles(logDir);
  const newEntries = parseNewEntries(logFiles);

  // Merge new entries, avoiding duplicates by timestamp+model
  if (newEntries.length > 0) {
    allEntries.push(...newEntries);
  }

  const aggregated = aggregateWindow(allEntries);
  statusBar.update(aggregated, planType);

  // Update dashboard if it's open
  if (DashboardPanel.currentPanel) {
    updateDashboard(DashboardPanel.currentPanel);
  }
}

function updateDashboard(panel: DashboardPanel): void {
  const config = vscode.workspace.getConfiguration('claudeTracker');
  const planType = config.get<string>('planType') || 'max';

  const aggregated = aggregateWindow(allEntries);
  const dailyUsage = computeDailyUsage(allEntries);

  panel.update(aggregated, dailyUsage, planType);
}

export function deactivate(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
}
