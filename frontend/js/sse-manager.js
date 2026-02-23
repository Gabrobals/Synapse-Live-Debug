/**
 * Live Debug — SSE & Connection Manager
 * Passive utility driven by app.js.
 * Provides: updateStatus(), connectSSE(callback), disconnect(), sendWS()
 */

// eslint-disable-next-line no-unused-vars
const ConnectionManager = {
  eventSource: null,
  _sseCallback: null,
  reconnectAttempts: 0,

  /**
   * Update the connection status indicator in the header.
   * Called by app.js checkBackendAlive().
   * @param {'connected'|'connecting'|'disconnected'} status
   */
  updateStatus(status) {
    const el = document.getElementById('connectionStatus');
    const textEl = document.getElementById('connectionText');
    if (el) el.className = `connection-status ${  status}`;
    const map = {
      connected:    'Connected',
      connecting:   'Connecting...',
      disconnected: 'Disconnected',
    };
    if (textEl) textEl.textContent = map[status] || status;
  },

  /**
   * Open an SSE connection and route incoming events through the callback.
   * @param {function} onEvent — receives parsed event objects
   */
  connectSSE(onEvent) {
    if (this.eventSource) { try { this.eventSource.close(); } catch { /* ignored */ } }
    this._sseCallback = onEvent || null;

    this.eventSource = new EventSource(`${CONFIG.API_BASE}/debug/events/stream`);

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.eventSource.onmessage = (e) => {
      try {
        if (e.data === ':keepalive') return;
        const event = JSON.parse(e.data);
        if (this._sseCallback) this._sseCallback(event);
      } catch (err) {
        console.error('SSE parse error:', err); // eslint-disable-line no-console
      }
    };

    this.eventSource.onerror = () => {
      if (this.eventSource) this.eventSource.close();
      this.eventSource = null;
    };
  },

  /**
   * Close SSE connection. Called by app.js onBackendDisconnected().
   */
  disconnect() {
    if (this.eventSource) {
      try { this.eventSource.close(); } catch { /* ignored */ }
      this.eventSource = null;
    }
    this._sseCallback = null;
  },

  /**
   * Send data over WebSocket (managed by app.js).
   */
  sendWS(_data) { // eslint-disable-line no-unused-vars
    // WebSocket is managed directly by app.js (_ws variable).
    // This is a no-op stub kept for API compatibility.
  }
};
