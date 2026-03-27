/**
 * Honeycomb Blinds Slider Card
 * Custom Home Assistant card for plisse/honeycomb blinds with dual motors.
 * Styled to match the native HA tile card with cover-position slider.
 *
 * @version 1.9.0
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

        /* Buttons */
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

        /* Slider wrapper: allows tooltip to overflow above */
        .slider-wrap {
          position: relative;
        }
        /* Slider track */
        .slider {
          position: relative; width: 100%; height: 42px;
          border-radius: 12px; overflow: hidden;
          touch-action: none; cursor: pointer;
          user-select: none; -webkit-user-select: none;
        }
        .slider-bg {
          position: absolute; inset: 0;
          background: var(--tile-color); opacity: 0.2;
        }
        /* Fill = fabric. Matches native track-bar border-radius */
        .fill {
          position: absolute; top: 0; bottom: 0;
          background: var(--tile-color);
          border-radius: 8px;
          pointer-events: none;
        }
        /* Cursor handle: matches native ::after on track-bar */
        .cur {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 4px; height: 21px; border-radius: 4px;
          background: rgb(255, 255, 255);
          pointer-events: none; z-index: 2;
        }

        /* Tooltip: sits OUTSIDE .slider (in .slider-wrap) so not clipped by overflow:hidden */
        .tooltip {
          position: absolute; bottom: 46px;
          background: var(--card-background-color, rgb(46, 48, 56));
          color: var(--primary-text-color, rgb(228, 228, 231));
          font-size: 14px; font-weight: 400; line-height: 1.6;
          padding: 2.8px 5.6px; border-radius: 12px;
          white-space: nowrap; pointer-events: none;
          opacity: 0; transition: opacity 0.18s ease-in-out;
          transform: translateX(-50%); z-index: 10;
        }
        .tooltip.visible { opacity: 1; }

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
              <div class="slider-wrap">
                <div class="tooltip" id="tipTop"></div>
                <div class="tooltip" id="tipBot"></div>
                <div class="slider" id="slider">
                  <div class="slider-bg"></div>
                  <div class="fill" id="fill"></div>
                  <div class="cur" id="curTop"></div>
                  <div class="cur" id="curBot"></div>
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
      tipTop: $('tipTop'), tipBot: $('tipBot'),
    };

    const cfg = this._config;
    // Open = fabric gathered at top: top motor closed (0%), bottom motor open (100%)
    this._els.openBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'close_cover', {});
      this._call(cfg.entity_bottom, 'open_cover', {});
    });
    this._els.stopBtn.addEventListener('click', () => {
      this._call(cfg.entity_top, 'stop_cover', {});
      this._call(cfg.entity_bottom, 'stop_cover', {});
    });
    // Close = fabric covers window: both motors closed (0%)
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

  // Slider position for a motor: pending (while dragging) or live HA value
  _getRawSliderPos(which) {
    const pending = which === 'top' ? this._pendingTop : this._pendingBottom;
    if (pending != null) return pending;
    const eid = which === 'top' ? this._config.entity_top : this._config.entity_bottom;
    return this._toSlider(which, this._haPos(eid));
  }

  // Display positions: ensures leftPos <= rightPos for rendering.
  // Returns which motor is on which side.
  _getDisplayPositions() {
    const rawTop = this._getRawSliderPos('top');
    const rawBot = this._getRawSliderPos('bottom');
    if (rawTop <= rawBot) {
      return { leftPos: rawTop, rightPos: rawBot, leftMotor: 'top', rightMotor: 'bottom' };
    } else {
      // Crossed: swap so left <= right
      return { leftPos: rawBot, rightPos: rawTop, leftMotor: 'bottom', rightMotor: 'top' };
    }
  }

  _onStart(e) {
    e.preventDefault();
    const pct = this._pct(e);
    const rawTop = this._getRawSliderPos('top');
    const rawBot = this._getRawSliderPos('bottom');
    const { leftPos, rightPos, leftMotor, rightMotor } = this._getDisplayPositions();

    // Smart thumb selection
    if (Math.abs(leftPos - rightPos) < 3) {
      // Both at same spot: pick based on which side has room to move
      // At left edge → grab rightMotor (to move it right). At right edge → grab leftMotor (to move it left).
      if (leftPos < 50) {
        this._dragging = rightMotor;
      } else {
        this._dragging = leftMotor;
      }
    } else {
      // Normal: pick closest to click position
      const distLeft = Math.abs(pct - leftPos);
      const distRight = Math.abs(pct - rightPos);
      this._dragging = distLeft <= distRight ? leftMotor : rightMotor;
    }

    // Clamp: the dragged motor cannot cross the other motor's raw position
    const otherRaw = this._dragging === 'top' ? rawBot : rawTop;
    if (this._dragging === 'top') {
      this._pendingTop = Math.min(pct, otherRaw);
    } else {
      this._pendingBottom = Math.max(pct, otherRaw);
    }

    this._showTooltip();
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

    // Clamp against the OTHER motor's current HA position
    const otherPos = this._getRawSliderPos(this._dragging === 'top' ? 'bottom' : 'top');

    if (this._dragging === 'top') {
      this._pendingTop = Math.min(pct, otherPos);
    } else {
      this._pendingBottom = Math.max(pct, otherPos);
    }
    this._updateSlider();
  }

  _onEnd() {
    if (this._dragging === 'top' && this._pendingTop != null) {
      this._call(this._config.entity_top, 'set_cover_position', { position: Math.round(this._toHA('top', this._pendingTop)) });
    }
    if (this._dragging === 'bottom' && this._pendingBottom != null) {
      this._call(this._config.entity_bottom, 'set_cover_position', { position: Math.round(this._toHA('bottom', this._pendingBottom)) });
    }
    this._hideTooltip();
    this._pendingTop = null;
    this._pendingBottom = null;
    this._dragging = null;
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onEnd);
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onEnd);
  }

  _showTooltip() {
    if (!this._els) return;
    const tip = this._dragging === 'top' ? this._els.tipTop : this._els.tipBot;
    tip?.classList.add('visible');
  }

  _hideTooltip() {
    this._els?.tipTop?.classList.remove('visible');
    this._els?.tipBot?.classList.remove('visible');
  }

  _updateSlider() {
    const e = this._els;
    if (!e) return;
    const { leftPos, rightPos } = this._getDisplayPositions();
    const rawTop = this._getRawSliderPos('top');
    const rawBot = this._getRawSliderPos('bottom');
    const topHA = this._toHA('top', rawTop);
    const botHA = this._toHA('bottom', rawBot);

    const sliderW = e.slider.offsetWidth || 1;
    const INSET = 5.25;
    const CUR_W = 4;

    // Native HA approach: track-bar is always 100% wide, shifted via transform.
    // At value=0 the visible portion = 2*handle-margin + handle-size = 14.5px.
    // We replicate this: fill extends from leftPos to rightPos, with a minimum
    // visible width of 14.5px (same as native). No border-radius on the clipped
    // side when at the edge, so it looks identical to native.
    const MIN_VIS = 2 * INSET + CUR_W; // 14.5px - exact native minimum
    const fillLeftPx = (leftPos / 100) * sliderW;
    const fillRightPx = (rightPos / 100) * sliderW;
    let fillL = fillLeftPx;
    let fillR = fillRightPx;
    const collapsed = (fillR - fillL) < MIN_VIS;

    if (collapsed) {
      // Both at same spot: expand to minimum, anchored to position
      const center = (fillL + fillR) / 2;
      fillL = Math.max(0, center - MIN_VIS / 2);
      fillR = fillL + MIN_VIS;
      if (fillR > sliderW) { fillR = sliderW; fillL = fillR - MIN_VIS; }
    }

    const fillW = fillR - fillL;
    e.fill.style.left = `${fillL}px`;
    e.fill.style.width = `${fillW}px`;
    // Remove border-radius on edges touching the slider edge (native behavior)
    const rL = fillL < 1 ? '0' : '8px';
    const rR = (fillL + fillW) > (sliderW - 1) ? '0' : '8px';
    e.fill.style.borderRadius = `${rL} ${rR} ${rR} ${rL}`;

    // Cursors with native 5.25px inset
    if (collapsed) {
      // Single cursor centered in the minimum fill (like native at 0%/100%)
      const curPx = fillL + INSET;
      e.curTop.style.left = `${curPx}px`;
      e.curBot.style.left = `${curPx}px`;
    } else {
      e.curTop.style.left = `${fillL + INSET}px`;
      e.curBot.style.left = `${fillR - INSET - CUR_W}px`;
    }

    // Tooltips: positioned in .slider-wrap (outside overflow:hidden)
    const topCurCenter = parseFloat(e.curTop.style.left) + CUR_W / 2;
    const botCurCenter = parseFloat(e.curBot.style.left) + CUR_W / 2;
    e.tipTop.textContent = `${Math.round(topHA)}%`;
    e.tipBot.textContent = `${Math.round(botHA)}%`;
    e.tipTop.style.left = `${topCurCenter}px`;
    e.tipBot.style.left = `${botCurCenter}px`;

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
        // Both motors closed = fabric covers entire window
        e.state.textContent = this._hass.localize?.('component.cover.entity_component._.state.closed') || 'Gesloten';
      } else if (ts === 'closed' && bs === 'open' && botHA >= 99) {
        // Top closed + bottom fully open = fabric gathered at top = open
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
    const topSt = this._hass.states[cfg.entity_top]?.state;
    const botSt = this._hass.states[cfg.entity_bottom]?.state;
    // Honeycomb blind states:
    // - "Fully open" (fabric gathered at top) = top closed (0%) + bottom fully open (100%)
    // - "Fully closed" (fabric covers window) = both closed (0%)
    const botPos = this._haPos(cfg.entity_bottom);
    const topPos = this._haPos(cfg.entity_top);
    const isFullyOpen = topPos <= 0 && botPos >= 100;
    const allClosed = topSt === 'closed' && botSt === 'closed';
    const isMoving = topSt === 'opening' || topSt === 'closing'
                  || botSt === 'opening' || botSt === 'closing';
    e.openBtn.disabled = unavail || isFullyOpen;
    e.stopBtn.disabled = unavail || !isMoving;
    e.closeBtn.disabled = unavail || allClosed;
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
  `%c HONEYCOMB-BLINDS-SLIDER %c v1.9.0`,
  'color: white; background: #7b61ff; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #7b61ff; background: white; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0; border: 1px solid #7b61ff;'
);
