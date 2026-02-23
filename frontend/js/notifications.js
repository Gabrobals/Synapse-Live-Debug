/**
 * Live Debug — Notifications System
 * Persistent notification center with deduplication, per-item dismiss, group
 * clear, toast bar auto-fade, audio beeps, desktop & voice TTS.
 */

const Notifications = {
  /** Persistent alert store — never auto-dismissed, user controls lifetime. */
  alerts: [],
  alertIdSeq: 0,
  /** Toast queue — lightweight toasts that auto-fade from the top bar. */
  _toasts: [],
  _toastTimer: null,
  /** Deduplication map: key → { id, count, lastTime } */
  _dedup: new Map(),
  _DEDUP_WINDOW: 60000,  // merge same alert within 60 s
  _MAX_ALERTS: 100,       // cap stored notifications

  desktopEnabled: false,
  soundEnabled: true,
  voiceEnabled: false,
  audioCtx: null,
  centerOpen: false,

  init() {
    // Wire bus events
    SynapseBus.on('alert:offline', (d) => {
      this.addAlert('error', `SERVICE OFFLINE: ${d.service || d.name || 'Unknown'}`, d.service);
      this.playBeep('critical');
      this.sendDesktop('Service Offline', `${d.service || d.name} is unreachable`);
    });

    SynapseBus.on('alert:back-online', (d) => {
      this.addAlert('success', `SERVICE RESTORED: ${d.service || d.name || 'Unknown'}`, d.service);
      this.playBeep('resolved');
      this.sendDesktop('Service Restored', `${d.service || d.name} is back online`);
    });

    SynapseBus.on('live:error', (d) => {
      this.addAlert('warning', `Error in ${d.component}: ${(d.message || '').substring(0, 80)}`);
      this.playBeep('warning');
    });
  },

  /* ───────────────────── Core API ───────────────────── */

  /**
   * Add a persistent notification.
   * - Deduplicates: if the same level+message fired within _DEDUP_WINDOW, updates count.
   * - Never auto-dismissed — stays in center until user clears it.
   * - Also pushes a lightweight toast for the alert bar (auto-fades in 8 s).
   */
  addAlert(level, message, target) {
    // ── Deduplication ──
    const dedupKey = `${level}||${message}`;
    const now = Date.now();
    const prev = this._dedup.get(dedupKey);
    if (prev && (now - prev.lastTime) < this._DEDUP_WINDOW) {
      // Update existing alert's count and time instead of adding new one
      const existing = this.alerts.find(a => a.id === prev.id);
      if (existing) {
        existing.count = (existing.count || 1) + 1;
        existing.time = now;
        prev.lastTime = now;
        this.updateBadge();
        if (this.centerOpen) this.renderCenter();
        return existing.id;
      }
    }

    // ── New alert ──
    const id = ++this.alertIdSeq;
    const alert = { id, level, message, target, time: now, count: 1 };
    this.alerts.unshift(alert);
    this._dedup.set(dedupKey, { id, lastTime: now });

    // Cap max stored notifications (drop oldest)
    while (this.alerts.length > this._MAX_ALERTS) {
      const dropped = this.alerts.pop();
      // clean dedup entry for dropped alert
      for (const [k, v] of this._dedup.entries()) {
        if (v.id === dropped.id) { this._dedup.delete(k); break; }
      }
    }

    this.updateBadge();
    if (this.centerOpen) this.renderCenter();

    // Push a toast (auto-fading visual in alert bar)
    this._pushToast(alert);
    return id;
  },

  /** Dismiss a single notification by id. */
  dismissAlert(id) {
    this.alerts = this.alerts.filter(a => a.id !== id);
    // Remove from dedup map
    for (const [k, v] of this._dedup.entries()) {
      if (v.id === id) { this._dedup.delete(k); break; }
    }
    this.updateBadge();
    if (this.centerOpen) this.renderCenter();
  },

  /** Clear all notifications. */
  clearAllAlerts() {
    this.alerts = [];
    this.alertIdSeq = 0;
    this._dedup.clear();
    this.updateBadge();
    this.renderCenter();
  },

  /** Clear all notifications of a specific level (group clear). */
  clearByLevel(level) {
    const removed = new Set(this.alerts.filter(a => a.level === level).map(a => a.id));
    this.alerts = this.alerts.filter(a => a.level !== level);
    for (const [k, v] of this._dedup.entries()) {
      if (removed.has(v.id)) this._dedup.delete(k);
    }
    this.updateBadge();
    if (this.centerOpen) this.renderCenter();
  },

  /* ──────────────── Toast bar (auto-fade) ─────────────── */

  /** Push a lightweight toast into the top alert bar. Auto-fades after 8 s. */
  _pushToast(alert) {
    this._toasts.push({ ...alert, _fadeAt: Date.now() + 8000 });
    // Keep max 5 visible toasts
    while (this._toasts.length > 5) this._toasts.shift();
    this._renderToastBar();
    // Schedule fade check
    if (!this._toastTimer) {
      this._toastTimer = setInterval(() => {
        const now2 = Date.now();
        this._toasts = this._toasts.filter(t => now2 < t._fadeAt);
        this._renderToastBar();
        if (this._toasts.length === 0) {
          clearInterval(this._toastTimer);
          this._toastTimer = null;
        }
      }, 1000);
    }
  },

  _renderToastBar() {
    const bar = document.getElementById('alertBar');
    if (!bar) return;
    if (this._toasts.length === 0) { bar.innerHTML = ''; return; }
    bar.innerHTML = this._toasts.map(a => {
      const time = new Date(a.time).toLocaleTimeString();
      const countBadge = (a.count && a.count > 1) ? ` <span style="opacity:0.7;font-size:0.7rem;">×${a.count}</span>` : '';
      return `<div class="alert-toast ${a.level}" style="position:relative;padding-right:24px;">
        <span>${this._escHtml(a.message)}${countBadge}${a.target ? ` <span style="opacity:0.7;font-size:0.7rem;">[${a.target}]</span>` : ''}</span>
        <span style="font-size:0.7rem;opacity:0.6;">${time}</span>
        <button onclick="Notifications.dismissAlert(${a.id});Notifications._removeToast(${a.id});" style="
          position:absolute;top:2px;right:4px;
          background:none;border:none;color:var(--text-dim);cursor:pointer;
          font-size:0.85rem;line-height:1;padding:2px 4px;opacity:0.7;
          " title="Dismiss">✕</button>
      </div>`;
    }).join('');
  },

  _removeToast(id) {
    this._toasts = this._toasts.filter(t => t.id !== id);
    this._renderToastBar();
  },

  /* ──────────────── Notification Center Panel ─────────────── */

  toggleCenter() {
    this.centerOpen = !this.centerOpen;
    const panel = document.getElementById('notifCenterPanel');
    if (!panel) return;
    if (this.centerOpen) {
      panel.style.display = 'flex';
      this.renderCenter();
      setTimeout(() => {
        document.addEventListener('click', this._outsideClick);
      }, 10);
    } else {
      panel.style.display = 'none';
      document.removeEventListener('click', this._outsideClick);
    }
  },

  _outsideClick(e) {
    const panel = document.getElementById('notifCenterPanel');
    const bell = document.getElementById('notifCenterBell');
    if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
      Notifications.centerOpen = false;
      panel.style.display = 'none';
      document.removeEventListener('click', Notifications._outsideClick);
    }
  },

  updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const count = this.alerts.length;
    if (count === 0) {
      badge.style.display = 'none';
    } else {
      badge.style.display = '';
      badge.textContent = count > 99 ? '99+' : count;
    }
  },

  renderCenter() {
    const body = document.getElementById('notifCenterBody');
    if (!body) return;

    if (this.alerts.length === 0) {
      body.innerHTML = '<div class="notif-center-empty">Nessuna notifica</div>';
      return;
    }

    const groups = { error: [], critical: [], warning: [], info: [], success: [], resolved: [] };
    const sorted = [...this.alerts].sort((a, b) => b.time - a.time);
    sorted.forEach(a => {
      const g = groups[a.level] || groups.info;
      g.push(a);
    });

    const levelMeta = {
      critical: { label: 'Critical', icon: '!!', dot: 'var(--accent-red)' },
      error:    { label: 'Errors',   icon: '!',  dot: 'var(--accent-red)' },
      warning:  { label: 'Warnings', icon: '~',  dot: 'var(--accent-orange)' },
      info:     { label: 'Info',     icon: 'i',  dot: 'var(--accent-blue)' },
      success:  { label: 'Success',  icon: '✓',  dot: 'var(--accent-green)' },
      resolved: { label: 'Resolved', icon: '✓',  dot: 'var(--accent-green)' }
    };

    const order = ['critical', 'error', 'warning', 'info', 'success', 'resolved'];
    let html = '';

    for (const lvl of order) {
      const items = groups[lvl];
      if (!items || items.length === 0) continue;
      const meta = levelMeta[lvl];
      html += `<div class="notif-center-group">
        <div class="notif-center-group-header">
          <span class="notif-center-group-dot" style="background:${meta.dot};"></span>
          ${meta.label} (${items.length})
          <button class="notif-center-group-clear" onclick="event.stopPropagation();Notifications.clearByLevel('${lvl}');" title="Clear ${meta.label}">✕</button>
        </div>`;
      for (const a of items) {
        const time = new Date(a.time).toLocaleTimeString();
        const countBadge = (a.count && a.count > 1) ? `<span class="notif-center-count">×${a.count}</span>` : '';
        const targetHtml = a.target
          ? `<span class="notif-center-target" onclick="event.stopPropagation();Notifications.navigateToTarget('${(a.target || '').replace(/'/g, "\\'")}')">${a.target}</span>`
          : '';
        const cssLvl = (lvl === 'critical') ? 'error' : (lvl === 'resolved' ? 'success' : lvl);
        html += `<div class="notif-center-item" onclick="Notifications.navigateToTarget('${(a.target || '').replace(/'/g, "\\'")}')">
          <div class="notif-center-icon ${cssLvl}">${meta.icon}</div>
          <div class="notif-center-content">
            <div class="notif-center-msg">${this._escHtml(a.message)}${countBadge}</div>
            <div class="notif-center-meta">
              <span>${time}</span>
              ${targetHtml}
            </div>
          </div>
          <button class="notif-center-dismiss" onclick="event.stopPropagation();Notifications.dismissAlert(${a.id});" title="Dismiss">✕</button>
        </div>`;
      }
      html += '</div>';
    }
    body.innerHTML = html;
  },

  _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  },

  navigateToTarget(target) {
    if (!target) return;
    const t = target.toLowerCase();
    const tabMap = {
      'canvas': 'canvas', 'graph': 'canvas', 'flow': 'canvas',
      'events': 'events', 'live': 'events',
      'services': 'services', 'health': 'services',
      'logs': 'logs', 'log': 'logs',
      'files': 'files', 'file': 'files',
      'env': 'env', 'environ': 'env',
      'performance': 'perf', 'perf': 'perf',
      'network': 'net', 'net': 'net',
      'state': 'state',
      'timeline': 'timeline',
      'breakpoints': 'breakpoints',
      'git': 'git',
      'dependencies': 'deps', 'deps': 'deps'
    };

    let tab = null;
    for (const [key, val] of Object.entries(tabMap)) {
      if (t.includes(key)) { tab = val; break; }
    }

    if (!tab && (t.includes('.') || t.includes('/') || t.includes('\\'))) {
      tab = 'canvas';
    }

    if (tab) {
      const tabBtn = document.querySelector(`[data-tab="${tab}"]`);
      if (tabBtn) tabBtn.click();
    }
    this.centerOpen = false;
    const panel = document.getElementById('notifCenterPanel');
    if (panel) panel.style.display = 'none';
    document.removeEventListener('click', this._outsideClick);
  },

  /* ──── Legacy: renderAlerts() now delegates to toast bar ──── */
  renderAlerts() {
    // Toast bar handles its own rendering; this is kept for API compat
    this._renderToastBar();
  },

  /* ──────────────── Settings toggles ─────────────── */

  toggleDesktop() {
    if (!this.desktopEnabled) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
          this.desktopEnabled = p === 'granted';
          this.updateToggles();
        });
        return;
      }
      this.desktopEnabled = ('Notification' in window && Notification.permission === 'granted');
    } else {
      this.desktopEnabled = false;
    }
    this.updateToggles();
  },

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    this.updateToggles();
  },

  toggleVoice() {
    this.voiceEnabled = !this.voiceEnabled;
    this.updateToggles();
  },

  updateToggles() {
    const desk = document.getElementById('notifDesktop');
    const sound = document.getElementById('notifSound');
    const voice = document.getElementById('voiceToggle');
    if (desk) desk.style.color = this.desktopEnabled ? 'var(--accent-blue)' : 'var(--text-tertiary)';
    if (sound) sound.style.color = this.soundEnabled ? 'var(--accent-blue)' : 'var(--text-tertiary)';
    if (voice) voice.style.color = this.voiceEnabled ? 'var(--accent-blue)' : 'var(--text-tertiary)';
  },

  /* ──────────────── Audio / Desktop / Voice ─────────────── */

  playBeep(type) {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      gain.gain.value = 0.15;

      if (type === 'critical') {
        osc.frequency.value = 880; osc.type = 'square';
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);
        osc.start(); osc.stop(this.audioCtx.currentTime + 0.5);
      } else if (type === 'resolved') {
        osc.frequency.value = 523; osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(this.audioCtx.currentTime + 0.3);
      } else {
        osc.frequency.value = 660; osc.type = 'triangle';
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(this.audioCtx.currentTime + 0.2);
      }
    } catch (e) { console.warn('Audio failed:', e); } // eslint-disable-line no-console
  },

  sendDesktop(title, body) {
    if (!this.desktopEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body, icon: '', tag: 'synapse-debug', renotify: true });
      setTimeout(() => n.close(), 8000);
    } catch { /* desktop notification unsupported */ }
  },

  speakAlert(text) {
    if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2;
    utterance.volume = 0.7;
    speechSynthesis.speak(utterance);
  }
};
