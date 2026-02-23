/**
 * Live Debug -- Tab 2: Services Health RADAR
 * Full diagnostics: latency, error counting, anomaly alerts, body validation.
 * Zero hardcoded services -- everything comes from /v1/services/diagnostics.
 */
(function () {
  'use strict';

  let _prevHealth = {};
  let _lastDiag = null;     // Last diagnostics response
  let _scanning = false;

  SynapseApp.tabs.services = {
    render: fullScan,
    refresh: fullScan,
    checkAll: fullScan,
    testEndpoint,
    get lastDiagnostics() { return _lastDiag; },
  };

  // -- Full RADAR Scan -------------------------------------------------------

  async function fullScan() {
    const grid = document.getElementById('serviceGrid');
    const statusEl = document.getElementById('serviceRadarStatus');
    if (!grid) return;
    if (_scanning) return;
    _scanning = true;

    // Show scanning state
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-blue);">RADAR scanning...</span>';
    grid.innerHTML = '<div style="color:var(--accent-blue);padding:var(--space-xl);text-align:center;">Probing all endpoints...</div>';

    try {
      const r = await fetch(`${CONFIG.API_BASE}/v1/services/diagnostics`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      _lastDiag = data;

      if (!data.services || data.services.length === 0) {
        grid.innerHTML = '<div style="color:var(--accent-yellow);padding:var(--space-xl);text-align:center;">No services discovered.</div>';
        if (statusEl) statusEl.textContent = '';
        return;
      }

      renderSummary(statusEl, data.summary);
      renderDiagGrid(grid, data.services);
      emitHealthEvents(data.services);

    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[services-health] Diagnostics scan failed:', err.message);
      grid.innerHTML = '<div style="color:var(--text-tertiary);padding:var(--space-xl);text-align:center;">Backend offline -- waiting for connection to discover services...</div>';
      if (statusEl) statusEl.textContent = '';
    } finally {
      _scanning = false;
    }
  }

  // -- Summary Banner ---------------------------------------------------------

  function renderSummary(el, s) {
    if (!el || !s) return;
    const parts = [];
    parts.push(`<strong>${  s.total  }</strong> services`);
    if (s.healthy > 0) parts.push(`<span style="color:var(--accent-green);">${  s.healthy  } healthy</span>`);
    if (s.degraded > 0) parts.push(`<span style="color:var(--accent-yellow);">${  s.degraded  } degraded</span>`);
    if (s.offline > 0) parts.push(`<span style="color:var(--accent-red);">${  s.offline  } offline</span>`);
    if (s.noTest > 0) parts.push(`<span style="color:var(--text-tertiary);">${  s.noTest  } no-test</span>`);
    if (s.avgLatencyMs != null) parts.push(`avg ${  s.avgLatencyMs  }ms`);
    if (s.totalAnomalies > 0) parts.push(`<span style="color:var(--accent-yellow);">${  s.totalAnomalies  } anomalies</span>`);
    el.innerHTML = parts.join(' &middot; ');
  }

  // -- Diagnostic Grid --------------------------------------------------------

  function renderDiagGrid(grid, services) {
    grid.innerHTML = services.map((s) => {
      const srcLabel = (s.sourceFiles || []).join(', ') || 'unknown';
      const statusClass = s.status || 'unknown';
      const hasAnomalies = s.anomalies && s.anomalies.length > 0;
      const probes = s.probes || [];

      // Service-level latency badge (max across probes)
      let latencyHtml = '';
      if (s.latencyMs != null) {
        const lColor = s.latencyMs > 2000 ? 'var(--accent-red)'
                   : s.latencyMs > 500  ? 'var(--accent-yellow)'
                   :                       'var(--text-tertiary)';
        latencyHtml = `<span style="font-size:0.68rem;color:${  lColor  };margin-left:auto;">${  s.latencyMs  }ms max</span>`;
      }

      // Probe count badge
      let probeCountHtml = '';
      if (probes.length > 0) {
        const okCount = probes.filter((p) => { return p.status === 'healthy'; }).length;
        const pcColor = okCount === probes.length ? 'var(--accent-green)' : 'var(--accent-yellow)';
        probeCountHtml = `<span style="font-size:0.65rem;color:${  pcColor  };">${  okCount  }/${  probes.length  } probes OK</span>`;
      }

      // Per-endpoint probes detail
      let probesHtml = '';
      if (probes.length > 0) {
        probesHtml = '<div style="margin-top:var(--space-xs);border-top:1px solid var(--border-subtle);padding-top:var(--space-xs);">';
        for (let pi = 0; pi < probes.length; pi++) {
          const p = probes[pi];
          // Status dot
          const dotColor = p.status === 'healthy' ? 'var(--accent-green)'
                       : p.status === 'degraded' ? 'var(--accent-yellow)'
                       : p.status === 'offline'  ? 'var(--accent-red)'
                       :                            'var(--text-tertiary)';
          // Latency
          const pLatency = p.latencyMs != null ? `${p.latencyMs  }ms` : '--';
          const pLatColor = (p.latencyMs || 0) > 2000 ? 'var(--accent-red)'
                        : (p.latencyMs || 0) > 500  ? 'var(--accent-yellow)'
                        :                              'var(--text-tertiary)';
          // HTTP badge
          let pHttp = '';
          if (p.httpStatus != null) {
            const hColor = p.httpStatus >= 400 ? 'var(--accent-red)'
                       : p.httpStatus >= 300 ? 'var(--accent-yellow)'
                       :                        'var(--accent-green)';
            pHttp = `<span style="font-size:0.6rem;padding:0 3px;border-radius:2px;background:${  hColor  }20;color:${  hColor  };">${  p.httpStatus  }</span>`;
          }
          // Body badge
          let pBody = '';
          if (p.bodyValid === true) pBody = '<span style="font-size:0.6rem;color:var(--accent-green);">JSON</span>';
          else if (p.bodyValid === false) pBody = '<span style="font-size:0.6rem;color:var(--accent-yellow);">!JSON</span>';
          // Size
          let pSize = '';
          if (p.bodySize != null) {
            pSize = `<span style="font-size:0.6rem;color:var(--text-tertiary);">${  formatBytes(p.bodySize)  }</span>`;
          }
          // Anomalies for this probe
          let pAnom = '';
          if (p.anomalies && p.anomalies.length > 0) {
            pAnom = p.anomalies.map((a) => {
              return `<div style="font-size:0.6rem;color:var(--accent-yellow);padding-left:16px;">${  escHtml(a)  }</div>`;
            }).join('');
          }

          probesHtml += `<div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:0.65rem;">`
            + `<span style="width:6px;height:6px;border-radius:50%;background:${  dotColor  };flex-shrink:0;"></span>`
            + `<span style="color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${  escHtml(p.path)  }">${  escHtml(p.path)  }</span>${
             pHttp  } `
            + `<span style="color:${  pLatColor  };">${  pLatency  }</span> ${
             pBody  } ${  pSize
             }</div>${
             pAnom}`;
        }
        probesHtml += '</div>';
      }

      // Service-level anomalies (only those NOT already shown in probes)
      let anomalyHtml = '';
      if (hasAnomalies && probes.length === 0) {
        // Show anomalies only if no probes (no-test case)
        anomalyHtml = `<div class="svc-anomalies">${
           s.anomalies.map((a) => { return `<div class="svc-anomaly-item">${  escHtml(a)  }</div>`; }).join('')
           }</div>`;
      }

      // Recent errors
      let errorsHtml = '';
      if (s.recentErrors && s.recentErrors.length > 0) {
        errorsHtml = `<div class="svc-recent-errors">`
          + `<div style="font-size:0.65rem;color:var(--accent-red);font-weight:600;margin-bottom:2px;">Recent errors:</div>${
           s.recentErrors.map((e) => { return `<div style="font-size:0.62rem;color:var(--text-tertiary);">${  e.ts  } - HTTP ${  e.status  } ${  escHtml(e.msg.substring(0, 80))  }</div>`; }).join('')
           }</div>`;
      }

      const cardClass = statusClass === 'healthy' ? 'healthy' : (statusClass === 'degraded' || statusClass === 'offline') ? 'error' : '';

      return `<div class="service-card ${  cardClass  }" id="svc-${  s.id  }">`
        + `<div class="service-card-header">`
          + `<div style="flex:1;min-width:0;">`
            + `<div class="service-card-name" style="display:flex;align-items:center;gap:var(--space-xs);">${
               escHtml(s.name)
               }${latencyHtml
             }</div>`
            + `<div class="service-card-file">${  escHtml(srcLabel)  }</div>`
          + `</div>`
          + `<div class="service-status ${  statusClass  }" id="svc-dot-${  s.id  }"></div>`
        + `</div>`
        + `<div style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap;">${
           probeCountHtml
           } <span style="font-size:0.65rem;color:var(--text-tertiary);">${  s.endpointCount  } endpoint${  s.endpointCount !== 1 ? 's' : ''  }</span>`
        + `</div>${
         probesHtml
         }${anomalyHtml
         }${errorsHtml
         }<div style="margin-top:var(--space-sm);display:flex;gap:var(--space-xs);">${
           s.testPath
            ? `<button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.services.testEndpoint('${  s.id  }')">Test</button>`
            : '<span style="font-size:0.7rem;color:var(--text-tertiary);">No GET endpoint</span>'
         }</div>`
        + `<div class="service-card-result" id="svc-result-${  s.id  }" style="display:none;"></div>`
      + `</div>`;
    }).join('');
  }

  // -- Health Events ----------------------------------------------------------

  function emitHealthEvents(services) {
    const healthMap = {};
    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      const ok = s.status === 'healthy';
      healthMap[s.id] = ok;

      if (_prevHealth[s.id] === true && !ok) {
        SynapseBus.emit('alert:offline', { service: s.name, message: `Status: ${  s.status}` });
      } else if (_prevHealth[s.id] === false && ok) {
        SynapseBus.emit('alert:back-online', { service: s.name });
      }
    }
    _prevHealth = healthMap;
    SynapseBus.emit('service:health', healthMap);
  }

  // -- Individual Test --------------------------------------------------------

  async function testEndpoint(id) {
    const svc = (_lastDiag && _lastDiag.services || []).find((s) => { return s.id === id; });
    if (!svc || !svc.testPath) return;
    const resultEl = document.getElementById(`svc-result-${  id}`);
    if (!resultEl) return;

    resultEl.style.display = 'block';
    resultEl.innerHTML = '<span style="color:var(--accent-blue);">Testing...</span>';

    const testUrl = CONFIG.API_BASE + svc.testPath;
    try {
      const start = performance.now();
      const r = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
      const elapsed = Math.round(performance.now() - start);
      const body = await r.text().catch(() => { return ''; });
      const ok = r.ok;
      resultEl.innerHTML = `<div style="color:${  ok ? 'var(--accent-green)' : 'var(--accent-red)'  };">`
        + `HTTP ${  r.status  } -- ${  elapsed  }ms -- ${  formatBytes(body.length)
         }</div>`
        + `<pre>${  escHtml(body.substring(0, 500))  }</pre>`;
    } catch (err) {
      resultEl.innerHTML = `<div style="color:var(--accent-red);">${  escHtml(err.message)  }</div>`;
    }
  }

  // -- Helpers ----------------------------------------------------------------

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatBytes(n) {
    if (n > 1024) return `${(n / 1024).toFixed(1)  }KB`;
    return `${n  }B`;
  }
})();
