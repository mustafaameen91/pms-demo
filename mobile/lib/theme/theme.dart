import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Colours come from the website's tokens (src/app/globals.css, design-system/pms/MASTER.md):
/// teal primary, orange accent, cool-neutral surfaces. Every text pair here is ≥ 4.5:1.
abstract final class Brand {
  static const teal900 = Color(0xFF134E4A);
  static const teal800 = Color(0xFF115E59);
  static const teal700 = Color(0xFF0F766E);
  static const teal600 = Color(0xFF0D9488);
  static const teal400 = Color(0xFF2DD4BF);
  static const teal100 = Color(0xFFCCFBF1);
  static const orange = Color(0xFFEA580C);
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
    required this.heroTop,
    required this.heroBottom,
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

  /// The teal header gradient.
  final Color heroTop, heroBottom;

  static const light = Palette(
    danger: Color(0xFFC10007),
    dangerSoft: Color(0xFFFEECEC),
    warning: Color(0xFFC2410C),
    warningSoft: Color(0xFFFFF1E8),
    success: Color(0xFF047857),
    successSoft: Color(0xFFE6F6F0),
    info: Color(0xFF0F766E),
    infoSoft: Color(0xFFE6F4F2),
    neutral: Color(0xFF475569),
    neutralSoft: Color(0xFFEFF3F5),
    muted: Color(0xFF58666D),
    border: Color(0xFFDDE4E6),
    card: Colors.white,
    heroTop: Color(0xFF0F766E),
    heroBottom: Color(0xFF0B4F4A),
  );

  static const dark = Palette(
    danger: Color(0xFFFF8A8C),
    dangerSoft: Color(0xFF3A1416),
    warning: Color(0xFFFFA24D),
    warningSoft: Color(0xFF3A2210),
    success: Color(0xFF5EE0B0),
    successSoft: Color(0xFF0F2E25),
    info: Color(0xFF00D5BE),
    infoSoft: Color(0xFF0C2A28),
    neutral: Color(0xFFB4C0C6),
    neutralSoft: Color(0xFF1D252A),
    muted: Color(0xFF9BA7AB),
    border: Color(0x1AFFFFFF),
    card: Color(0xFF10171B),
    heroTop: Color(0xFF0E5E58),
    heroBottom: Color(0xFF07302D),
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
      heroTop: l(heroTop, other.heroTop),
      heroBottom: l(heroBottom, other.heroBottom),
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

const _latin = 'PlusJakartaSans';
const _arabic = 'IBMPlexSansArabic';

ThemeData buildTheme(Brightness brightness, {required bool arabic}) {
  final dark = brightness == Brightness.dark;
  final p = dark ? Palette.dark : Palette.light;
  final scheme = dark
      ? const ColorScheme.dark(
          primary: Color(0xFF00D5BE),
          onPrimary: Color(0xFF001B1B),
          primaryContainer: Color(0xFF0C3B38),
          onPrimaryContainer: Color(0xFFB8F5EC),
          secondary: Color(0xFF9BA7AB),
          onSecondary: Color(0xFF0E1A20),
          tertiary: Color(0xFFFF8904),
          onTertiary: Color(0xFF261100),
          error: Color(0xFFFF6467),
          onError: Color(0xFF2A0004),
          surface: Color(0xFF090F13),
          onSurface: Color(0xFFEEF3F3),
          onSurfaceVariant: Color(0xFF9BA7AB),
          surfaceContainerLowest: Color(0xFF070C0F),
          surfaceContainerLow: Color(0xFF0D1418),
          surfaceContainer: Color(0xFF10171B),
          surfaceContainerHigh: Color(0xFF161F24),
          surfaceContainerHighest: Color(0xFF1D252A),
          outline: Color(0xFF3A464C),
          outlineVariant: Color(0x1AFFFFFF),
        )
      : const ColorScheme.light(
          primary: Brand.teal700,
          onPrimary: Colors.white,
          primaryContainer: Brand.teal100,
          onPrimaryContainer: Brand.teal900,
          secondary: Color(0xFF58666D),
          onSecondary: Colors.white,
          tertiary: Color(0xFFC2410C),
          onTertiary: Colors.white,
          error: Color(0xFFC10007),
          onError: Colors.white,
          surface: Color(0xFFF6F9F9),
          onSurface: Color(0xFF0E1A20),
          onSurfaceVariant: Color(0xFF58666D),
          surfaceContainerLowest: Colors.white,
          surfaceContainerLow: Color(0xFFFCFEFE),
          surfaceContainer: Color(0xFFEFF5F5),
          surfaceContainerHigh: Color(0xFFE8F0F0),
          surfaceContainerHighest: Color(0xFFE1EAEA),
          outline: Color(0xFFB9C5C8),
          outlineVariant: Color(0xFFDDE4E6),
        );

  // Arabic text reads best in IBM Plex Sans Arabic; Latin text and digits in
  // Plus Jakarta Sans — the same pairing as the website.
  final family = arabic ? _arabic : _latin;
  final fallback = [arabic ? _latin : _arabic];
  final base = ThemeData(brightness: brightness, colorScheme: scheme, fontFamily: family, fontFamilyFallback: fallback, useMaterial3: true);
  TextStyle s(TextStyle? t, double size, FontWeight w, {double? height, double spacing = 0}) =>
      t!.copyWith(fontSize: size, fontWeight: w, height: height, letterSpacing: spacing, color: scheme.onSurface);
  final tt = base.textTheme;
  // Arabic letters need a little more line height than Latin.
  final lh = arabic ? 1.45 : 1.3;
  final text = tt.copyWith(
    displaySmall: s(tt.displaySmall, 34, FontWeight.w800, height: 1.1, spacing: arabic ? 0 : -0.8),
    headlineMedium: s(tt.headlineMedium, 28, FontWeight.w800, height: 1.15, spacing: arabic ? 0 : -0.6),
    headlineSmall: s(tt.headlineSmall, 22, FontWeight.w700, height: lh, spacing: arabic ? 0 : -0.3),
    titleLarge: s(tt.titleLarge, 19, FontWeight.w700, height: lh, spacing: arabic ? 0 : -0.2),
    titleMedium: s(tt.titleMedium, 16, FontWeight.w600, height: lh),
    titleSmall: s(tt.titleSmall, 14, FontWeight.w600, height: lh),
    bodyLarge: s(tt.bodyLarge, 16, FontWeight.w400, height: 1.5),
    bodyMedium: s(tt.bodyMedium, 14.5, FontWeight.w400, height: 1.5),
    bodySmall: s(tt.bodySmall, 13, FontWeight.w400, height: 1.45).copyWith(color: p.muted),
    labelLarge: s(tt.labelLarge, 15, FontWeight.w600, height: 1.2),
    labelMedium: s(tt.labelMedium, 13, FontWeight.w600, height: 1.2),
    labelSmall: s(tt.labelSmall, 12, FontWeight.w600, height: 1.2, spacing: 0.2),
  );

  final fieldBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(Radii.md),
    borderSide: BorderSide(color: dark ? const Color(0xFF2A353B) : const Color(0xFFD4DDDE)),
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
      fillColor: dark ? const Color(0xFF10171B) : Colors.white,
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
      backgroundColor: dark ? const Color(0xFF10171B) : Colors.white,
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
