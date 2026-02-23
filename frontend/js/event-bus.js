/**
 * Live Debug — Event Bus
 * Inter-tab communication system
 */

// eslint-disable-next-line no-unused-vars
const SynapseBus = {
  _listeners: {},

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    };
  },

  emit(event, data) {
    for (const fn of (this._listeners[event] || [])) {
      try { fn(data); } catch (e) { console.error('[BUS]', e); } // eslint-disable-line no-console
    }
  },

  off(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }
  },

  once(event, fn) {
    const wrapper = (data) => {
      fn(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
};
