/**
 * Honeycomb Blinds Slider Card
 * Custom Home Assistant card for plisse/honeycomb blinds with dual motors.
 * Styled to match the native HA tile card.
 *
 * @version 1.1.1
 */

class HoneycombBlindsSliderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._dragging = null;
    this._pendingTop = null;
    this._pendingBottom = null;
    this._onMove = this._onMove.bind(this);
    this._onEnd = this._onEnd.bind(this);
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity_top', required: true, selector: { entity: { domain: 'cover' } } },
        { name: 'entity_bottom', required: true, selector: { entity: { domain: 'cover' } } },
        { name: '', type: 'grid', schema: [
          { name: 'name', selector: { text: {} } },
          { name: 'icon', selector: { icon: {} } },
        ]},
        { name: 'show_state', selector: { boolean: {} } },
      ],
      computeLabel: (s) => ({
        entity_top: 'Top motor entity', entity_bottom: 'Bottom motor entity',
        name: 'Name', icon: 'Icon', show_state: 'Show state',
      }[s.name] || s.name),
    };
  }

  static getStubConfig(hass) {
    const c = Object.keys(hass.states).filter(e => e.startsWith('cover.'));
    return { entity_top: c[0] || '', entity_bottom: c[1] || c[0] || '', show_state: true };
  }

  setConfig(config) {
    if (!config.entity_top || !config.entity_bottom) throw new Error('Please define both entity_top and entity_bottom');
    this._config = { show_state: true, ...config };
    this._buildDOM();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built && !this._dragging) this._update();
  }

  getCardSize() { return 2; }

  _pos(eid) {
    const s = this._hass?.states[eid];
    if (!s) return 0;
    const p = s.attributes.current_position;
    return p != null ? p : (s.state === 'open' ? 100 : 0);
  }
  _name(eid) { return this._hass?.states[eid]?.attributes?.friendly_name || eid; }
  _state(eid) { return this._hass?.states[eid]?.state || 'unavailable'; }
  _call(eid, svc, data) { this._hass.callService('cover', svc, { entity_id: eid, ...data }); }

  _buildDOM() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          --tile-color: var(--state-cover-active-color, var(--state-cover-color, rgb(189, 157, 255)));
          height: 100%; padding: 0;
        }
        .wrap { display: flex; flex-direction: column; height: 100%; }

        /* Header: icon + name/state */
        .header {
          display: flex; align-items: center; gap: 10px; padding: 10px;
        }
        .icon-wrap {
          position: relative; display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          --mdc-icon-size: 24px; color: var(--tile-color);
        }
        .icon-wrap::before {
          content: ''; position: absolute; inset: 0; border-radius: 50%;
          background: var(--tile-color); opacity: 0.2;
        }
        .icon-wrap.off { color: var(--disabled-color); }
        .icon-wrap.off::before { background: var(--disabled-color); }
        .info { flex: 1; min-width: 0; }
        .primary {
          font-weight: 500; font-size: 14px; line-height: 20px;
          color: var(--primary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .secondary {
          font-weight: 400; font-size: 12px; line-height: 16px;
          color: var(--secondary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Features */
        .features { display: flex; flex-direction: column; padding: 0 12px 12px; gap: 12px; }

        /* Open / Stop / Close button row - matches native ha-control-button-group */
        .btn-row {
          display: flex; gap: 0; height: 42px;
          border-radius: 12px; overflow: hidden;
          background: rgba(127,127,127,0.1);
        }
        .btn-row button {
          flex: 1; display: flex; align-items: center; justify-content: center;
          height: 42px; border: none; background: none; cursor: pointer;
          color: var(--primary-text-color); --mdc-icon-size: 20px; padding: 0;
        }
        .btn-row button:hover { background: rgba(127,127,127,0.15); }
        .btn-row button:disabled { opacity: 0.4; cursor: default; }
        .btn-row button:disabled:hover { background: none; }

        /* Slider */
        .slider {
          position: relative; width: 100%; height: 42px;
          border-radius: 12px; background: rgba(127,127,127,0.1);
          touch-action: none; cursor: pointer;
          user-select: none; -webkit-user-select: none;
        }
        .fill-bot {
          position: absolute; top: 0; bottom: 0; left: 0;
          border-radius: 12px 0 0 12px;
          background: var(--primary-color, #03a9f4); opacity: 0.35;
          pointer-events: none;
        }
        .fill-top {
          position: absolute; top: 0; bottom: 0; right: 0;
          border-radius: 0 12px 12px 0;
          background: var(--tile-color); opacity: 0.35;
          pointer-events: none;
        }
        .cur {
          position: absolute; top: 0;
          width: 10px; height: 42px; border-radius: 4px;
          background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
          pointer-events: none; z-index: 2;
        }
        .slider-labels {
          display: flex; justify-content: space-between; padding: 2px 2px 0;
        }
        .slider-label {
          font-size: 11px; font-weight: 500; color: var(--secondary-text-color);
          display: flex; align-items: center; gap: 4px;
        }
        .dot { width: 6px; height: 6px; border-radius: 3px; }
        .dot-top { background: var(--tile-color); }
        .dot-bot { background: var(--primary-color, #03a9f4); }
      </style>
      <ha-card>
        <div class="wrap">
          <div class="header">
            <div class="icon-wrap" id="iconWrap"><ha-icon id="icon"></ha-icon></div>
            <div class="info">
              <div class="primary" id="name"></div>
              <div class="secondary" id="state"></div>
            </div>
          </div>
          <div class="features">
            <div class="btn-row">
              <button id="openBtn"><ha-icon icon="mdi:arrow-expand-up"></ha-icon></button>
              <button id="stopBtn"><ha-icon icon="mdi:stop"></ha-icon></button>
              <button id="closeBtn"><ha-icon icon="mdi:arrow-collapse-down"></ha-icon></button>
            </div>
            <div>
              <div class="slider" id="slider">
                <div class="fill-bot" id="fillBot"></div>
                <div class="fill-top" id="fillTop"></div>
                <div class="cur" id="curBot"></div>
                <div class="cur" id="curTop"></div>
              </div>
              <div class="slider-labels">
                <div class="slider-label"><span class="dot dot-bot"></span>Bottom <span id="lblBot"></span></div>
                <div class="slider-label"><span id="lblTop"></span> Top <span class="dot dot-top"></span></div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    const $ = (id) => this.shadowRoot.getElementById(id);
    this._els = {
      iconWrap: $('iconWrap'), icon: $('icon'), name: $('name'), state: $('state'),
      openBtn: $('openBtn'), stopBtn: $('stopBtn'), closeBtn: $('closeBtn'),
      slider: $('slider'), fillBot: $('fillBot'), fillTop: $('fillTop'),
      curBot: $('curBot'), curTop: $('curTop'), lblBot: $('lblBot'), lblTop: $('lblTop'),
    };

    const cfg = this._config;
    this._els.openBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'set_cover_position', { position: 100 });
      this._call(cfg.entity_bottom, 'set_cover_position', { position: 100 });
    });
    this._els.stopBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'stop_cover', {});
      this._call(cfg.entity_bottom, 'stop_cover', {});
    });
    this._els.closeBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'set_cover_position', { position: 100 });
      this._call(cfg.entity_bottom, 'set_cover_position', { position: 0 });
    });

    this._els.slider.addEventListener('mousedown', (e) => this._onStart(e));
    this._els.slider.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });

    this._built = true;
    if (this._hass) this._update();
  }

  // ---- Slider ----

  _pct(e) {
    const r = this._els.slider.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    return Math.max(0, Math.min(100, (x / r.width) * 100));
  }

  _onStart(e) {
    e.preventDefault();
    const pct = this._pct(e);
    const topP = this._pos(this._config.entity_top);
    const botP = this._pos(this._config.entity_bottom);

    // Pick nearest cursor
    const dTop = Math.abs(pct - topP);
    const dBot = Math.abs(pct - botP);
    this._dragging = dTop < dBot ? 'top' : 'bottom';

    // Apply - NO crossing constraint, both thumbs are independent
    if (this._dragging === 'top') {
      this._pendingTop = pct;
    } else {
      this._pendingBottom = pct;
    }
    this._updateSlider();

    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup', this._onEnd);
    document.addEventListener('touchmove', this._onMove, { passive: false });
    document.addEventListener('touchend', this._onEnd);
  }

  _onMove(e) {
    if (!this._dragging) return;
    if (e.cancelable) e.preventDefault();
    const pct = this._pct(e);

    // Independent - no constraint between top and bottom
    if (this._dragging === 'top') {
      this._pendingTop = pct;
    } else {
      this._pendingBottom = pct;
    }
    this._updateSlider();
  }

  _onEnd() {
    if (this._dragging === 'top' && this._pendingTop != null) {
      this._call(this._config.entity_top, 'set_cover_position', { position: Math.round(this._pendingTop) });
    }
    if (this._dragging === 'bottom' && this._pendingBottom != null) {
      this._call(this._config.entity_bottom, 'set_cover_position', { position: Math.round(this._pendingBottom) });
    }
    this._pendingTop = null;
    this._pendingBottom = null;
    this._dragging = null;
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onEnd);
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onEnd);
  }

  _updateSlider() {
    const topP = this._pendingTop != null ? this._pendingTop : this._pos(this._config.entity_top);
    const botP = this._pendingBottom != null ? this._pendingBottom : this._pos(this._config.entity_bottom);
    const e = this._els;
    if (!e) return;

    e.curTop.style.left = `calc(${topP}% - 5px)`;
    e.curBot.style.left = `calc(${botP}% - 5px)`;
    e.fillTop.style.width = `${100 - topP}%`;
    e.fillBot.style.width = `${botP}%`;
    e.lblTop.textContent = `${Math.round(topP)}%`;
    e.lblBot.textContent = `${Math.round(botP)}%`;

    if (this._config.show_state !== false) {
      const unavail = this._state(this._config.entity_top) === 'unavailable' ||
                      this._state(this._config.entity_bottom) === 'unavailable';
      e.state.textContent = unavail ? 'Unavailable' : `Top ${Math.round(topP)}% · Bottom ${Math.round(botP)}%`;
    }
  }

  _update() {
    if (!this._built || !this._hass) return;
    const cfg = this._config;
    const e = this._els;
    const unavail = this._state(cfg.entity_top) === 'unavailable' || this._state(cfg.entity_bottom) === 'unavailable';

    e.icon.setAttribute('icon', cfg.icon || 'mdi:blinds-horizontal');
    e.iconWrap.classList.toggle('off', unavail);
    e.name.textContent = cfg.name || this._name(cfg.entity_top).replace(/\s*(top|boven|upper|motor|bovenkant).*$/i, '').trim() || 'Honeycomb Blind';
    e.state.style.display = cfg.show_state !== false ? '' : 'none';
    e.openBtn.disabled = unavail;
    e.stopBtn.disabled = unavail;
    e.closeBtn.disabled = unavail;
    this._updateSlider();
  }
}

customElements.define('honeycomb-blinds-slider-card', HoneycombBlindsSliderCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'honeycomb-blinds-slider-card',
  name: 'Honeycomb Blinds Slider Card',
  description: 'A card for plisse/honeycomb blinds with dual motors and dual-thumb slider.',
  preview: true,
  documentationURL: 'https://github.com/christianvaes/honeycomb-blinds-slider-card',
});

console.info(
  `%c HONEYCOMB-BLINDS-SLIDER %c v1.1.1 `,
  'color: white; background: #7b61ff; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #7b61ff; background: white; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0; border: 1px solid #7b61ff;'
);
