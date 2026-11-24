# Sabtly brand

**Sabtly** (سبتلي): from السبت, Saturday, the day the work week starts. Project management for
teams, in Arabic and English.

The logo is an **"S" from two halves**: the plan (top) and the work done (bottom), meeting in
the middle. All SVGs have their text converted to outlines, so they look the same everywhere,
with or without the fonts.

## Files

| File | Use |
|---|---|
| `logo/sabtly-logo.svg` | Main logo (mark + "sabtly"), on light backgrounds |
| `logo/sabtly-logo-on-dark.svg` | The same, on dark backgrounds |
| `logo/sabtly-logo-ar.svg` · `-ar-on-dark.svg` | Arabic logo (سبتلي + mark, mark on the left as Arabic reads) |
| `logo/sabtly-logo-white.svg` · `-black.svg` | One colour: on photos, gradients, print, embroidery |
| `logo/sabtly-mark.svg` | The mark alone (gradient) |
| `logo/sabtly-mark-white.svg` · `-black.svg` | The mark alone, one colour |
| `logo/png/` | PNG copies for places that don't take SVG |
| `app-icon/sabtly-app-icon.svg` | App icon, full square (the stores round the corners) |
| `app-icon/sabtly-app-icon-1024.png` | App Store icon (1024 × 1024, no transparency) |
| `app-icon/play-store-512.png` | Google Play icon (512 × 512) |
| `app-icon/android-foreground.svg` · `-monochrome.svg` | Android adaptive and themed icon layers |
| `app-icon/launch-mark.svg` | The white tile shown while the app starts |
| `web/favicon.svg` · `favicon-32.png` · `favicon-16.png` | Browser tab |
| `web/apple-touch-icon.png` · `icon-192.png` · `icon-512.png` | Home-screen shortcut, web app manifest |
| `concepts/` | Earlier rounds, for reference |

The phone app's icons, launch screens and in-app logo (`mobile/lib/widgets/brand.dart`) are
already generated from these drawings.

## Colours

| Role | Hex | Notes |
|---|---|---|
| **Indigo** (brand) | `#6366F1` | Logo gradient start |
| **Violet** (brand) | `#A855F7` | Logo gradient end |
| Primary (buttons, links), light | `#4F46E5` | White text on it: 6.3 : 1 |
| Primary, dark mode | `#A5B4FC` | With `#11103A` text: 9.1 : 1 |
| Header gradient, light | `#7C3AED` → `#4338CA` | White text: 5.7–7.9 : 1 |
| Header gradient, dark | `#4C1D95` → `#1E1B4B` | |
| Accent (cyan) | `#22D3EE` | Highlights only, never body text on white |
| Ink (text) | `#0B1020` | On the page background: 17.7 : 1 |
| Secondary text | `#5B6075` | 5.8 : 1 |
| Page background | `#F7F7FB` (light) · `#0B0B14` (dark) | |
| Cards | `#FFFFFF` (light) · `#13131F` (dark) | |
| Borders | `#E1E3EE` (light) · white at 10 % (dark) | |

Status colours keep their meaning and never stand in for the brand: red = danger or late,
orange = warning, green = success. They always come with an icon or a word.

## Type

| | Font | Weights |
|---|---|---|
| Latin and numbers | **Plus Jakarta Sans** | ExtraBold 800 for the wordmark and big numbers; Bold/SemiBold for headings; Regular for text |
| Arabic | **IBM Plex Sans Arabic** | Bold for the wordmark and headings; Regular for text |

The wordmark is always lowercase, **sabtly**, with tracking at −3.5 %. In sentences, write the
name with a capital: "Sabtly". In Arabic: سبتلي.

Both fonts are free (SIL Open Font License, see `mobile/assets/fonts/`).

## Using the logo

- **Clear space:** keep empty space around the logo at least the width of one half of the "S".
- **Minimum size:** mark 16 px; full logo 80 px wide.
- **On colour or photos:** use the white version.
- **Don't:**
  - recolour the halves or flip their order
  - put the gradient mark on the violet header (use the white tile, as the app does)
  - stretch or rotate it
  - add shadows or outlines
  - set "sabtly" in another font
