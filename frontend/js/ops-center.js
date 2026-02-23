/**
 * Synapse Live Debug — Operations Center
 * Lint Dashboard · Health Scan · Fix All · History
 *
 * NOT a terminal — a structured operations panel that actually does something:
 *   1. One-click full project scan (ESLint + Stylelint + Ruff on all files)
 *   2. One-click fix-all (auto-fix + before/after comparison)
 *   3. Per-file health breakdown with issue counts
 *   4. Operations history with trend tracking
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _isOpen = false;
  let _isScanning = false;
  let _isFixing = false;
  let _lastScan = null;        // last scan result
  let _opsHistory = [];        // operations history
  let _currentView = 'dashboard'; // eslint-disable-line no-unused-vars -- tracked for future view switching

  // ── Public API ─────────────────────────────────────────────────────────────
  const OpsCenter = window.OpsCenter = {
    toggle: togglePanel,
    open: openPanel,
    close: closePanel,
    scan: runScan,
    fixAll: runFixAll,
    isOpen () { return _isOpen; },
    showSmartFixResult,
  };

  window.SynapseApp = window.SynapseApp || { tabs: {} };
  SynapseApp.ops = OpsCenter;

  // Also expose as CommandRunner for backward compat with canvas-sse.js integration
  window.CommandRunner = {
    toggle: togglePanel,
    open: openPanel,
    close: closePanel,
    showOutput (title, text, type) {
      showSmartFixResult(title, text, type);
    },
  };

  // ── Panel Toggle ───────────────────────────────────────────────────────────

  function togglePanel() {
    _isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    const panel = _getPanel();
    if (!panel) return;
    _isOpen = true;
    panel.classList.add('ops-open');
    panel.style.display = 'flex';
    _updateToggleBtn(true);
    // Auto-scan on first open if no data
    if (!_lastScan) runScan();
  }

  function closePanel() {
    const panel = _getPanel();
    if (!panel) return;
    _isOpen = false;
    panel.classList.remove('ops-open');
    panel.style.display = 'none';
    _updateToggleBtn(false);
  }

  function _getPanel() { return document.getElementById('opsCenterPanel'); }

  function _updateToggleBtn(active) {
    const btn = document.getElementById('opsToggleBtn');
    if (btn) {
      btn.classList.toggle('ops-btn-active', active);
      btn.setAttribute('data-tooltip', active ? 'Close Operations Center' : 'Operations Center');
    }
  }

  // ── View Switching ─────────────────────────────────────────────────────────

  function switchView(view) {
    _currentView = view;
    ['dashboard', 'files', 'history'].forEach((v) => {
      const el = document.getElementById(`opsView_${  v}`);
      const tab = document.querySelector(`.ops-view-tab[data-view="${  v  }"]`);
      if (el) el.style.display = v === view ? 'block' : 'none';
      if (tab) tab.classList.toggle('ops-view-tab-active', v === view);
    });
  }
  OpsCenter.switchView = switchView;

  // ── Scan All ───────────────────────────────────────────────────────────────

  function runScan() {
    if (_isScanning) return;
    _isScanning = true;
    _renderScanningState();

    fetch(`${CONFIG.API_BASE  }/v1/ops/scan-all`, { method: 'POST' })
      .then((r) => { return r.json(); })
      .then((data) => {
        _isScanning = false;
        _lastScan = data;
        _renderDashboard(data);
        _renderFilesView(data);
        _loadHistory();
        // Refresh the Architecture Graph so nodes show real linter data
        if (window.SynapseApp && SynapseApp.tabs && SynapseApp.tabs.canvas && typeof SynapseApp.tabs.canvas.loadGraph === 'function') {
          SynapseApp.tabs.canvas.loadGraph();
        }
      })
      .catch((err) => {
        _isScanning = false;
        _renderError(`Scan failed: ${  err.message}`);
      });
  }

  // ── Fix All ────────────────────────────────────────────────────────────────

  function runFixAll() {
    if (_isFixing) return;
    if (_isScanning) {
      // Scan is still running — show a brief toast instead of silently ignoring
      const toast = document.getElementById('opsToast');
      if (toast) {
        toast.innerHTML = `${SynapseIcons.html('hourglass', {size: 14})} Attendi il completamento della scansione...`;
        toast.className = 'ops-toast ops-toast-info ops-toast-show';
        setTimeout(() => { toast.classList.remove('ops-toast-show'); }, 3000);
      }
      return;
    }
    _isFixing = true;
    _renderFixingState();

    fetch(`${CONFIG.API_BASE  }/v1/ops/fix-all`, { method: 'POST' })
      .then((r) => { return r.json(); })
      .then((data) => {
        _isFixing = false;
        _renderFixResult(data);
        // Auto-rescan after fix to refresh dashboard
        setTimeout(runScan, 500);
      })
      .catch((err) => {
        _isFixing = false;
        _renderError(`Fix failed: ${  err.message}`);
      });
  }

  // ── Smart Fix Integration ──────────────────────────────────────────────────

  function showSmartFixResult(title, text, type) {
    // DON'T open the Ops panel — it would auto-scan and hijack the canvas view.
    // Just show a brief toast if the panel happens to be open.
    if (!_isOpen) return;  // panel closed → do nothing, smart-fix result is already shown in the canvas inspector
    const toast = document.getElementById('opsToast');
    if (toast) {
      toast.textContent = title;
      toast.className = `ops-toast ops-toast-${  type || 'info'  } ops-toast-show`;
      setTimeout(() => { toast.classList.remove('ops-toast-show'); }, 4000);
    }
  }

  // ── Render: Dashboard ──────────────────────────────────────────────────────

  function _renderDashboard(data) {
    const el = document.getElementById('opsView_dashboard');
    if (!el) return;

    const scoreColor = data.healthScore >= 80 ? 'var(--accent-green)' :
                     data.healthScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';

    let html = '';

    // ── Health Score Hero ──
    html += '<div class="ops-hero">';
    html += `  <div class="ops-score-ring" style="--score-color:${  scoreColor  }">`;
    html += `    <div class="ops-score-value" style="color:${  scoreColor  }">${  data.healthScore  }</div>`;
    html += '    <div class="ops-score-label">Health Score</div>';
    html += '  </div>';
    html += '  <div class="ops-hero-stats">';
    html += `    <div class="ops-stat"><span class="ops-stat-n">${  data.totalFiles  }</span><span class="ops-stat-l">files scanned</span></div>`;
    html += `    <div class="ops-stat"><span class="ops-stat-n" style="color:var(--accent-green)">${  data.cleanFiles  }</span><span class="ops-stat-l">clean</span></div>`;
    html += `    <div class="ops-stat"><span class="ops-stat-n" style="color:var(--accent-red)">${  data.totalIssues  }</span><span class="ops-stat-l">issues</span></div>`;
    html += `    <div class="ops-stat"><span class="ops-stat-n" style="color:var(--accent-orange)">${  data.fixableIssues  }</span><span class="ops-stat-l">fixable</span></div>`;
    html += '  </div>';
    html += '</div>';

    // ── Linter Cards ──
    html += '<div class="ops-linters-grid">';
    (data.linters || []).forEach((l) => {
      const isClean = l.status === 'clean';
      const borderColor = isClean ? 'var(--accent-green)' : 'var(--accent-red)';
      const icon = { eslint: 'JS', stylelint: 'CSS', ruff: 'PY' }[l.linter] || '?';

      html += `<div class="ops-linter-card" style="border-left:3px solid ${  borderColor  }">`;
      html += '  <div class="ops-lc-header">';
      html += `    <span class="ops-lc-icon">${  icon  }</span>`;
      html += `    <span class="ops-lc-name">${  _esc(l.linter)  }</span>`;
      if (isClean) {
        html += '    <span class="ops-lc-badge ops-lc-clean">CLEAN</span>';
      }
      html += '  </div>';
      html += '  <div class="ops-lc-stats">';
      html += `    <span>${  l.filesScanned  } files</span>`;
      html += `    <span style="color:var(--accent-red)">${  l.totalIssues  } issues</span>`;
      html += `    <span style="color:var(--accent-orange)">${  l.fixableIssues  } fixable</span>`;
      html += '  </div>';
      html += '</div>';
    });
    html += '</div>';

    // ── Action Buttons ──
    html += '<div class="ops-actions">';
    html += '  <button class="ops-action-btn ops-action-scan" onclick="OpsCenter.scan()">';
    html += '    <span class="ops-ab-icon">&#x1F50D;</span> Re-Scan';
    html += '  </button>';
    if (data.fixableIssues > 0) {
      html += '  <button class="ops-action-btn ops-action-fix" onclick="OpsCenter.fixAll()">';
      html += `    <span class="ops-ab-icon">&#x1F6E0;</span> Fix All (${  data.fixableIssues  } fixable)`;
      html += '  </button>';
    }
    html += '</div>';

    // ── Duration ──
    html += `<div class="ops-duration">Scanned in ${  data.duration  }s</div>`;

    el.innerHTML = html;
  }

  // ── Render: Files View ─────────────────────────────────────────────────────

  function _renderFilesView(data) {
    const el = document.getElementById('opsView_files');
    if (!el) return;

    const files = data.files || [];
    if (files.length === 0) {
      el.innerHTML = '<div class="ops-empty">No files scanned yet. Run a scan first.</div>';
      return;
    }

    let html = '<div class="ops-files-table">';
    html += '<div class="ops-ft-header">';
    html += '  <span class="ops-ft-col-file">File</span>';
    html += '  <span class="ops-ft-col-linter">Linter</span>';
    html += '  <span class="ops-ft-col-num">Errors</span>';
    html += '  <span class="ops-ft-col-num">Warns</span>';
    html += '  <span class="ops-ft-col-num">Fixable</span>';
    html += '</div>';

    files.forEach((f) => {
      const rowClass = f.issues === 0 ? 'ops-ft-row-clean' : (f.errors > 0 ? 'ops-ft-row-error' : 'ops-ft-row-warn');
      html += `<div class="ops-ft-row ${  rowClass  }">`;
      html += `  <span class="ops-ft-col-file" title="${  _escAttr(f.file)  }">${  _esc(_shortenPath(f.file))  }</span>`;
      html += `  <span class="ops-ft-col-linter"><span class="ops-ft-lint-badge">${  _esc(f.linter)  }</span></span>`;
      html += `  <span class="ops-ft-col-num">${  f.errors > 0 ? `<span style="color:var(--accent-red)">${  f.errors  }</span>` : '<span style="color:var(--text-dim)">0</span>'  }</span>`;
      html += `  <span class="ops-ft-col-num">${  f.warnings > 0 ? `<span style="color:var(--accent-orange)">${  f.warnings  }</span>` : '<span style="color:var(--text-dim)">0</span>'  }</span>`;
      html += `  <span class="ops-ft-col-num">${  f.fixable > 0 ? `<span style="color:var(--accent-blue)">${  f.fixable  }</span>` : '<span style="color:var(--text-dim)">0</span>'  }</span>`;
      html += '</div>';
      // Top issues preview
      if (f.topIssues && f.topIssues.length > 0) {
        html += '<div class="ops-ft-issues">';
        f.topIssues.forEach((msg) => {
          html += `<div class="ops-ft-issue-line">${  _esc(msg)  }</div>`;
        });
        html += '</div>';
      }
    });

    html += '</div>';
    el.innerHTML = html;
  }

  // ── Render: History View ───────────────────────────────────────────────────

  function _loadHistory() {
    fetch(`${CONFIG.API_BASE  }/v1/ops/history`)
      .then((r) => { return r.json(); })
      .then((data) => {
        _opsHistory = data.history || [];
        _renderHistoryView();
      })
      .catch(() => {});
  }

  function _renderHistoryView() {
    const el = document.getElementById('opsView_history');
    if (!el) return;

    if (_opsHistory.length === 0) {
      el.innerHTML = '<div class="ops-empty">No operations yet. Run a scan to get started.</div>';
      return;
    }

    let html = '<div class="ops-history-list">';
    _opsHistory.forEach((op) => {
      const time = new Date(op.timestamp * 1000).toLocaleTimeString('it-IT', { hour12: false });
      const isScan = op.type === 'scan';
      const icon = isScan ? '&#x1F50D;' : '&#x1F6E0;';
      const label = isScan ? 'Project Scan' : 'Fix All';

      html += '<div class="ops-hist-item">';
      html += `  <span class="ops-hist-icon">${  icon  }</span>`;
      html += '  <div class="ops-hist-body">';
      html += `    <div class="ops-hist-title">${  label  } <span class="ops-hist-time">${  time  }</span></div>`;

      if (isScan) {
        const scoreColor = op.healthScore >= 80 ? 'var(--accent-green)' :
                         op.healthScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
        html += '    <div class="ops-hist-detail">';
        html += `      Score: <strong style="color:${  scoreColor  }">${  op.healthScore  }</strong>`;
        html += `      &middot; ${  op.totalIssues  } issues`;
        html += `      &middot; ${  op.cleanFiles  }/${  op.totalFiles  } clean`;
        html += `      &middot; ${  op.duration  }s`;
        html += '    </div>';
      } else {
        html += '    <div class="ops-hist-detail">';
        html += `      ${  op.totalBefore  } &rarr; ${  op.totalAfter}`;
        html += `      &middot; <strong style="color:var(--accent-green)">${  op.totalFixed  } fixed</strong>`;
        html += `      &middot; ${  op.duration  }s`;
        html += '    </div>';
      }

      html += '  </div>';
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  // ── Render: States ─────────────────────────────────────────────────────────

  function _renderScanningState() {
    const el = document.getElementById('opsView_dashboard');
    if (!el) return;
    el.innerHTML =
      '<div class="ops-loading">' +
      '  <div class="ops-loading-spinner"></div>' +
      '  <div class="ops-loading-text">Scanning project with ESLint, Stylelint, Ruff...</div>' +
      '  <div class="ops-loading-sub">This may take a few seconds</div>' +
      '</div>';
  }

  function _renderFixingState() {
    const el = document.getElementById('opsView_dashboard');
    if (!el) return;
    el.innerHTML =
      '<div class="ops-loading">' +
      '  <div class="ops-loading-spinner"></div>' +
      '  <div class="ops-loading-text">Fixing all auto-fixable issues...</div>' +
      '  <div class="ops-loading-sub">DETECT &rarr; FIX &rarr; VERIFY pipeline running</div>' +
      '</div>';
  }

  function _renderFixResult(data) {
    const el = document.getElementById('opsView_dashboard');
    if (!el) return;

    let html = '<div class="ops-fix-result">';
    html += '<div class="ops-fix-hero">';
    html += `  <span class="ops-fix-big">${  data.totalFixed  }</span>`;
    html += '  <span class="ops-fix-label">issues fixed</span>';
    html += '</div>';
    html += '<div class="ops-fix-summary">';
    html += `  <span>${  data.totalBefore  } before</span>`;
    html += '  <span class="ops-fix-arrow">&rarr;</span>';
    html += `  <span>${  data.totalAfter  } after</span>`;
    html += `  <span class="ops-fix-duration">${  data.duration  }s</span>`;
    html += '</div>';

    // Per-linter breakdown
    html += '<div class="ops-fix-linters">';
    (data.linters || []).forEach((l) => {
      html += '<div class="ops-fix-lint-row">';
      html += `  <span class="ops-fll-name">${  _esc(l.linter)  }</span>`;
      html += `  <span class="ops-fll-count">${  l.beforeIssues  } &rarr; ${  l.afterIssues  }</span>`;
      if (l.fixedCount > 0) {
        html += `  <span class="ops-fll-fixed">-${  l.fixedCount  }</span>`;
      }
      if (l.fixErrors > 0) {
        html += `  <span style="color:var(--accent-red);font-size:0.68rem;margin-left:6px">${  l.fixErrors  } fails</span>`;
      }
      html += '</div>';
    });
    html += '</div>';

    // Show fix errors if any
    if (data.errors && data.errors.length > 0) {
      html += '<div style="margin-top:12px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto">';
      html += `<div style="font-size:0.7rem;font-weight:600;color:var(--accent-red);margin-bottom:4px">Fix errors (${  data.errors.length  }):</div>`;
      data.errors.slice(0, 5).forEach((e) => {
        html += '<div style="font-size:0.65rem;color:var(--text-dim);padding:2px 0">';
        html += `  <span style="color:var(--text-secondary)">${  _esc(e.file)  }</span> `;
        html += `  <span style="color:var(--accent-red)">${  _esc(e.error)  }</span>`;
        html += '</div>';
      });
      if (data.errors.length > 5) {
        html += `<div style="font-size:0.62rem;color:var(--text-dim)">...and ${  data.errors.length - 5  } more</div>`;
      }
      html += '</div>';
    }

    html += '<div class="ops-loading-sub" style="margin-top:12px">Re-scanning in a moment...</div>';
    html += '</div>';
    el.innerHTML = html;
  }

  function _renderError(msg) {
    const el = document.getElementById('opsView_dashboard');
    if (el) {
      el.innerHTML = `<div class="ops-error">${  _esc(msg)  }</div>`;
    }
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _escAttr(s) {
    return _esc(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }
  function _shortenPath(p) {
    // Show last 2 segments: "frontend/js/app.js" or "backend/main.py"
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 2 ? parts.slice(-3).join('/') : p;
  }

  // ── Keyboard Shortcut ─────────────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      togglePanel();
    }
  });

})();
