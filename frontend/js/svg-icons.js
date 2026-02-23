/*
 * Synapse Live Debug — SVG Icon System
 * minimax.io design: stroke-based, flat & minimal, NO emoji
 * All icons use 24×24 viewBox, stroke-width 2, round caps/joins
 *
 * Usage (HTML context):   SynapseIcons.html('bolt', { size: 14, color: '#F53F3F' })
 * Usage (SVG context):    SynapseIcons.svg('bolt',  { size: 14, color: 'white' })
 */

// eslint-disable-next-line no-unused-vars
const SynapseIcons = (function () {
  'use strict';

  /*
   * _D: icon definitions.  Key = icon name.
   * Value = array of SVG inner-content strings (paths, circles, rects, lines).
   * All coordinates assume viewBox="0 0 24 24".
   * Stroke-based by default; add  data-fill="1"  on any path that should be filled.
   */
  const _D = {
    /* ── Core UI ─────────────────────────────────────────────── */
    gear: [
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>',
      '<circle cx="12" cy="12" r="3"/>',
    ],
    target: [
      '<circle cx="12" cy="12" r="10"/>',
      '<circle cx="12" cy="12" r="6"/>',
      '<circle cx="12" cy="12" r="2"/>',
    ],
    bolt: [
      '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    ],
    shield: [
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    ],
    'shield-check': [
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      '<path d="m9 12 2 2 4-4"/>',
    ],
    search: [
      '<circle cx="11" cy="11" r="8"/>',
      '<path d="m21 21-4.35-4.35"/>',
    ],
    refresh: [
      '<path d="M1 4v6h6"/>',
      '<path d="M23 20v-6h-6"/>',
      '<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>',
    ],
    check: [
      '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>',
      '<path d="M22 4 12 14.01l-3-3"/>',
    ],
    warning: [
      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
      '<line x1="12" y1="9" x2="12" y2="13"/>',
      '<line x1="12" y1="17" x2="12.01" y2="17"/>',
    ],
    info: [
      '<circle cx="12" cy="12" r="10"/>',
      '<path d="M12 16v-4"/>',
      '<line x1="12" y1="8" x2="12.01" y2="8"/>',
    ],

    /* ── Developer Tools ─────────────────────────────────────── */
    wrench: [
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    ],
    hammer: [
      '<path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"/>',
      '<path d="M17.64 15 22 10.64"/>',
      '<path d="m20.91 11.7-1.25-1.25a4 4 0 0 0-5.66 0L12.59 11.86 12 8l4-4h3l3 3v3l-4 4-.59-.59 1.41-1.41a4 4 0 0 0 0-5.66L17.64 5.16"/>',
    ],
    pencil: [
      '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
      '<path d="m15 5 4 4"/>',
    ],
    trash: [
      '<path d="M3 6h18"/>',
      '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>',
      '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    ],
    bug: [
      '<path d="m8 2 1.88 1.88"/>',
      '<path d="M14.12 3.88 16 2"/>',
      '<path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>',
      '<path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>',
      '<path d="M12 20v-9"/>',
      '<path d="M6.53 9C4.6 8.8 3 7.1 3 5"/>',
      '<path d="M6 13H2"/>',
      '<path d="M3 21c0-2.1 1.7-3.9 3.8-4"/>',
      '<path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/>',
      '<path d="M22 13h-4"/>',
      '<path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    ],
    terminal: [
      '<path d="m4 17 6-5-6-5"/>',
      '<path d="M12 19h8"/>',
    ],
    flask: [
      '<path d="M9 2h6"/>',
      '<path d="M10 2v7.527a2 2 0 0 1-.566 1.395l-4.2 4.2A2 2 0 0 0 4.67 16.5V19a2 2 0 0 0 2 2h10.67a2 2 0 0 0 2-2v-2.378a2 2 0 0 0-.566-1.395l-4.2-4.2A2 2 0 0 1 14 9.527V2"/>',
    ],

    /* ── Files & Data ────────────────────────────────────────── */
    package: [
      '<path d="m16.5 9.4-9-5.19"/>',
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
      '<path d="M3.27 6.96 12 12.01l8.73-5.05"/>',
      '<path d="M12 22.08V12"/>',
    ],
    document: [
      '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/>',
      '<path d="M14 2v6h6"/>',
    ],
    'document-text': [
      '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/>',
      '<path d="M14 2v6h6"/>',
      '<path d="M16 13H8"/>',
      '<path d="M16 17H8"/>',
      '<path d="M10 9H8"/>',
    ],
    folder: [
      '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    ],
    clipboard: [
      '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>',
      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    ],
    floppy: [
      '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>',
      '<path d="M17 21v-8H7v8"/>',
      '<path d="M7 3v5h8"/>',
    ],
    layers: [
      '<path d="m12 2-10 5 10 5 10-5Z"/>',
      '<path d="m2 17 10 5 10-5"/>',
      '<path d="m2 12 10 5 10-5"/>',
    ],

    /* ── Communication ───────────────────────────────────────── */
    chat: [
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    ],
    globe: [
      '<circle cx="12" cy="12" r="10"/>',
      '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>',
      '<path d="M2 12h20"/>',
    ],

    /* ── AI & Intelligence ───────────────────────────────────── */
    robot: [
      '<rect x="3" y="11" width="18" height="10" rx="2"/>',
      '<circle cx="12" cy="5" r="2"/>',
      '<path d="M12 7v4"/>',
      '<line x1="8" y1="16" x2="8" y2="16"/>',
      '<line x1="16" y1="16" x2="16" y2="16"/>',
    ],
    brain: [
      '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>',
      '<path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>',
    ],
    eye: [
      '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>',
      '<circle cx="12" cy="12" r="3"/>',
    ],
    microscope: [
      '<path d="M6 18h8"/>',
      '<path d="M3 22h18"/>',
      '<path d="M14 22a7 7 0 1 0 0-14h-1"/>',
      '<path d="M9 14h2"/>',
      '<path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/>',
      '<path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
    ],
    sparkles: [
      '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>',
      '<path d="M5 3v4"/>',
      '<path d="M19 17v4"/>',
      '<path d="M3 5h4"/>',
      '<path d="M17 19h4"/>',
    ],

    /* ── Layout & Navigation ─────────────────────────────────── */
    home: [
      '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
      '<path d="M9 22V12h6v10"/>',
    ],
    ruler: [
      '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/>',
      '<path d="m14.5 12.5 2-2"/>',
      '<path d="m11.5 9.5 2-2"/>',
      '<path d="m8.5 6.5 2-2"/>',
      '<path d="m17.5 15.5 2-2"/>',
    ],
    window: [
      '<rect width="20" height="16" x="2" y="4" rx="2"/>',
      '<path d="M2 8h20"/>',
      '<path d="M6 6h.01"/>',
      '<path d="M9 6h.01"/>',
    ],
    'menu-lines': [
      '<line x1="4" x2="20" y1="12" y2="12"/>',
      '<line x1="4" x2="20" y1="6" y2="6"/>',
      '<line x1="4" x2="20" y1="18" y2="18"/>',
    ],
    chart: [
      '<path d="M18 20V10"/>',
      '<path d="M12 20V4"/>',
      '<path d="M6 20v-6"/>',
    ],

    /* ── Shapes & Status ─────────────────────────────────────── */
    palette: [
      '<circle cx="13.5" cy="6.5" r=".5" data-fill="1"/>',
      '<circle cx="17.5" cy="10.5" r=".5" data-fill="1"/>',
      '<circle cx="8.5" cy="7.5" r=".5" data-fill="1"/>',
      '<circle cx="6.5" cy="12" r=".5" data-fill="1"/>',
      '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.7 1.5-1.5 0-.39-.15-.74-.39-1.04-.23-.29-.38-.63-.38-1.02 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.17-4.5-9-10-9z"/>',
    ],
    heart: [
      '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    ],
    lightbulb: [
      '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>',
      '<path d="M9 18h6"/>',
      '<path d="M10 22h4"/>',
    ],
    puzzle: [
      '<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/>',
    ],
    dna: [
      '<path d="M2 15c6.667-6 13.333 0 20-6"/>',
      '<path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/>',
      '<path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/>',
      '<path d="m17 6-2.5-2.5"/>',
      '<path d="m14 8-1-1"/>',
      '<path d="m7 18 2.5 2.5"/>',
      '<path d="m3.5 14.5.5.5"/>',
      '<path d="m20 9 .5.5"/>',
      '<path d="m6.5 12.5 1 1"/>',
      '<path d="m16.5 10.5 1 1"/>',
      '<path d="m10 16 1.5 1.5"/>',
    ],
    hook: [
      '<path d="M18 15l-6-6"/>',
      '<path d="M18 9v6h-6"/>',
      '<path d="M12 15 3.34 6.34a4.243 4.243 0 0 1 6-6L18 9"/>',
    ],
    route: [
      '<circle cx="6" cy="19" r="3"/>',
      '<path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>',
      '<circle cx="18" cy="5" r="3"/>',
    ],

    /* ── Misc ─────────────────────────────────────────────────── */
    masks: [
      '<path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z"/>',
      '<path d="M6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2Z"/>',
      '<path d="M18 11c-1.5 0-3 .5-3 2 2 0 3 0 3-2Z"/>',
    ],
    radio: [
      '<circle cx="12" cy="12" r="10"/>',
      '<circle cx="12" cy="12" r="3" data-fill="1"/>',
    ],
    tree: [
      '<path d="M12 22v-6"/>',
      '<path d="M12 13V8l-4 4h8l-4-4Z"/>',
      '<path d="M12 9V4l-4 4h8l-4-4Z"/>',
      '<path d="M12 5V2"/>',
    ],
    hourglass: [
      '<path d="M5 22h14"/>',
      '<path d="M5 2h14"/>',
      '<path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>',
      '<path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    ],
    dolphin: [
      '<path d="M20.5 5.5c-1-1.5-3-2.5-5.5-2.5-4 0-7 3-8.5 6C5 12 3 14 2 15.5c2 .5 4 0 5.5-.5 0 1.5.5 3.5 2 5 0-1.5.5-3 1.5-4 1.5 1 3.5 1.5 5.5 1 2-.5 3.5-2 4-4 .5-2 .5-4 0-5.5l-1.5-2Z"/>',
      '<circle cx="16" cy="8" r="1" data-fill="1"/>',
      '<path d="M22 4c-.5 1-1.5 1.5-2.5 1.5"/>',
    ],

    /* ── Filled indicator dots ───────────────────────────────── */
    'dot-red':    ['<circle cx="12" cy="12" r="6" data-fill="1"/>'],
    'dot-yellow': ['<circle cx="12" cy="12" r="6" data-fill="1"/>'],
    'dot-green':  ['<circle cx="12" cy="12" r="6" data-fill="1"/>'],
  };

  /* ── Default colors for special icons ─────────────────────── */
  const _DOT_COLORS = {
    'dot-red':    'var(--accent-red, #F53F3F)',
    'dot-yellow': 'var(--accent-yellow, #F7BA1E)',
    'dot-green':  'var(--accent-green, #00B42A)',
  };

  /**
   * Render a single SVG element string from its definition parts.
   * @param {string[]} parts - Array of SVG element strings
   * @param {string}   color - Stroke/fill color
   * @returns {string} Combined SVG inner content
   */
  function _render(parts, color) {
    return parts.map((p) => {
      if (p.indexOf('data-fill="1"') !== -1) {
        return p.replace(/data-fill="1"/, `fill="${color}" stroke="none"`);
      }
      return p.replace(/\/>$/, ` stroke="${color}" fill="none"/>`);
    }).join('');
  }

  return {
    /**
     * Return an inline <svg> HTML string (for use in innerHTML, buttons, badges).
     * @param {string} name  - Icon name from _D
     * @param {object} [opts]
     * @param {number} [opts.size=16]  - Width & height in px
     * @param {string} [opts.color='currentColor'] - Stroke color
     * @param {string} [opts.cls='']   - Extra CSS class(es)
     * @returns {string} Complete <svg> element string
     */
    html(name, opts) {
      const o = opts || {};
      const size  = o.size  || 16;
      const color = o.color || _DOT_COLORS[name] || 'currentColor';
      const cls   = o.cls   || '';
      const def   = _D[name];
      if (!def) return '';
      const inner = _render(def, color);
      return `<svg class="syn-icon${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    },

    /**
     * Return SVG child content for placement inside an existing <svg>.
     * Centers the icon at the origin (0,0) and scales to `size`.
     * @param {string} name  - Icon name from _D
     * @param {object} [opts]
     * @param {number} [opts.size=14]  - Desired icon size in SVG units
     * @param {string} [opts.color='white'] - Stroke color
     * @returns {string} SVG <g> element string
     */
    svg(name, opts) {
      const o = opts || {};
      const size  = o.size  || 14;
      const color = o.color || 'white';
      const def   = _D[name];
      if (!def) return '';
      const scale = (size / 24).toFixed(4);
      const inner = _render(def, color);
      return `<g transform="scale(${scale}) translate(-12,-12)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
    },

    /**
     * Check if an icon exists.
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
      return name in _D;
    },

    /** List all available icon names */
    list() {
      return Object.keys(_D);
    },
  };
})();
