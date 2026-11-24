# tamm brand

**tamm** (تمّ) is Arabic for "done": the word you say when a task is finished. Getting every task,
phase and project to "done" is what the system is for. Short, confident and easy to say in Arabic and
English.

The logo is **a T whose stem bends into a check mark**: the first letter of the name and the universal
sign of a finished task. The rounded square stands for order and control. Graphite brings focus and
reliability; coral marks the moment work gets done.

The full identity sheet is [`tamm-identity-sheet.svg`](tamm-identity-sheet.svg). The earlier
Sabtly identity is kept, untouched, in [`archive/sabtly/`](archive/sabtly/).

## Files

All logo SVGs carry the wordmark as outlines (taken from the identity sheet), so they look the same
with or without the fonts installed.

| File | Use |
|---|---|
| `logo/tamm-logo.svg` · `-on-dark.svg` | Main lockup: mark, "tamm", and تمّ under the end of the wordmark |
| `logo/tamm-logo-horizontal.svg` · `-on-dark.svg` | Mark + "tamm" only, for narrow bars |
| `logo/tamm-logo-white.svg` · `-black.svg` | One colour: photos, print, embossing (the T is knocked out of the tile) |
| `logo/tamm-mark.svg` | The mark: graphite tile, white bar, coral stem |
| `logo/tamm-mark-on-dark.svg` | The mark on dark backgrounds: white tile, graphite bar, coral stem |
| `logo/tamm-mark-white.svg` · `-black.svg` | The mark in one colour |
| `logo/png/` | PNG copies of the lockups and the mark |
| `app-icon/tamm-app-icon.svg` · `-1024.png` | App Store icon (full square, no transparency; the stores round it) |
| `app-icon/play-store-512.png` | Google Play icon |
| `app-icon/tamm-app-icon-rounded.svg` · `-512-rounded.png` | Rounded icon for slides, the web and documents |
| `app-icon/android-foreground.svg` · `-monochrome.svg` | Android adaptive and themed icon layers (background `#1F2933`) |
| `app-icon/launch-mark.svg` | The tile shown on the graphite launch screen |
| `web/favicon.svg` · `favicon.ico` · `favicon-16/32.png` | Browser tab (also in `src/app/`) |
| `web/apple-touch-icon.png` · `icon-192.png` · `icon-512.png` | Home-screen shortcuts |

## Colours

| Name | Hex | Role |
|---|---|---|
| **Graphite** | `#1F2933` | Primary: text, buttons, links, page bands. White on it: 14.8 : 1 |
| **Coral** | `#F2545B` | Accent: the check, active and "today" markers, milestones, highlights |
| **Slate** | `#52606D` | Secondary text (6.5 : 1 on white), focus rings |
| **Mist** | `#F3F4F6` | Muted surfaces, the sidebar |
| **Coral tint** | `#FDE2E3` | Soft coral fills behind coral items |

Rules that keep it accessible:

- **Coral is 3.4 : 1 on white**, enough for marks, bars and icons but not for words. When coral has to
  be text on a light surface, use **`#C93841`** (5.1 : 1 on white). On dark surfaces plain coral is fine (5.5 : 1).
- **Coral never means "error".** Errors use a deeper red (`#B42318` light, `#F97066` dark) and always
  come with an icon or a word. Success stays green, warnings amber, with an icon or a word too.
- Progress bars are graphite; red appears only when something is over (budget, date).

In code these are tokens, not hex: `primary`, `brand` (graphite bands), `brand-accent` (coral),
`brand-accent-text`, `brand-tint` in `src/app/globals.css`, and the app theme in
`mobile/lib/theme/theme.dart`. Dark mode uses `#0F1419` for the page, `#161D24` for cards and near-white
`#E8EBEF` for text and the primary; the graphite bands stay graphite.

## Type

| | Font | Weights |
|---|---|---|
| Latin and numbers | **Manrope** | ExtraBold 800 for the wordmark and big numbers, Bold 700 for headings, Regular to SemiBold for text |
| Arabic | **Readex Pro** | Medium 500 as on the sheet; SemiBold for the Arabic name in the logo |

The wordmark is always lowercase, **tamm**. In sentences write **Tamm**; in Arabic **تمّ** (with the shadda).
Both fonts are free (SIL Open Font License). The web app loads them with `next/font`.

## Using the logo

- **Clear space:** at least the width of the bar of the T on every side.
- **Minimum size:** mark 16 px; horizontal logo 80 px wide.
- **On dark or photos:** use the on-dark mark (white tile) or the one-colour white logo.
- The lockup doesn't mirror in Arabic: the mark stays on the left, تمّ under the end of "tamm".
- **Don't:** recolour the bar or the stem, swap their colours, straighten the stem, stretch or rotate
  the mark, add shadows or outlines, or set "tamm" in another font.
