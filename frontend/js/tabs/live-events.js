/**
 * Live Debug — Tab 1: Live Events
 * Event stream rendering, filters, timeline, error list
 */
(function () {
  'use strict';

  SynapseApp.tabs.events = {
    addEventToUI,
    addToTimeline,
    addToErrorList,
  };

  function addEventToUI(event) {
    const container = document.getElementById('eventsContainer');
    if (!container) return;
    const category = EVENT_CATEGORIES[event.type] || 'other';
    const visible = SynapseApp.currentFilter === 'all' || category === SynapseApp.currentFilter;

    const el = document.createElement('div');
    el.className = `event-item${event.type === 'error' ? 'error' : ''}`;
    el.dataset.category = category;
    el.style.display = visible ? 'block' : 'none';

    const icon = EVENT_ICONS[event.type] || '';
    const color = EVENT_COLORS[event.type] || '#ffffff';
    const time = new Date(event.timestamp).toLocaleTimeString();

    el.innerHTML = `
      <div class="event-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
        <div class="event-type">
          <span class="event-icon">${icon}</span>
          <span class="event-name" style="color:${color};">${event.type}</span>
          <span class="event-component">@ ${event.component || '—'}</span>
        </div>
        <div class="event-meta">
          <span class="event-time">${time}</span>
          ${event.step != null ? `<span class="badge badge-dim">Step ${event.step}</span>` : ''}
        </div>
      </div>
      <div class="event-body">
        <pre class="event-data">${escapeHTML(JSON.stringify(event.data || event, null, 2))}</pre>
      </div>`;

    container.insertBefore(el, container.firstChild);

    // Limit DOM nodes
    const items = container.querySelectorAll('.event-item');
    if (items.length >CONFIG.MAX_UI_EVENTS) items[items.length - 1].remove();

    // Flash animation
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 400);
  }

  function addToTimeline(event) {
    const timeline = document.getElementById('timeline');
    if (!timeline) return;
    const time = new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const icon = EVENT_ICONS[event.type] || '';

    let action = `${icon} ${event.type}`;
    if (event.data?.metadata?.setting) action = `${icon} Changed ${event.data.metadata.setting}`;
    else if (event.data?.metadata?.action) action = `${icon} ${event.data.metadata.action}`;
    else if (event.data?.input) action = `${icon} ${event.type}: "${event.data.input.substring(0, 30)}..."`;

    const item = document.createElement('div');
    item.style.cssText = 'display:flex;gap:var(--space-sm);font-size:0.78rem;';
    item.innerHTML = `<span class="font-mono" style="color:var(--text-tertiary);">${time}</span><span style="color:var(--text-secondary);">${action}</span>`;

    // Remove "Waiting" placeholder
    if (timeline.children.length === 1 && timeline.textContent.includes('Waiting')) timeline.innerHTML = '';

    timeline.insertBefore(item, timeline.firstChild);
    while (timeline.children.length > 20) timeline.lastChild.remove();
  }

  function addToErrorList(event) {
    const errorList = document.getElementById('errorList');
    if (!errorList) return;
    const es = errorList.querySelector('.empty-state');
    if (es) es.remove();

    const time = new Date(event.timestamp).toLocaleTimeString();
    const errorMsg = event.data?.error || event.data?.metadata?.error || 'Unknown error';
    const item = document.createElement('div');
    item.className = 'error-item';
    item.innerHTML = `
      <div style="font-size:0.68rem;color:var(--text-dim);font-family:var(--font-mono);">${time}</div>
      <div style="font-size:0.78rem;color:var(--accent-red);margin:2px 0;">${escapeHTML(errorMsg)}</div>
      <div style="font-size:0.68rem;color:var(--text-tertiary);">@ ${event.component || '—'}</div>`;
    errorList.insertBefore(item, errorList.firstChild);
    while (errorList.children.length > 10) errorList.lastChild.remove();
  }

  function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
