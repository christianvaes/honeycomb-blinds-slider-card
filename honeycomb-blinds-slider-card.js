/**
 * Honeycomb Blinds Slider Card
 * Custom Home Assistant Lovelace card for plisse/honeycomb blinds with dual motors.
 * Styled to match the native HA tile card with cover-position slider.
 *
 * @version 1.0.2
 */

const CARD_VERSION = '1.0.2';

class HoneycombBlindsSliderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._dragging = null;
    this._pendingTop = null;
    this._pendingBottom = null;
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity_top', required: true, selector: { entity: { domain: 'cover' } } },
        { name: 'entity_bottom', required: true, selector: { entity: { domain: 'cover' } } },
        {
          name: '',
          type: 'grid',
          schema: [
            { name: 'name', selector: { text: {} } },
            { name: 'icon', selector: { icon: {} } },
          ],
        },
        { name: 'show_state', selector: { boolean: {} } },
      ],
      computeLabel: (schema) => {
        const labels = {
          entity_top: 'Top motor entity',
          entity_bottom: 'Bottom motor entity',
          name: 'Name',
          icon: 'Icon',
          show_state: 'Show state',
        };
        return labels[schema.name] || schema.name;
      },
    };
  }

  static getStubConfig(hass) {
    const covers = Object.keys(hass.states).filter(eid => eid.startsWith('cover.'));
    return {
      entity_top: covers[0] || '',
      entity_bottom: covers[1] || covers[0] || '',
      show_state: true,
    };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._config) return;

    const t = this._config.entity_top;
    const b = this._config.entity_bottom;
    if (
      !oldHass ||
      oldHass.states[t] !== hass.states[t] ||
      oldHass.states[b] !== hass.states[b]
    ) {
      if (!this._dragging) this._render();
    }
  }

  setConfig(config) {
    if (!config.entity_top || !config.entity_bottom) {
      throw new Error('Please define both entity_top and entity_bottom');
    }
    this._config = { show_state: true, ...config };
    if (this._hass) this._render();
  }

  getCardSize() {
    return 2;
  }

  _pos(eid) {
    const s = this._hass?.states[eid];
    if (!s) return 0;
    const p = s.attributes.current_position;
    return p != null ? p : (s.state === 'open' ? 100 : 0);
  }

  _name(eid) {
    return this._hass?.states[eid]?.attributes?.friendly_name || eid;
  }

  _state(eid) {
    return this._hass?.states[eid]?.state || 'unavailable';
  }

  _call(eid, svc, data = {}) {
    this._hass.callService('cover', svc, { entity_id: eid, ...data });
  }

  _handleOpen() {
    this._call(this._config.entity_top, 'set_cover_position', { position: 100 });
    this._call(this._config.entity_bottom, 'set_cover_position', { position: 100 });
  }

  _handleClose() {
    this._call(this._config.entity_top, 'set_cover_position', { position: 100 });
    this._call(this._config.entity_bottom, 'set_cover_position', { position: 0 });
  }

  _handleStop() {
    this._call(this._config.entity_top, 'stop_cover');
    this._call(this._config.entity_bottom, 'stop_cover');
  }

  // ---- Slider ----

  _pctFromEvent(e) {
    const track = this.shadowRoot.querySelector('.slider');
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  _onThumbDown(which, e) {
    e.preventDefault();
    e.stopPropagation();
    this._dragging = which;
    const thumb = this.shadowRoot.querySelector(`.cursor-${which}`);
    if (thumb) thumb.classList.add('active');
    if (e.type === 'touchstart') {
      document.addEventListener('touchmove', this._boundTouchMove, { passive: false });
      document.addEventListener('touchend', this._boundTouchEnd);
    } else {
      document.addEventListener('mousemove', this._boundMouseMove);
      document.addEventListener('mouseup', this._boundMouseUp);
    }
  }

  _onMouseMove(e) { this._drag(e); }
  _onTouchMove(e) { e.preventDefault(); this._drag(e); }

  _drag(e) {
    if (!this._dragging) return;
    const pct = this._pctFromEvent(e);
    if (pct === null) return;

    const curTop = this._pendingTop != null ? this._pendingTop : this._pos(this._config.entity_top);
    const curBot = this._pendingBottom != null ? this._pendingBottom : this._pos(this._config.entity_bottom);

    if (this._dragging === 'top') {
      this._pendingTop = Math.max(pct, curBot);
    } else {
      this._pendingBottom = Math.min(pct, curTop);
    }
    this._updateVisuals();
  }

  _onMouseUp() {
    this._finish();
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
  }

  _onTouchEnd() {
    this._finish();
    document.removeEventListener('touchmove', this._boundTouchMove);
    document.removeEventListener('touchend', this._boundTouchEnd);
  }

  _finish() {
    const thumb = this.shadowRoot.querySelector(`.cursor-${this._dragging}`);
    if (thumb) thumb.classList.remove('active');
    if (this._dragging === 'top' && this._pendingTop != null) {
      this._call(this._config.entity_top, 'set_cover_position', { position: Math.round(this._pendingTop) });
    }
    if (this._dragging === 'bottom' && this._pendingBottom != null) {
      this._call(this._config.entity_bottom, 'set_cover_position', { position: Math.round(this._pendingBottom) });
    }
    this._pendingTop = null;
    this._pendingBottom = null;
    this._dragging = null;
  }

  _updateVisuals() {
    const topP = this._pendingTop != null ? this._pendingTop : this._pos(this._config.entity_top);
    const botP = this._pendingBottom != null ? this._pendingBottom : this._pos(this._config.entity_bottom);

    const cursorTop = this.shadowRoot.querySelector('.cursor-top');
    const cursorBot = this.shadowRoot.querySelector('.cursor-bottom');
    const fillTop = this.shadowRoot.querySelector('.fill-top');
    const fillBot = this.shadowRoot.querySelector('.fill-bottom');
    const tipTop = this.shadowRoot.querySelector('.tooltip-top');
    const tipBot = this.shadowRoot.querySelector('.tooltip-bottom');
    const stateEl = this.shadowRoot.querySelector('.secondary');

    if (cursorTop) cursorTop.style.left = `${topP}%`;
    if (cursorBot) cursorBot.style.left = `${botP}%`;
    if (fillTop) { fillTop.style.left = `${topP}%`; fillTop.style.width = `${100 - topP}%`; }
    if (fillBot) { fillBot.style.width = `${botP}%`; }
    if (tipTop) tipTop.textContent = `${Math.round(topP)}%`;
    if (tipBot) tipBot.textContent = `${Math.round(botP)}%`;
    if (stateEl) stateEl.textContent = `Top ${Math.round(topP)}% · Bottom ${Math.round(botP)}%`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const cfg = this._config;
    const topP = this._pos(cfg.entity_top);
    const botP = this._pos(cfg.entity_bottom);
    const icon = cfg.icon || 'mdi:blinds-horizontal';
    const name = cfg.name || this._name(cfg.entity_top).replace(/\s*(top|boven|upper|motor).*$/i, '').trim() || 'Honeycomb Blind';
    const topState = this._state(cfg.entity_top);
    const botState = this._state(cfg.entity_bottom);
    const showState = cfg.show_state !== false;
    const unavail = topState === 'unavailable' || botState === 'unavailable';

    let stateText = '';
    if (showState) {
      stateText = unavail ? 'Unavailable' : `Top ${Math.round(topP)}% · Bottom ${Math.round(botP)}%`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          --tile-color: var(--state-cover-active-color, var(--state-cover-color, rgb(189, 157, 255)));
          height: 100%;
          overflow: hidden;
          padding: 0;
        }

        /* Main layout - matches ha-tile-container */
        .tile-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }

        /* Top content row: icon + info + buttons */
        .content {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 10px;
          padding: 10px;
          min-height: 56px;
        }

        /* Icon - matches ha-tile-icon */
        .icon-holder {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          transition: transform 180ms ease-in-out;
          --mdc-icon-size: 24px;
          color: var(--tile-color);
        }
        .icon-holder::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: var(--tile-color);
          opacity: 0.2;
        }
        .icon-holder.unavailable {
          color: rgb(var(--rgb-disabled, 189, 189, 189));
        }
        .icon-holder.unavailable::before {
          background: rgb(var(--rgb-disabled, 189, 189, 189));
        }

        /* Info - matches ha-tile-info */
        .info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .primary {
          font-weight: 500;
          font-size: 14px;
          line-height: 20px;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .secondary {
          font-weight: 400;
          font-size: 12px;
          line-height: 16px;
          color: var(--secondary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Buttons */
        .actions {
          display: flex;
          flex-shrink: 0;
          gap: 2px;
        }
        .actions button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 20px;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--secondary-text-color);
          --mdc-icon-size: 20px;
          padding: 0;
          transition: background 0.15s;
        }
        .actions button:hover {
          background: rgba(127, 127, 127, 0.15);
        }
        .actions button:disabled {
          color: var(--disabled-color);
          cursor: default;
        }
        .actions button:disabled:hover {
          background: none;
        }

        /* Features section - matches hui-card-features */
        .features {
          display: flex;
          flex-direction: column;
          padding: 0 12px 12px 12px;
          gap: 12px;
        }

        /* Open/Close buttons row */
        .control-buttons {
          display: flex;
          flex-direction: row;
          gap: 8px;
        }
        .control-buttons button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 42px;
          border-radius: 12px;
          border: none;
          background: rgba(127, 127, 127, 0.15);
          cursor: pointer;
          color: var(--primary-text-color);
          --mdc-icon-size: 20px;
          padding: 0;
          transition: background 0.15s;
        }
        .control-buttons button:hover {
          background: rgba(127, 127, 127, 0.25);
        }
        .control-buttons button:disabled {
          opacity: 0.4;
          cursor: default;
        }

        /* Dual slider - styled like ha-control-slider */
        .slider-wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .slider-labels {
          display: flex;
          justify-content: space-between;
          padding: 0 2px;
        }
        .slider-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--secondary-text-color);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .slider-label .dot {
          width: 6px;
          height: 6px;
          border-radius: 3px;
        }
        .slider-label .dot.top { background: var(--tile-color); }
        .slider-label .dot.bottom { background: var(--primary-color, #03a9f4); }

        .slider {
          position: relative;
          width: 100%;
          height: 42px;
          border-radius: 12px;
          overflow: hidden;
          touch-action: none;
          cursor: pointer;
        }

        /* Background - light version of tile color */
        .slider-bg {
          position: absolute;
          inset: 0;
          background: var(--tile-color);
          opacity: 0.2;
        }

        /* Top fill: from topP% to 100% - represents top portion above top cursor */
        .fill-top {
          position: absolute;
          top: 0;
          bottom: 0;
          background: var(--tile-color);
          opacity: 0.5;
          pointer-events: none;
        }

        /* Bottom fill: from 0% to botP% - represents bottom portion below bottom cursor */
        .fill-bottom {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          background: var(--primary-color, #03a9f4);
          opacity: 0.4;
          pointer-events: none;
        }

        /* Cursors - match ha-control-slider cursor: white, 10.5px wide, full height, 4px radius */
        .cursor {
          position: absolute;
          top: 0;
          width: 10px;
          height: 100%;
          border-radius: 4px;
          background: white;
          transform: translateX(-50%);
          cursor: grab;
          touch-action: none;
          z-index: 2;
          transition: left 0.2s ease;
          box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
        }
        .cursor.active {
          transition: none;
          cursor: grabbing;
          box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
          width: 14px;
        }

        /* Tooltip - matches HA tooltip: dark bg, rounded, above slider */
        .tooltip-wrap {
          position: absolute;
          top: -28px;
          transform: translateX(-50%);
          z-index: 3;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s, left 0.2s ease;
        }
        .cursor.active ~ .tooltip-wrap,
        .cursor:hover ~ .tooltip-wrap {
          opacity: 1;
        }
        .tooltip-wrap.active {
          opacity: 1;
          transition: opacity 0.15s;
        }
        .tooltip {
          background: var(--card-background-color, rgb(46, 48, 56));
          color: var(--primary-text-color);
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 12px;
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }
      </style>
      <ha-card>
        <div class="tile-container">
          <div class="content">
            <div class="icon-holder${unavail ? ' unavailable' : ''}">
              <ha-icon icon="${icon}"></ha-icon>
            </div>
            <div class="info">
              <span class="primary">${name}</span>
              ${showState ? `<span class="secondary">${stateText}</span>` : ''}
            </div>
            <div class="actions">
              <button id="btn-stop" title="Stop"${unavail ? ' disabled' : ''}>
                <ha-icon icon="mdi:stop"></ha-icon>
              </button>
            </div>
          </div>
          <div class="features">
            <div class="control-buttons">
              <button id="btn-open"${unavail ? ' disabled' : ''}><ha-icon icon="mdi:arrow-collapse-up"></ha-icon></button>
              <button id="btn-close"${unavail ? ' disabled' : ''}><ha-icon icon="mdi:arrow-collapse-down"></ha-icon></button>
            </div>
            <div class="slider-wrapper">
              <div class="slider" id="slider">
                <div class="slider-bg"></div>
                <div class="fill-bottom" style="width:${botP}%"></div>
                <div class="fill-top" style="left:${topP}%;width:${100 - topP}%"></div>
                <div class="cursor cursor-top" style="left:${topP}%"></div>
                <div class="tooltip-wrap tooltip-wrap-top" style="left:${topP}%"><span class="tooltip tooltip-top">${Math.round(topP)}%</span></div>
                <div class="cursor cursor-bottom" style="left:${botP}%"></div>
                <div class="tooltip-wrap tooltip-wrap-bottom" style="left:${botP}%"><span class="tooltip tooltip-bottom">${Math.round(botP)}%</span></div>
              </div>
              <div class="slider-labels">
                <div class="slider-label"><span class="dot bottom"></span>Bottom</div>
                <div class="slider-label"><span class="dot top"></span>Top</div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    if (!unavail) {
      this.shadowRoot.getElementById('btn-open').addEventListener('click', () => this._handleOpen());
      this.shadowRoot.getElementById('btn-close').addEventListener('click', () => this._handleClose());
      this.shadowRoot.getElementById('btn-stop').addEventListener('click', () => this._handleStop());

      const ct = this.shadowRoot.querySelector('.cursor-top');
      const cb = this.shadowRoot.querySelector('.cursor-bottom');
      ct.addEventListener('mousedown', (e) => this._onThumbDown('top', e));
      ct.addEventListener('touchstart', (e) => this._onThumbDown('top', e), { passive: false });
      cb.addEventListener('mousedown', (e) => this._onThumbDown('bottom', e));
      cb.addEventListener('touchstart', (e) => this._onThumbDown('bottom', e), { passive: false });
    }
  }
}

customElements.define('honeycomb-blinds-slider-card', HoneycombBlindsSliderCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'honeycomb-blinds-slider-card',
  name: 'Honeycomb Blinds Slider Card',
  description: 'A card for plisse/honeycomb blinds with dual motors and a dual-thumb slider.',
  preview: true,
  documentationURL: 'https://github.com/christianvaes/honeycomb-blinds-slider-card',
});

console.info(
  `%c HONEYCOMB-BLINDS-SLIDER %c v${CARD_VERSION} `,
  'color: white; background: #7b61ff; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #7b61ff; background: white; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0; border: 1px solid #7b61ff;'
);
