# Honeycomb Blinds Slider Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card for controlling plisse/honeycomb blinds with **dual motors**. It provides a dual-thumb slider to independently control the top and bottom cover positions.

## Features

- Dual-thumb slider on a single track (top motor + bottom motor)
- Thumbs cannot cross each other, matching real-world blind behavior
- Open/Close/Stop buttons
  - **Open**: both motors move to fully open
  - **Close**: top stays up, bottom moves down (fully closed)
- Percentage labels for both positions
- Visual indicator showing the open area between the two motors
- Visual config editor (no YAML required)
- Styled to match the native Home Assistant tile card

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant instance
2. Go to **Frontend** > click the 3-dot menu > **Custom repositories**
3. Add `https://github.com/christianvaes/honeycomb-blinds-slider-card` with category **Lovelace**
4. Click **Install**
5. Refresh your browser

### Manual

1. Download `honeycomb-blinds-slider-card.js` from the [latest release](https://github.com/christianvaes/honeycomb-blinds-slider-card/releases)
2. Copy it to your `config/www/` directory
3. Add the resource in **Settings** > **Dashboards** > **Resources**:
   - URL: `/local/honeycomb-blinds-slider-card.js`
   - Type: JavaScript Module

## Configuration

### Using the UI

1. Go to your dashboard and click **Edit Dashboard**
2. Click **+ Add Card**
3. Search for **Honeycomb Blinds Slider Card**
4. Select your top and bottom cover entities

### YAML

```yaml
type: custom:honeycomb-blinds-slider-card
entity_top: cover.plisse_top_motor
entity_bottom: cover.plisse_bottom_motor
name: Living Room Plisse
show_state: true
```

### Options

| Option          | Type    | Required | Default | Description                        |
|-----------------|---------|----------|---------|------------------------------------|
| `entity_top`    | string  | Yes      | -       | Entity ID of the top motor cover   |
| `entity_bottom` | string  | Yes      | -       | Entity ID of the bottom motor cover|
| `name`          | string  | No       | Auto    | Custom name for the card           |
| `show_state`    | boolean | No       | `true`  | Show position percentages          |

## How It Works

A honeycomb/plisse blind with dual motors has independent top and bottom rails. The dual-thumb slider lets you:

- Drag the **top thumb** (blue) to control where the top of the fabric sits
- Drag the **bottom thumb** (orange) to control where the bottom of the fabric sits
- The colored zone between the thumbs represents the open/visible area

## License

MIT License - see [LICENSE](LICENSE) for details.
