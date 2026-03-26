/**
 * Honeycomb Blinds Slider Card
 * Custom Home Assistant card for plisse/honeycomb blinds with dual motors.
 * Styled to match the native HA tile card with cover-position slider.
 *
 * @version 1.4.4
 */

class HoneycombBlindsSliderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._dragging = null;
    this._pendingTop = null;
    this._pendingBottom = null;
    this._targetTop = null;
    this._targetBot = null;
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

  _haPos(eid) {
    const s = this._hass?.states[eid];
    if (!s) return 0;
    const p = s.attributes.current_position;
    return p != null ? p : (s.state === 'open' ? 100 : 0);
  }

  // Slider: left=top of window, right=bottom of window
  // Top motor: HA 0% → slider 0% (left). Bottom motor: INVERTED, HA 0% → slider 100% (right).
  _toSlider(which, haPos) { return which === 'bottom' ? 100 - haPos : haPos; }
  _toHA(which, sliderPos) { return which === 'bottom' ? 100 - sliderPos : sliderPos; }

  _name(eid) { return this._hass?.states[eid]?.attributes?.friendly_name || eid; }
  _state(eid) { return this._hass?.states[eid]?.state || 'unavailable'; }
  _call(eid, svc, data) { this._hass.callService('cover', svc, { entity_id: eid, ...data }); }

  _buildDOM() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          --tile-color: var(--state-cover-active-color, rgb(189, 157, 255));
          height: 100%; padding: 0;
        }
        .wrap { display: flex; flex-direction: column; height: 100%; }

        /* Header */
        .header { display: flex; align-items: center; gap: 10px; padding: 10px; }
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

        /* Buttons: native ha-control-button = 100px wide, 12px gap, flex: 1 to fill evenly */
        .btn-row { display: flex; height: 42px; gap: 12px; }
        .btn-row button {
          flex: 1 1 0; display: flex; align-items: center; justify-content: center;
          height: 42px; border: none; background: none; cursor: pointer;
          color: rgb(228, 228, 231); --mdc-icon-size: 20px; padding: 0;
          border-radius: 12px; position: relative; overflow: hidden;
          min-width: 0;
        }
        .btn-row button::before {
          content: ''; position: absolute; inset: 0;
          background: rgb(61, 65, 85); opacity: 0.2;
        }
        .btn-row button:hover::before { opacity: 0.3; }
        .btn-row button:active::before { opacity: 0.4; }
        .btn-row button:disabled { opacity: 0.3; cursor: default; }
        .btn-row button:disabled:hover::before { opacity: 0.2; }

        /* Slider track */
        .slider {
          position: relative; width: 100%; height: 42px;
          border-radius: 12px; overflow: hidden;
          touch-action: none; cursor: pointer;
          user-select: none; -webkit-user-select: none;
        }
        /* Background: tile-color at 0.2 (same as native .slider-track-background) */
        .slider-bg {
          position: absolute; inset: 0;
          background: var(--tile-color); opacity: 0.2;
        }
        /* Fill between cursors = fabric. Full tile-color, like the native track-bar */
        .fill {
          position: absolute; top: 0; bottom: 0;
          background: var(--tile-color);
          pointer-events: none;
        }
        /* Cursor handle: native is ::after on track-bar, 4px wide, 21px tall, centered vertically, 5.25px from edge */
        .cur {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 4px; height: 21px; border-radius: 4px;
          background: rgb(255, 255, 255);
          pointer-events: none; z-index: 2;
        }
        .cur-left { left: 5.25px; }
        .cur-right { right: 5.25px; }

        /* Labels */
        .slider-labels { display: flex; justify-content: space-between; padding: 2px 2px 0; }
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
              <button id="openBtn"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
              <button id="stopBtn"><ha-icon icon="mdi:stop"></ha-icon></button>
              <button id="closeBtn"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
            </div>
            <div>
              <div class="slider" id="slider">
                <div class="slider-bg"></div>
                <div class="fill" id="fill">
                  <div class="cur cur-left" id="curTop"></div>
                  <div class="cur cur-right" id="curBot"></div>
                </div>
              </div>
              <div class="slider-labels">
                <div class="slider-label"><span class="dot dot-top"></span>Top <span id="lblTop"></span></div>
                <div class="slider-label"><span id="lblBot"></span> Bottom <span class="dot dot-bot"></span></div>
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
      slider: $('slider'), fill: $('fill'),
      curBot: $('curBot'), curTop: $('curTop'), lblBot: $('lblBot'), lblTop: $('lblTop'),
    };

    const cfg = this._config;
    this._els.openBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'open_cover', {});
      this._call(cfg.entity_bottom, 'open_cover', {});
    });
    this._els.stopBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'stop_cover', {});
      this._call(cfg.entity_bottom, 'stop_cover', {});
    });
    this._els.closeBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'close_cover', {});
      this._call(cfg.entity_bottom, 'close_cover', {});
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
    const topS = this._getSliderPos('top');
    const botS = this._getSliderPos('bottom');
    this._dragging = Math.abs(pct - topS) <= Math.abs(pct - botS) ? 'top' : 'bottom';
    if (this._dragging === 'top') this._pendingTop = pct; else this._pendingBottom = pct;
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
    if (this._dragging === 'top') this._pendingTop = pct; else this._pendingBottom = pct;
    this._updateSlider();
  }

  _onEnd() {
    if (this._dragging === 'top' && this._pendingTop != null) {
      this._targetTop = this._pendingTop;
      this._call(this._config.entity_top, 'set_cover_position', { position: Math.round(this._toHA('top', this._pendingTop)) });
    }
    if (this._dragging === 'bottom' && this._pendingBottom != null) {
      this._targetBot = this._pendingBottom;
      this._call(this._config.entity_bottom, 'set_cover_position', { position: Math.round(this._toHA('bottom', this._pendingBottom)) });
    }
    this._pendingTop = null;
    this._pendingBottom = null;
    this._dragging = null;
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onEnd);
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onEnd);
  }

  _getSliderPos(which) {
    const pending = which === 'top' ? this._pendingTop : this._pendingBottom;
    if (pending != null) return pending;
    const target = which === 'top' ? this._targetTop : this._targetBot;
    const eid = which === 'top' ? this._config.entity_top : this._config.entity_bottom;
    const haSlider = this._toSlider(which, this._haPos(eid));
    if (target != null) {
      if (Math.abs(haSlider - target) < 2) {
        if (which === 'top') this._targetTop = null; else this._targetBot = null;
        return haSlider;
      }
      return target;
    }
    return haSlider;
  }

  _updateSlider() {
    const e = this._els;
    if (!e) return;
    const topS = this._getSliderPos('top');
    const botS = this._getSliderPos('bottom');
    const topHA = this._toHA('top', topS);
    const botHA = this._toHA('bottom', botS);

    // Fill = fabric area between the two cursor positions
    const left = Math.min(topS, botS);
    const right = Math.max(topS, botS);
    e.fill.style.left = `${left}%`;
    e.fill.style.width = `${right - left}%`;

    // Cursors are children of fill, fixed at 5.25px from each edge via CSS
    // Swap classes so top cursor is on the correct side
    if (topS <= botS) {
      e.curTop.className = 'cur cur-left';
      e.curBot.className = 'cur cur-right';
    } else {
      e.curTop.className = 'cur cur-right';
      e.curBot.className = 'cur cur-left';
    }

    // Labels
    e.lblTop.textContent = `${Math.round(topHA)}%`;
    e.lblBot.textContent = `${Math.round(botHA)}%`;

    // State
    if (this._config.show_state !== false && this._hass) {
      const ts = this._state(this._config.entity_top);
      const bs = this._state(this._config.entity_bottom);
      if (ts === 'unavailable' || bs === 'unavailable') {
        e.state.textContent = this._hass.localize?.('state.default.unavailable') || 'Unavailable';
      } else if (ts === 'closed' && bs === 'closed') {
        e.state.textContent = this._hass.localize?.('component.cover.entity_component._.state.closed') || 'Closed';
      } else if (ts === 'open' && bs === 'open' && topHA >= 99 && botHA >= 99) {
        e.state.textContent = this._hass.localize?.('component.cover.entity_component._.state.open') || 'Open';
      } else {
        e.state.textContent = `Top ${Math.round(topHA)}% · Bottom ${Math.round(botHA)}%`;
      }
    }
  }

  _update() {
    if (!this._built || !this._hass) return;
    const cfg = this._config;
    const e = this._els;
    const unavail = this._state(cfg.entity_top) === 'unavailable' || this._state(cfg.entity_bottom) === 'unavailable';
    // Use configured icon, entity icon, or derive from device_class
    const topState = this._hass.states[cfg.entity_top];
    const deviceClass = topState?.attributes?.device_class || '';
    const entityIcon = topState?.attributes?.icon;
    const isClosed = topState?.state === 'closed';
    let defaultIcon = 'mdi:blinds-horizontal';
    if (deviceClass === 'shade') defaultIcon = isClosed ? 'mdi:roller-shade-closed' : 'mdi:roller-shade';
    else if (deviceClass === 'blind') defaultIcon = isClosed ? 'mdi:blinds-horizontal-closed' : 'mdi:blinds-horizontal';
    else if (deviceClass === 'curtain') defaultIcon = isClosed ? 'mdi:curtains-closed' : 'mdi:curtains';
    else if (deviceClass === 'shutter') defaultIcon = isClosed ? 'mdi:window-shutter' : 'mdi:window-shutter-open';
    e.icon.setAttribute('icon', cfg.icon || entityIcon || defaultIcon);
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
  `%c HONEYCOMB-BLINDS-SLIDER %c v1.4.4`,
  'color: white; background: #7b61ff; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #7b61ff; background: white; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0; border: 1px solid #7b61ff;'
);
