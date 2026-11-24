import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// The brand band: solid Graphite with a faint dot grid and one soft coral glow (the
/// logo-on-dark look). Painted once and cached in its own layer, so scrolling over it costs nothing.
class HeroBackdrop extends StatelessWidget {
  const HeroBackdrop({super.key, this.child, this.borderRadius});

  final Widget? child;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.zero,
      child: ColoredBox(
        color: p.hero,
        child: Stack(
          children: [
            const Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _DotsPainter()))),
            PositionedDirectional(top: -150, end: -110, child: _glow(Brand.coral, 320, 0.16)),
            ?child,
          ],
        ),
      ),
    );
  }

  static Widget _glow(Color c, double size, double alpha) => IgnorePointer(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [c.withValues(alpha: alpha), c.withValues(alpha: 0)]),
      ),
    ),
  );
}

class _DotsPainter extends CustomPainter {
  const _DotsPainter();

  @override
  void paint(Canvas canvas, Size size) {
    const step = 18.0;
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.07);
    for (var y = step / 2; y <= size.height; y += step) {
      for (var x = step / 2; x <= size.width; x += step) {
        canvas.drawCircle(Offset(x, y), 1, dot);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// The logo mark: a T whose stem bends into a check mark, on a rounded square.
/// Graphite tile on light surfaces; on dark ones (or `onDark: true`, e.g. the brand
/// band) a white tile with a graphite bar. The stem is always coral.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56, this.onDark});
  final double size;

  /// Defaults to the theme's brightness.
  final bool? onDark;

  @override
  Widget build(BuildContext context) {
    final dark = onDark ?? Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'tamm',
      image: true,
      child: CustomPaint(
        size: Size.square(size),
        painter: TMarkPainter(tile: dark ? Colors.white : Brand.graphite, bar: dark ? Brand.graphite : Colors.white),
      ),
    );
  }
}

/// Draws the mark on a 40 × 40 grid (the same drawing as brand/logo/tamm-mark.svg):
/// tile r=10, bar M11 13 H29, stem M20 13 V24 L24.5 28.5, stroke 4.5 with round ends.
class TMarkPainter extends CustomPainter {
  const TMarkPainter({this.tile = Brand.graphite, this.bar = Colors.white, this.stem = Brand.coral});

  /// `null` draws the bare T (no tile).
  final Color? tile;
  final Color bar, stem;

  @override
  void paint(Canvas canvas, Size size) {
    final u = size.shortestSide / 40;
    canvas.translate((size.width - 40 * u) / 2, (size.height - 40 * u) / 2);
    canvas.scale(u);
    if (tile != null) {
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 40, 40), const Radius.circular(10)), Paint()..color = tile!);
    }
    Paint line(Color c) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawLine(const Offset(11, 13), const Offset(29, 13), line(bar));
    canvas.drawPath(
      Path()
        ..moveTo(20, 13)
        ..lineTo(20, 24)
        ..lineTo(24.5, 28.5),
      line(stem),
    );
  }

  @override
  bool shouldRepaint(covariant TMarkPainter old) => old.tile != tile || old.bar != bar || old.stem != stem;
}

/// The wordmark: lowercase "tamm" (Manrope ExtraBold), or تمّ (Readex Pro) in Arabic.
class BrandWordmark extends StatelessWidget {
  const BrandWordmark({super.key, this.size = 28, this.color});
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final arabic = Localizations.localeOf(context).languageCode == 'ar';
    return Text(
      arabic ? 'تمّ' : 'tamm',
      style: TextStyle(
        fontFamily: arabic ? 'ReadexPro' : 'Manrope',
        fontWeight: arabic ? FontWeight.w600 : FontWeight.w800,
        fontSize: size,
        height: 1.15,
        letterSpacing: arabic ? 0 : -0.02 * size,
        color: color ?? context.colors.onSurface,
      ),
    );
  }
}

/// Initials in a tinted circle; the tint is stable per name.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.name, this.size = 44, this.onHero = false});
  final String name;
  final double size;
  final bool onHero;

  static const _tints = [Brand.graphite, Color(0xFF1D4ED8), Brand.coralText, Color(0xFFB54708), Color(0xFF067647), Color(0xFF6941C6)];

  @override
  Widget build(BuildContext context) {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final initials = words.isEmpty
        ? '?'
        : words.length == 1
        ? words.first.characters.first.toUpperCase()
        : '${words.first.characters.first}${words.last.characters.first}'.toUpperCase();
    final tint = _tints[name.hashCode.abs() % _tints.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: onHero ? Colors.white.withValues(alpha: 0.16) : tint.withValues(alpha: 0.12),
        border: onHero ? Border.all(color: Colors.white.withValues(alpha: 0.35)) : null,
      ),
      child: Text(
        initials,
        style: TextStyle(
          color: onHero ? Colors.white : tint,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
          height: 1,
        ),
      ),
    );
  }
}
