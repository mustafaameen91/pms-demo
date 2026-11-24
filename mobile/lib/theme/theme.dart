import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// tamm's colours (brand/README.md): Graphite for ink, primary actions and the brand band;
/// Coral for the check-mark moments (marks, active and "today" indicators, milestones).
/// Coral is never an error colour and never body text on light surfaces (3.4:1) — coral
/// text uses [coralText]/[Palette.accentText]. Every text pair here is ≥ 4.5:1.
abstract final class Brand {
  static const graphite = Color(0xFF1F2933);
  static const coral = Color(0xFFF2545B);
  static const slate = Color(0xFF52606D);
  static const mist = Color(0xFFF3F4F6);
  static const coralTint = Color(0xFFFDE2E3);

  /// Coral for text on light surfaces (5.1:1 on white).
  static const coralText = Color(0xFFC93841);
}

/// Status and surface colours the Material scheme has no slot for.
@immutable
class Palette extends ThemeExtension<Palette> {
  const Palette({
    required this.danger,
    required this.dangerSoft,
    required this.warning,
    required this.warningSoft,
    required this.success,
    required this.successSoft,
    required this.info,
    required this.infoSoft,
    required this.neutral,
    required this.neutralSoft,
    required this.muted,
    required this.border,
    required this.card,
    required this.hero,
    required this.accent,
    required this.accentText,
    required this.accentSoft,
  });

  final Color danger, dangerSoft;
  final Color warning, warningSoft;
  final Color success, successSoft;
  final Color info, infoSoft;
  final Color neutral, neutralSoft;

  /// Secondary text.
  final Color muted;
  final Color border;
  final Color card;

  /// The brand band behind headers (solid Graphite).
  final Color hero;

  /// Coral: [accent] for marks and indicators, [accentText] for coral text,
  /// [accentSoft] (coral tint) for highlighted fills.
  final Color accent, accentText, accentSoft;

  static const light = Palette(
    danger: Color(0xFFB42318),
    dangerSoft: Color(0xFFFEF0EE),
    warning: Color(0xFFB54708),
    warningSoft: Color(0xFFFFF4E5),
    success: Color(0xFF067647),
    successSoft: Color(0xFFE7F6EE),
    info: Brand.graphite,
    infoSoft: Color(0xFFE9ECF0),
    neutral: Brand.slate,
    neutralSoft: Brand.mist,
    muted: Brand.slate,
    border: Color(0xFFE5E7EB),
    card: Colors.white,
    hero: Brand.graphite,
    accent: Brand.coral,
    accentText: Brand.coralText,
    accentSoft: Brand.coralTint,
  );

  static const dark = Palette(
    danger: Color(0xFFF97066),
    dangerSoft: Color(0xFF3A1614),
    warning: Color(0xFFFDB022),
    warningSoft: Color(0xFF3A2710),
    success: Color(0xFF47CD89),
    successSoft: Color(0xFF0F2E21),
    info: Color(0xFFE8EBEF),
    infoSoft: Color(0xFF222C36),
    neutral: Color(0xFF9AA5B1),
    neutralSoft: Color(0xFF1C242D),
    muted: Color(0xFF9AA5B1),
    border: Color(0x1AFFFFFF),
    card: Color(0xFF161D24),
    hero: Brand.graphite,
    accent: Brand.coral,
    accentText: Color(0xFFF57C81),
    accentSoft: Color(0xFF3A1D20),
  );

  @override
  Palette copyWith() => this;

  @override
  Palette lerp(Palette? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return Palette(
      danger: l(danger, other.danger),
      dangerSoft: l(dangerSoft, other.dangerSoft),
      warning: l(warning, other.warning),
      warningSoft: l(warningSoft, other.warningSoft),
      success: l(success, other.success),
      successSoft: l(successSoft, other.successSoft),
      info: l(info, other.info),
      infoSoft: l(infoSoft, other.infoSoft),
      neutral: l(neutral, other.neutral),
      neutralSoft: l(neutralSoft, other.neutralSoft),
      muted: l(muted, other.muted),
      border: l(border, other.border),
      card: l(card, other.card),
      hero: l(hero, other.hero),
      accent: l(accent, other.accent),
      accentText: l(accentText, other.accentText),
      accentSoft: l(accentSoft, other.accentSoft),
    );
  }
}

extension ThemeX on BuildContext {
  Palette get palette => Theme.of(this).extension<Palette>()!;
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
}

/// 4/8-point spacing and the few radii the app uses.
abstract final class Space {
  static const xs = 4.0, sm = 8.0, md = 12.0, lg = 16.0, xl = 20.0, xxl = 24.0, xxxl = 32.0;
  static const gutter = 20.0;
}

abstract final class Radii {
  static const sm = 10.0, md = 14.0, lg = 20.0, xl = 28.0;
}

/// Motion tokens: one rhythm for the whole app.
abstract final class Motion {
  static const fast = Duration(milliseconds: 160);
  static const medium = Duration(milliseconds: 260);
  static const slow = Duration(milliseconds: 420);
  static const enter = Curves.easeOutCubic;
}

const _latin = 'Manrope';
const _arabic = 'ReadexPro';

ThemeData buildTheme(Brightness brightness, {required bool arabic}) {
  final dark = brightness == Brightness.dark;
  final p = dark ? Palette.dark : Palette.light;
  final scheme = dark
      ? const ColorScheme.dark(
          primary: Color(0xFFE8EBEF),
          onPrimary: Brand.graphite,
          primaryContainer: Color(0xFF2A3541),
          onPrimaryContainer: Color(0xFFE8EBEF),
          secondary: Color(0xFF9AA5B1),
          onSecondary: Color(0xFF0F1419),
          // Selected chips and the active tab: the coral tint, the brand's "done" moment.
          secondaryContainer: Color(0xFF3A1D20),
          onSecondaryContainer: Color(0xFFFDE2E3),
          tertiary: Color(0xFFF57C81),
          onTertiary: Color(0xFF2A0A0C),
          error: Color(0xFFF97066),
          onError: Color(0xFF2A0004),
          surface: Color(0xFF0F1419),
          onSurface: Color(0xFFE8EBEF),
          onSurfaceVariant: Color(0xFF9AA5B1),
          surfaceContainerLowest: Color(0xFF0A0E12),
          surfaceContainerLow: Color(0xFF12181E),
          surfaceContainer: Color(0xFF161D24),
          surfaceContainerHigh: Color(0xFF1C242D),
          surfaceContainerHighest: Color(0xFF222C36),
          outline: Color(0xFF3A4552),
          outlineVariant: Color(0x1AFFFFFF),
        )
      : const ColorScheme.light(
          primary: Brand.graphite,
          onPrimary: Colors.white,
          primaryContainer: Color(0xFFE9ECF0),
          onPrimaryContainer: Brand.graphite,
          secondary: Brand.slate,
          onSecondary: Colors.white,
          // Selected chips and the active tab: the coral tint, the brand's "done" moment.
          secondaryContainer: Brand.coralTint,
          onSecondaryContainer: Brand.graphite,
          tertiary: Brand.coralText,
          onTertiary: Colors.white,
          error: Color(0xFFB42318),
          onError: Colors.white,
          surface: Color(0xFFF7F8FA),
          onSurface: Brand.graphite,
          onSurfaceVariant: Brand.slate,
          surfaceContainerLowest: Colors.white,
          surfaceContainerLow: Color(0xFFFBFCFD),
          surfaceContainer: Brand.mist,
          surfaceContainerHigh: Color(0xFFECEEF1),
          surfaceContainerHighest: Color(0xFFE5E7EB),
          outline: Color(0xFFC3C9D1),
          outlineVariant: Color(0xFFE5E7EB),
        );

  // Arabic text in Readex Pro; Latin text and digits in Manrope — the same
  // pairing as the website.
  final family = arabic ? _arabic : _latin;
  final fallback = [arabic ? _latin : _arabic];
  final base = ThemeData(brightness: brightness, colorScheme: scheme, fontFamily: family, fontFamilyFallback: fallback, useMaterial3: true);
  TextStyle s(TextStyle? t, double size, FontWeight w, {double? height, double spacing = 0}) =>
      t!.copyWith(fontSize: size, fontWeight: w, height: height, letterSpacing: spacing, color: scheme.onSurface);
  final tt = base.textTheme;
  // Arabic letters need a little more line height than Latin.
  final lh = arabic ? 1.45 : 1.3;
  // The identity sets Readex Pro's text weight at Medium (500).
  final body = arabic ? FontWeight.w500 : FontWeight.w400;
  final text = tt.copyWith(
    displaySmall: s(tt.displaySmall, 34, FontWeight.w800, height: 1.1, spacing: arabic ? 0 : -0.8),
    headlineMedium: s(tt.headlineMedium, 28, FontWeight.w800, height: 1.15, spacing: arabic ? 0 : -0.6),
    headlineSmall: s(tt.headlineSmall, 22, FontWeight.w700, height: lh, spacing: arabic ? 0 : -0.3),
    titleLarge: s(tt.titleLarge, 19, FontWeight.w700, height: lh, spacing: arabic ? 0 : -0.2),
    titleMedium: s(tt.titleMedium, 16, FontWeight.w600, height: lh),
    titleSmall: s(tt.titleSmall, 14, FontWeight.w600, height: lh),
    bodyLarge: s(tt.bodyLarge, 16, body, height: 1.5),
    bodyMedium: s(tt.bodyMedium, 14.5, body, height: 1.5),
    bodySmall: s(tt.bodySmall, 13, body, height: 1.45).copyWith(color: p.muted),
    labelLarge: s(tt.labelLarge, 15, FontWeight.w600, height: 1.2),
    labelMedium: s(tt.labelMedium, 13, FontWeight.w600, height: 1.2),
    labelSmall: s(tt.labelSmall, 12, FontWeight.w600, height: 1.2, spacing: 0.2),
  );

  final fieldBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(Radii.md),
    borderSide: BorderSide(color: dark ? const Color(0xFF2A3541) : const Color(0xFFD9DDE3)),
  );

  return base.copyWith(
    textTheme: text,
    scaffoldBackgroundColor: scheme.surface,
    extensions: [p],
    splashFactory: InkSparkle.splashFactory,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge,
      systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF161D24) : Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 16),
      border: fieldBorder,
      enabledBorder: fieldBorder,
      focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: scheme.primary, width: 2)),
      errorBorder: fieldBorder.copyWith(borderSide: BorderSide(color: scheme.error)),
      focusedErrorBorder: fieldBorder.copyWith(borderSide: BorderSide(color: scheme.error, width: 2)),
      labelStyle: text.bodyLarge!.copyWith(color: p.muted),
      floatingLabelStyle: text.bodyLarge!.copyWith(color: scheme.primary, fontWeight: FontWeight.w600),
      errorStyle: text.bodySmall!.copyWith(color: scheme.error, fontWeight: FontWeight.w500),
      prefixIconColor: p.muted,
      suffixIconColor: p.muted,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        textStyle: text.labelLarge!.copyWith(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        side: BorderSide(color: p.border),
        textStyle: text.labelLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(minimumSize: const Size(48, 48), textStyle: text.labelLarge),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        minimumSize: const Size(0, 46),
        textStyle: text.labelMedium,
        side: BorderSide(color: p.border),
        selectedBackgroundColor: scheme.primaryContainer,
        selectedForegroundColor: scheme.onPrimaryContainer,
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: dark ? const Color(0xFF161D24) : Colors.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: p.border,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl))),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      contentTextStyle: text.bodyMedium!.copyWith(color: dark ? scheme.surface : Colors.white),
    ),
    dividerTheme: DividerThemeData(color: p.border, thickness: 1, space: 1),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary, linearTrackColor: Colors.transparent),
  );
}
