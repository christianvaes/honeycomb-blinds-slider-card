/**
 * Honeycomb Blinds Slider Card
 * A custom Home Assistant Lovelace card for plisse/honeycomb blinds with dual motors.
 * Provides a dual-thumb slider to independently control top and bottom cover positions.
 *
 * @version 1.0.1
 */

const CARD_VERSION = '1.0.1';

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

  // ---- HA Config Form (native UI editor) ----

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'entity_top',
          required: true,
          selector: { entity: { domain: 'cover' } },
        },
        {
          name: 'entity_bottom',
          required: true,
          selector: { entity: { domain: 'cover' } },
        },
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
    const covers = Object.keys(hass.states).filter(
      (eid) => eid.startsWith('cover.')
    );
    return {
      entity_top: covers[0] || '',
      entity_bottom: covers[1] || covers[0] || '',
      show_state: true,
    };
  }

  // ---- HA Lifecycle ----

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    if (!this._config) return;

    const topEntity = this._config.entity_top;
    const bottomEntity = this._config.entity_bottom;

    // Only re-render if relevant states changed
    if (
      !oldHass ||
      !oldHass.states[topEntity] ||
      !oldHass.states[bottomEntity] ||
      oldHass.states[topEntity] !== hass.states[topEntity] ||
      oldHass.states[bottomEntity] !== hass.states[bottomEntity]
    ) {
      if (!this._dragging) {
        this._render();
      }
    }
  }

  setConfig(config) {
    if (!config.entity_top || !config.entity_bottom) {
      throw new Error('Please define both entity_top and entity_bottom');
    }
    this._config = {
      show_state: true,
      ...config,
    };
    if (this._hass) {
      this._render();
    }
  }

  getCardSize() {
    return 2;
  }

  // ---- Entity helpers ----

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

  // ---- Button handlers ----

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

    const topPos = this._pendingTop != null ? this._pendingTop : this._getPosition(this._config.entity_top);
    const bottomPos = this._pendingBottom != null ? this._pendingBottom : this._getPosition(this._config.entity_bottom);

    if (this._dragging === 'top') {
      this._pendingTop = Math.max(pct, bottomPos);
    } else {
      this._pendingBottom = Math.min(pct, topPos);
    }
    this._updateSliderVisuals();
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
    }
    if (this._dragging === 'bottom' && this._pendingBottom != null) {
      this._setPosition(this._config.entity_bottom, this._pendingBottom);
    }
    this._pendingTop = null;
    this._pendingBottom = null;
    this._dragging = null;
  }

  // ---- Visual updates (no full re-render during drag) ----

  _updateSliderVisuals() {
    const topThumb = this.shadowRoot.querySelector('.thumb-top');
    const bottomThumb = this.shadowRoot.querySelector('.thumb-bottom');
    const activeZone = this.shadowRoot.querySelector('.active-zone');
    const topLabel = this.shadowRoot.querySelector('.label-top');
    const bottomLabel = this.shadowRoot.querySelector('.label-bottom');
    const stateEl = this.shadowRoot.querySelector('.state');

    if (!topThumb || !bottomThumb) return;

    const topPos = this._pendingTop != null ? this._pendingTop : this._getPosition(this._config.entity_top);
    const bottomPos = this._pendingBottom != null ? this._pendingBottom : this._getPosition(this._config.entity_bottom);

    topThumb.style.left = `${topPos}%`;
    bottomThumb.style.left = `${bottomPos}%`;
    activeZone.style.left = `${bottomPos}%`;
    activeZone.style.width = `${Math.max(0, topPos - bottomPos)}%`;

    if (topLabel) {
      topLabel.textContent = `${Math.round(topPos)}%`;
      topLabel.style.left = `${topPos}%`;
    }
    if (bottomLabel) {
      bottomLabel.textContent = `${Math.round(bottomPos)}%`;
      bottomLabel.style.left = `${bottomPos}%`;
    }
    if (stateEl && this._config.show_state !== false) {
      stateEl.textContent = `Top ${Math.round(topPos)}% · Bottom ${Math.round(bottomPos)}%`;
    }
  }

  // ---- Full render ----

  _render() {
    if (!this._hass || !this._config) return;

    const topEntity = this._config.entity_top;
    const bottomEntity = this._config.entity_bottom;
    const topPos = this._getPosition(topEntity);
    const bottomPos = this._getPosition(bottomEntity);
    const icon = this._config.icon || 'mdi:blinds-horizontal';
    const name = this._config.name || this._getEntityName(topEntity).replace(/\s*(top|boven|upper|motor).*$/i, '').trim();
    const topState = this._getState(topEntity);
    const bottomState = this._getState(bottomEntity);
    const showState = this._config.show_state !== false;
    const isUnavailable = topState === 'unavailable' || bottomState === 'unavailable';

    let stateText = '';
    if (showState) {
      if (isUnavailable) {
        stateText = 'Unavailable';
      } else {
        stateText = `Top ${Math.round(topPos)}% · Bottom ${Math.round(bottomPos)}%`;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: 0;
          overflow: hidden;
        }
        .card-content {
          padding: 12px 12px 16px 12px;
        }

        /* Header */
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
          background: rgba(var(--rgb-state-cover, 255, 152, 0), 0.2);
          color: rgb(var(--rgb-state-cover, 255, 152, 0));
          flex-shrink: 0;
        }
        .icon-container.unavailable {
          background: rgba(var(--rgb-disabled, 189, 189, 189), 0.2);
          color: rgb(var(--rgb-disabled, 189, 189, 189));
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
          margin-top: 2px;
        }

        /* Buttons */
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
          background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.08);
        }
        .btn:active {
          background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.16);
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
          padding: 4px 0 28px 0;
          margin: 0 6px;
        }
        .slider-track {
          position: relative;
          width: 100%;
          height: 42px;
          border-radius: 12px;
          background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.05);
          cursor: pointer;
          touch-action: none;
          overflow: visible;
        }
        .active-zone {
          position: absolute;
          top: 0;
          bottom: 0;
          border-radius: 12px;
          background: rgba(var(--rgb-state-cover, 255, 152, 0), 0.2);
          pointer-events: none;
          transition: left 0.3s ease, width 0.3s ease;
        }
        .active-zone.dragging {
          transition: none;
        }
        .thumb {
          position: absolute;
          top: 50%;
          width: 20px;
          height: 32px;
          border-radius: 6px;
          background: rgb(var(--rgb-state-cover, 255, 152, 0));
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          transform: translate(-50%, -50%);
          cursor: grab;
          touch-action: none;
          z-index: 2;
          transition: left 0.3s ease;
        }
        .thumb.dragging {
          transition: none;
          cursor: grabbing;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }
        .thumb-top {
          background: rgb(var(--rgb-state-cover, 255, 152, 0));
        }
        .thumb-bottom {
          background: var(--primary-color, #03a9f4);
        }
        .slider-label {
          position: absolute;
          top: 100%;
          margin-top: 6px;
          transform: translateX(-50%);
          font-size: 11px;
          font-weight: 500;
          color: var(--secondary-text-color);
          white-space: nowrap;
          pointer-events: none;
          transition: left 0.3s ease;
        }
        .slider-label.dragging {
          transition: none;
        }
        .slider-legend {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          padding: 0 2px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--secondary-text-color);
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
        }
        .legend-dot.top {
          background: rgb(var(--rgb-state-cover, 255, 152, 0));
        }
        .legend-dot.bottom {
          background: var(--primary-color, #03a9f4);
        }
      </style>
      <ha-card>
        <div class="card-content">
          <div class="header">
            <div class="icon-container${isUnavailable ? ' unavailable' : ''}">
              <ha-icon icon="${icon}"></ha-icon>
            </div>
            <div class="info">
              <div class="name">${name}</div>
              ${showState ? `<div class="state">${stateText}</div>` : ''}
            </div>
            <div class="buttons">
              <button class="btn" id="btn-open" title="Open"${isUnavailable ? ' disabled' : ''}>
                <ha-icon icon="mdi:arrow-up"></ha-icon>
              </button>
              <button class="btn" id="btn-stop" title="Stop"${isUnavailable ? ' disabled' : ''}>
                <ha-icon icon="mdi:stop"></ha-icon>
              </button>
              <button class="btn" id="btn-close" title="Close"${isUnavailable ? ' disabled' : ''}>
                <ha-icon icon="mdi:arrow-down"></ha-icon>
              </button>
            </div>
          </div>
          <div class="slider-container">
            <div class="slider-track" id="slider-track">
              <div class="active-zone" style="left:${bottomPos}%;width:${Math.max(0, topPos - bottomPos)}%"></div>
              <div class="thumb thumb-top" style="left:${topPos}%"></div>
              <div class="thumb thumb-bottom" style="left:${bottomPos}%"></div>
            </div>
            <div class="slider-label label-top" style="left:${topPos}%">${Math.round(topPos)}%</div>
            <div class="slider-label label-bottom" style="left:${bottomPos}%">${Math.round(bottomPos)}%</div>
            <div class="slider-legend">
              <div class="legend-item"><span class="legend-dot top"></span>Top</div>
              <div class="legend-item"><span class="legend-dot bottom"></span>Bottom</div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    // Bind button events
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

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'honeycomb-blinds-slider-card',
  name: 'Honeycomb Blinds Slider Card',
  description: 'A card for controlling plisse/honeycomb blinds with dual motors via a dual-thumb slider.',
  preview: true,
  documentationURL: 'https://github.com/christianvaes/honeycomb-blinds-slider-card',
});

console.info(
  `%c HONEYCOMB-BLINDS-SLIDER %c v${CARD_VERSION} `,
  'color: white; background: #ff9800; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #ff9800; background: white; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0; border: 1px solid #ff9800;'
);
