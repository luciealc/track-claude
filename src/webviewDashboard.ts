import * as vscode from 'vscode';
import { AggregatedUsage, DailyUsage, PLAN_LIMITS, WINDOW_MS } from './types';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri): DashboardPanel {
    const column = vscode.ViewColumn.Beside;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'claudeTrackerDashboard',
      'Claude Activity Dashboard',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel);
    return DashboardPanel.currentPanel;
  }

  update(aggregated: AggregatedUsage, dailyUsage: DailyUsage[], planType: string): void {
    const limit = PLAN_LIMITS[planType] || PLAN_LIMITS.max;
    this.panel.webview.html = this.getHtml(aggregated, dailyUsage, planType, limit);
  }

  private getHtml(
    aggregated: AggregatedUsage,
    dailyUsage: DailyUsage[],
    planType: string,
    limit: number
  ): string {
    const usagePercent = Math.min((aggregated.totalTokens / limit) * 100, 100);
    const modelData = Array.from(aggregated.modelBreakdown.entries()).map(([model, tokens]) => ({
      model: this.formatModelName(model),
      tokens,
    }));

    const resetAt = new Date(aggregated.windowStart.getTime() + WINDOW_MS);

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Activity Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-focusBorder);
      --green: #4caf50;
      --yellow: #ff9800;
      --red: #f44336;
      --blue: #2196f3;
      --purple: #9c27b0;
      --cyan: #00bcd4;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      background: var(--bg);
      color: var(--fg);
      padding: 20px;
    }

    h1 {
      font-size: 1.4em;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    .card {
      background: var(--vscode-sideBar-background, #1e1e1e);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
    }

    .card h2 {
      font-size: 1em;
      margin-bottom: 12px;
      opacity: 0.8;
    }

    .usage-meter {
      grid-column: 1 / -1;
    }

    .meter-bar {
      width: 100%;
      height: 24px;
      background: var(--vscode-input-background, #333);
      border-radius: 12px;
      overflow: hidden;
      margin: 8px 0;
    }

    .meter-fill {
      height: 100%;
      border-radius: 12px;
      transition: width 0.3s ease;
    }

    .meter-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.85em;
      opacity: 0.7;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .stat {
      padding: 8px;
      background: var(--vscode-input-background, #2a2a2a);
      border-radius: 4px;
    }

    .stat-value {
      font-size: 1.3em;
      font-weight: bold;
    }

    .stat-label {
      font-size: 0.8em;
      opacity: 0.6;
    }

    .chart-container {
      position: relative;
      width: 100%;
      height: 200px;
    }

    .bar-chart {
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      height: 160px;
      padding: 0 4px;
      border-bottom: 1px solid var(--border);
    }

    .bar-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
      margin: 0 2px;
    }

    .bar-stack {
      display: flex;
      flex-direction: column-reverse;
      width: 100%;
      max-width: 40px;
    }

    .bar-segment {
      min-height: 1px;
      width: 100%;
      border-radius: 2px 2px 0 0;
    }

    .bar-label {
      font-size: 0.7em;
      margin-top: 4px;
      opacity: 0.7;
    }

    .pie-container {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .pie-chart {
      width: 120px;
      height: 120px;
    }

    .pie-legend {
      flex: 1;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 0.85em;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .countdown {
      font-size: 2em;
      font-weight: bold;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .countdown-label {
      text-align: center;
      opacity: 0.6;
      font-size: 0.85em;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <h1>Claude Code Activity Dashboard</h1>

  <div class="grid">
    <div class="card usage-meter">
      <h2>Token Usage (5-Hour Window) &mdash; ${planType.toUpperCase()} Plan</h2>
      <div class="meter-bar">
        <div class="meter-fill" style="width: ${usagePercent}%; background: ${this.getColor(usagePercent)};"></div>
      </div>
      <div class="meter-label">
        <span>${this.formatTokens(aggregated.totalTokens)} used</span>
        <span>${usagePercent.toFixed(1)}%</span>
        <span>${this.formatTokens(limit)} limit</span>
      </div>
    </div>

    <div class="card">
      <h2>Current Window Breakdown</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-value">${this.formatTokens(aggregated.totalInputTokens)}</div>
          <div class="stat-label">Input Tokens</div>
        </div>
        <div class="stat">
          <div class="stat-value">${this.formatTokens(aggregated.totalOutputTokens)}</div>
          <div class="stat-label">Output Tokens</div>
        </div>
        <div class="stat">
          <div class="stat-value">${this.formatTokens(aggregated.totalCacheCreationTokens)}</div>
          <div class="stat-label">Cache Creation</div>
        </div>
        <div class="stat">
          <div class="stat-value">${this.formatTokens(aggregated.totalCacheReadTokens)}</div>
          <div class="stat-label">Cache Read</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Window Reset Countdown</h2>
      <div class="countdown" id="countdown">--:--:--</div>
      <div class="countdown-label">Time until oldest tokens expire</div>
    </div>

    <div class="card" style="grid-column: 1 / -1;">
      <h2>Usage Over Last 7 Days</h2>
      <div class="chart-container">
        <div class="bar-chart">
          ${dailyUsage.map(d => this.renderBarGroup(d, dailyUsage)).join('')}
        </div>
      </div>
      <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 0.8em;">
        <span><span style="color: var(--blue);">&block;</span> Input</span>
        <span><span style="color: var(--green);">&block;</span> Output</span>
        <span><span style="color: var(--purple);">&block;</span> Cache</span>
      </div>
    </div>

    <div class="card">
      <h2>Model Distribution (Current Window)</h2>
      <div class="pie-container">
        ${modelData.length > 0 ? this.renderPie(modelData) : '<div style="opacity: 0.5;">No data yet</div>'}
      </div>
    </div>

    <div class="card">
      <h2>Session Info</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-value">${aggregated.entries.length}</div>
          <div class="stat-label">API Calls (Window)</div>
        </div>
        <div class="stat">
          <div class="stat-value">${aggregated.modelBreakdown.size}</div>
          <div class="stat-label">Models Used</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const resetTime = ${resetAt.getTime()};

    function updateCountdown() {
      const now = Date.now();
      const diff = resetTime - now;

      if (diff <= 0) {
        document.getElementById('countdown').textContent = '00:00:00';
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      document.getElementById('countdown').textContent =
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
  </script>
</body>
</html>`;
  }

  private renderBarGroup(day: DailyUsage, allDays: DailyUsage[]): string {
    const maxTotal = Math.max(...allDays.map(d => d.totalTokens), 1);
    const scale = 140; // max bar height in px
    const inputH = (day.inputTokens / maxTotal) * scale;
    const outputH = (day.outputTokens / maxTotal) * scale;
    const cacheH = (day.cacheTokens / maxTotal) * scale;
    const label = day.date.slice(5); // MM-DD

    return `
      <div class="bar-group">
        <div class="bar-stack">
          <div class="bar-segment" style="height: ${inputH}px; background: var(--blue);"></div>
          <div class="bar-segment" style="height: ${outputH}px; background: var(--green);"></div>
          <div class="bar-segment" style="height: ${cacheH}px; background: var(--purple);"></div>
        </div>
        <div class="bar-label">${label}</div>
      </div>`;
  }

  private renderPie(modelData: { model: string; tokens: number }[]): string {
    const colors = ['var(--blue)', 'var(--green)', 'var(--purple)', 'var(--cyan)', 'var(--yellow)', 'var(--red)'];
    const total = modelData.reduce((sum, d) => sum + d.tokens, 0);

    let cumulativePercent = 0;
    const gradientStops: string[] = [];

    modelData.forEach((d, i) => {
      const percent = (d.tokens / total) * 100;
      const color = colors[i % colors.length];
      gradientStops.push(`${color} ${cumulativePercent}% ${cumulativePercent + percent}%`);
      cumulativePercent += percent;
    });

    const legendItems = modelData.map((d, i) => {
      const percent = ((d.tokens / total) * 100).toFixed(1);
      const color = colors[i % colors.length];
      return `<div class="legend-item">
        <div class="legend-dot" style="background: ${color};"></div>
        <span>${d.model} (${percent}%)</span>
      </div>`;
    }).join('');

    return `
      <div class="pie-chart" style="border-radius: 50%; background: conic-gradient(${gradientStops.join(', ')});"></div>
      <div class="pie-legend">${legendItems}</div>`;
  }

  private formatTokens(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  }

  private formatModelName(model: string): string {
    if (model.includes('opus')) { return 'Opus'; }
    if (model.includes('sonnet')) { return 'Sonnet'; }
    if (model.includes('haiku')) { return 'Haiku'; }
    return model;
  }

  private getColor(percent: number): string {
    if (percent >= 85) { return 'var(--red)'; }
    if (percent >= 60) { return 'var(--yellow)'; }
    return 'var(--green)';
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}
