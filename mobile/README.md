# PMS phone app (Flutter)

One app for members and managers: after signing in it opens the home that fits
the person's role in each company. It talks only to the server's mobile API
(`docs/mobile-api.md`); every permission is decided by the server.

## Libraries

Only these, each approved by the owner. **Ask before adding any other package.**

| Package | For |
|---|---|
| flutter_riverpod | State (plain providers, no code generation) |
| go_router | Screens and redirects (login → company → home) |
| dio | Talking to the server |
| flutter_secure_storage | The sign-in token and saved screens (Keychain / Keystore) |
| flutter_localizations + intl | Arabic / English, dates |

Fonts are bundled files, not packages: Plus Jakarta Sans and IBM Plex Sans Arabic
(the website's pair), with their OFL licences in `assets/fonts/`.

## Run

```sh
cd mobile
flutter run --dart-define=API_URL=http://localhost:3001      # iOS simulator
flutter run --dart-define=API_URL=http://10.0.2.2:3001       # Android emulator
```

Release builds must point at the public `https://` address. Plain `http` is only
allowed in Android debug builds.

**Xcode 27:** `flutter build ios --simulator` fails in Flutter 3.44 (Xcode's
new `lipo`). Use `flutter run` for the simulator; device and App Store builds
are not affected.

## Tests

```sh
flutter test                                    # behaviour tests (fake server)
flutter test test/screenshots_test.dart --update-goldens --dart-define=SCREENSHOTS=true
flutter test test/live_api_test.dart --dart-define=LIVE_EMAIL=… --dart-define=LIVE_PASSWORD=…
```

Screenshots land in `test/screenshots/` (not committed).

## How it stays fast

- One Keychain read before the first frame; a signed-in person lands on their
  saved home with no spinner, and fresh numbers replace it a moment later.
- Token and language are read from memory on every request, never from storage.
- Screens watch only the slice of state they show (`select`), lists are lazy
  slivers, the header's grid is painted once into its own layer.
- Animations move only opacity and position, and switch off with the phone's
  reduced-motion setting.
- No automatic retries behind the person's back: every failure shows a clear
  message and a "Try again".

## Layout

```
lib/
  core/       api client, models, providers (session, language, theme, home), storage
  theme/      colours from the website's tokens, type scale, spacing, motion
  widgets/    header backdrop, brand mark, cards, metric rows, skeletons
  features/   login, companies, home (member / manager), account sheet
  l10n/       app_en.arb, app_ar.arb → generated AppLocalizations
```
