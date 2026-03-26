/**
 * Honeycomb Blinds Slider Card
 * A custom Home Assistant Lovelace card for plisse/honeycomb blinds with dual motors.
 * Provides a dual-thumb slider to independently control top and bottom cover positions.
 *
 * @version 1.0.0
 */

const CARD_VERSION = '1.0.0';

// ============================================================================
// Config Editor
// ============================================================================

class HoneycombBlindsSliderCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _render() {
    if (!this._hass) return;

    this.shadowRoot.innerHTML = `
      <style>
        .editor-row {
          margin-bottom: 16px;
        }
        .editor-row label {
          display: block;
          font-weight: 500;
          margin-bottom: 4px;
          color: var(--primary-text-color);
          font-size: 14px;
        }
        ha-entity-picker {
          display: block;
          width: 100%;
        }
        ha-textfield {
          display: block;
          width: 100%;
        }
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .switch-row label {
          font-weight: 500;
          color: var(--primary-text-color);
          font-size: 14px;
        }
      </style>
      <div class="editor-row">
        <label>Top Motor Entity</label>
        <ha-entity-picker
          id="entity_top"
          .hass="${this._hass}"
          .value="${this._config.entity_top || ''}"
          .includeDomains="${['cover']}"
          allow-custom-entity
        ></ha-entity-picker>
      </div>
      <div class="editor-row">
        <label>Bottom Motor Entity</label>
        <ha-entity-picker
          id="entity_bottom"
          .hass="${this._hass}"
          .value="${this._config.entity_bottom || ''}"
          .includeDomains="${['cover']}"
          allow-custom-entity
        ></ha-entity-picker>
      </div>
      <div class="editor-row">
        <label>Name (optional)</label>
        <ha-textfield
          id="name"
          .value="${this._config.name || ''}"
          placeholder="Auto-detected from entity"
        ></ha-textfield>
      </div>
      <div class="switch-row">
        <label>Show State</label>
        <ha-switch
          id="show_state"
          .checked="${this._config.show_state !== false}"
        ></ha-switch>
      </div>
    `;

    // Bind events after rendering
    this.shadowRoot.getElementById('entity_top').addEventListener('value-changed', (e) => {
      this._updateConfig('entity_top', e.detail.value);
    });
    this.shadowRoot.getElementById('entity_bottom').addEventListener('value-changed', (e) => {
      this._updateConfig('entity_bottom', e.detail.value);
    });
    this.shadowRoot.getElementById('name').addEventListener('change', (e) => {
      this._updateConfig('name', e.target.value);
    });
    this.shadowRoot.getElementById('show_state').addEventListener('change', (e) => {
      this._updateConfig('show_state', e.target.checked);
    });
  }

  _updateConfig(key, value) {
    this._config = { ...this._config, [key]: value };
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

customElements.define('honeycomb-blinds-slider-card-editor', HoneycombBlindsSliderCardEditor);

// ============================================================================
// Main Card
// ============================================================================

class HoneycombBlindsSliderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._dragging = null; // 'top' or 'bottom'
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);
  }

  static getConfigElement() {
    return document.createElement('honeycomb-blinds-slider-card-editor');
  }

  static getStubConfig() {
    return {
      entity_top: '',
      entity_bottom: '',
      name: '',
      show_state: true,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.entity_top || !config.entity_bottom) {
      throw new Error('Please define both entity_top and entity_bottom');
    }
    this._config = {
      show_state: true,
      ...config,
    };
  }

  getCardSize() {
    return 2;
  }

  // Get cover position (HA: 0=closed, 100=open)
  _getPosition(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return 0;
    const state = this._hass.states[entityId];
    const pos = state.attributes.current_position;
    return pos != null ? pos : (state.state === 'open' ? 100 : 0);
  }

  _getEntityName(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return entityId;
    return this._hass.states[entityId].attributes.friendly_name || entityId;
  }

  _getState(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return 'unavailable';
    return this._hass.states[entityId].state;
  }

  _callService(entityId, service, data = {}) {
    this._hass.callService('cover', service, {
      entity_id: entityId,
      ...data,
    });
  }

  _setPosition(entityId, position) {
    this._callService(entityId, 'set_cover_position', {
      position: Math.round(position),
    });
  }

  _handleOpen() {
    this._setPosition(this._config.entity_top, 100);
    this._setPosition(this._config.entity_bottom, 100);
  }

  _handleClose() {
    this._setPosition(this._config.entity_top, 100);
    this._setPosition(this._config.entity_bottom, 0);
  }

  _handleStop() {
    this._callService(this._config.entity_top, 'stop_cover');
    this._callService(this._config.entity_bottom, 'stop_cover');
  }

  // ---- Slider drag logic ----

  _getSliderTrack() {
    return this.shadowRoot.querySelector('.slider-track');
  }

  _positionFromEvent(e) {
    const track = this._getSliderTrack();
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  _onThumbDown(which, e) {
    e.preventDefault();
    e.stopPropagation();
    this._dragging = which;
    if (e.type === 'touchstart') {
      document.addEventListener('touchmove', this._boundTouchMove, { passive: false });
      document.addEventListener('touchend', this._boundTouchEnd);
    } else {
      document.addEventListener('mousemove', this._boundMouseMove);
      document.addEventListener('mouseup', this._boundMouseUp);
    }
  }

  _onMouseMove(e) {
    this._handleDrag(e);
  }

  _onTouchMove(e) {
    e.preventDefault();
    this._handleDrag(e);
  }

  _handleDrag(e) {
    if (!this._dragging) return;
    const pct = this._positionFromEvent(e);
    if (pct === null) return;

    const topPos = this._getPosition(this._config.entity_top);
    const bottomPos = this._getPosition(this._config.entity_bottom);

    if (this._dragging === 'top') {
      // Top thumb must stay >= bottom thumb
      const clamped = Math.max(pct, bottomPos);
      this._pendingTop = clamped;
    } else {
      // Bottom thumb must stay <= top thumb
      const clamped = Math.min(pct, topPos);
      this._pendingBottom = clamped;
    }
    this._renderSlider();
  }

  _onMouseUp() {
    this._finishDrag();
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
  }

  _onTouchEnd() {
    this._finishDrag();
    document.removeEventListener('touchmove', this._boundTouchMove);
    document.removeEventListener('touchend', this._boundTouchEnd);
  }

  _finishDrag() {
    if (this._dragging === 'top' && this._pendingTop != null) {
      this._setPosition(this._config.entity_top, this._pendingTop);
      this._pendingTop = null;
    }
    if (this._dragging === 'bottom' && this._pendingBottom != null) {
      this._setPosition(this._config.entity_bottom, this._pendingBottom);
      this._pendingBottom = null;
    }
    this._dragging = null;
  }

  // ---- Rendering ----

  _renderSlider() {
    const topThumb = this.shadowRoot.querySelector('.thumb-top');
    const bottomThumb = this.shadowRoot.querySelector('.thumb-bottom');
    const activeZone = this.shadowRoot.querySelector('.active-zone');
    const topLabel = this.shadowRoot.querySelector('.label-top');
    const bottomLabel = this.shadowRoot.querySelector('.label-bottom');

    if (!topThumb || !bottomThumb) return;

    const topPos = this._pendingTop != null ? this._pendingTop : this._getPosition(this._config.entity_top);
    const bottomPos = this._pendingBottom != null ? this._pendingBottom : this._getPosition(this._config.entity_bottom);

    topThumb.style.left = `${topPos}%`;
    bottomThumb.style.left = `${bottomPos}%`;
    activeZone.style.left = `${bottomPos}%`;
    activeZone.style.width = `${topPos - bottomPos}%`;
    topLabel.textContent = `${Math.round(topPos)}%`;
    bottomLabel.textContent = `${Math.round(bottomPos)}%`;
    topLabel.style.left = `${topPos}%`;
    bottomLabel.style.left = `${bottomPos}%`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const topEntity = this._config.entity_top;
    const bottomEntity = this._config.entity_bottom;
    const topPos = this._getPosition(topEntity);
    const bottomPos = this._getPosition(bottomEntity);
    const name = this._config.name || this._getEntityName(topEntity).replace(/\s*(top|boven|upper).*$/i, '');
    const topState = this._getState(topEntity);
    const bottomState = this._getState(bottomEntity);
    const showState = this._config.show_state !== false;

    let stateText = '';
    if (showState) {
      if (topState === 'unavailable' || bottomState === 'unavailable') {
        stateText = 'Unavailable';
      } else {
        stateText = `Top ${Math.round(topPos)}% · Bottom ${Math.round(bottomPos)}%`;
      }
    }

    const isUnavailable = topState === 'unavailable' || bottomState === 'unavailable';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: 0;
          overflow: hidden;
          --ha-card-border-radius: var(--ha-card-border-radius, 12px);
        }
        .card-content {
          padding: 12px 12px 16px 12px;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .icon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--state-cover-active-color, var(--state-active-color, rgba(var(--rgb-state-cover), 0.2)));
          color: var(--state-cover-icon-color, var(--state-icon-color, var(--primary-color)));
          flex-shrink: 0;
        }
        .icon-container.unavailable {
          background: rgba(var(--rgb-disabled), 0.2);
          color: var(--disabled-color);
        }
        .icon-container ha-icon {
          --mdc-icon-size: 24px;
        }
        .info {
          flex: 1;
          min-width: 0;
        }
        .name {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .state {
          font-size: 12px;
          color: var(--secondary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .buttons {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--primary-text-color);
          transition: background 0.2s;
          padding: 0;
        }
        .btn:hover {
          background: rgba(var(--rgb-primary-text-color, 0,0,0), 0.1);
        }
        .btn:active {
          background: rgba(var(--rgb-primary-text-color, 0,0,0), 0.2);
        }
        .btn ha-icon {
          --mdc-icon-size: 20px;
        }
        .btn:disabled {
          color: var(--disabled-color);
          cursor: not-allowed;
        }
        .btn:disabled:hover {
          background: none;
        }

        /* Slider */
        .slider-container {
          position: relative;
          padding: 8px 0 24px 0;
          margin: 0 6px;
        }
        .slider-track {
          position: relative;
          width: 100%;
          height: 40px;
          border-radius: 20px;
          background: var(--card-background-color, var(--ha-card-background, #f0f0f0));
          border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
          cursor: pointer;
          touch-action: none;
          overflow: visible;
        }
        .active-zone {
          position: absolute;
          top: 2px;
          bottom: 2px;
          border-radius: 18px;
          background: var(--state-cover-active-color, var(--primary-color));
          opacity: 0.3;
          pointer-events: none;
          transition: ${this._dragging ? 'none' : 'left 0.3s, width 0.3s'};
        }
        .thumb {
          position: absolute;
          top: 50%;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--primary-color);
          border: 3px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          transform: translate(-50%, -50%);
          cursor: grab;
          touch-action: none;
          z-index: 2;
          transition: ${this._dragging ? 'none' : 'left 0.3s'};
        }
        .thumb:active {
          cursor: grabbing;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .thumb-top {
          background: var(--primary-color);
        }
        .thumb-bottom {
          background: var(--state-cover-active-color, var(--accent-color, #ff9800));
        }
        .slider-label {
          position: absolute;
          top: 100%;
          margin-top: 4px;
          transform: translateX(-50%);
          font-size: 11px;
          color: var(--secondary-text-color);
          white-space: nowrap;
          pointer-events: none;
          transition: ${this._dragging ? 'none' : 'left 0.3s'};
        }
        .slider-legend {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          padding: 0 2px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--secondary-text-color);
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .legend-dot.top {
          background: var(--primary-color);
        }
        .legend-dot.bottom {
          background: var(--state-cover-active-color, var(--accent-color, #ff9800));
        }
      </style>
      <ha-card>
        <div class="card-content">
          <div class="header">
            <div class="icon-container ${isUnavailable ? 'unavailable' : ''}">
              <ha-icon icon="mdi:blinds-horizontal"></ha-icon>
            </div>
            <div class="info">
              <div class="name">${name}</div>
              ${showState ? `<div class="state">${stateText}</div>` : ''}
            </div>
            <div class="buttons">
              <button class="btn" id="btn-open" title="Open" ${isUnavailable ? 'disabled' : ''}>
                <ha-icon icon="mdi:arrow-up"></ha-icon>
              </button>
              <button class="btn" id="btn-stop" title="Stop" ${isUnavailable ? 'disabled' : ''}>
                <ha-icon icon="mdi:stop"></ha-icon>
              </button>
              <button class="btn" id="btn-close" title="Close" ${isUnavailable ? 'disabled' : ''}>
                <ha-icon icon="mdi:arrow-down"></ha-icon>
              </button>
            </div>
          </div>
          <div class="slider-container">
            <div class="slider-track" id="slider-track">
              <div class="active-zone" style="left:${bottomPos}%;width:${topPos - bottomPos}%"></div>
              <div class="thumb thumb-top" style="left:${topPos}%"></div>
              <div class="thumb thumb-bottom" style="left:${bottomPos}%"></div>
            </div>
            <div class="slider-label label-top" style="left:${topPos}%">${Math.round(topPos)}%</div>
            <div class="slider-label label-bottom" style="left:${bottomPos}%">${Math.round(bottomPos)}%</div>
            <div class="slider-legend">
              <div class="legend-item">
                <span class="legend-dot top"></span> Top
              </div>
              <div class="legend-item">
                <span class="legend-dot bottom"></span> Bottom
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    // Bind events
    if (!isUnavailable) {
      this.shadowRoot.getElementById('btn-open').addEventListener('click', () => this._handleOpen());
      this.shadowRoot.getElementById('btn-stop').addEventListener('click', () => this._handleStop());
      this.shadowRoot.getElementById('btn-close').addEventListener('click', () => this._handleClose());

      const topThumb = this.shadowRoot.querySelector('.thumb-top');
      const bottomThumb = this.shadowRoot.querySelector('.thumb-bottom');

      topThumb.addEventListener('mousedown', (e) => this._onThumbDown('top', e));
      topThumb.addEventListener('touchstart', (e) => this._onThumbDown('top', e), { passive: false });
      bottomThumb.addEventListener('mousedown', (e) => this._onThumbDown('bottom', e));
      bottomThumb.addEventListener('touchstart', (e) => this._onThumbDown('bottom', e), { passive: false });
    }
  }
}

customElements.define('honeycomb-blinds-slider-card', HoneycombBlindsSliderCard);

// Register with Home Assistant card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'honeycomb-blinds-slider-card',
  name: 'Honeycomb Blinds Slider Card',
  description: 'A card for controlling plisse/honeycomb blinds with dual motors via a dual-thumb slider.',
  preview: true,
  documentationURL: 'https://github.com/christianvaes/honeycomb-blinds-slider-card',
});

console.info(
  `%c HONEYCOMB-BLINDS-SLIDER-CARD %c v${CARD_VERSION} `,
  'color: white; background: #3498db; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #3498db; background: white; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0; border: 1px solid #3498db;'
);
