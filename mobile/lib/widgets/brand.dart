import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// The teal header: a deep gradient with a faint engineering-blueprint grid.
/// Painted once and cached in its own layer, so scrolling over it costs nothing.
class BlueprintBackdrop extends StatelessWidget {
  const BlueprintBackdrop({super.key, this.child, this.borderRadius});

  final Widget? child;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.zero,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: AlignmentDirectional.topStart,
            end: AlignmentDirectional.bottomEnd,
            colors: [p.heroTop, p.heroBottom],
          ),
        ),
        child: Stack(
          children: [
            const Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _GridPainter()))),
            // A soft glow in the top corner gives the flat gradient some depth.
            PositionedDirectional(
              top: -120,
              end: -80,
              child: IgnorePointer(
                child: Container(
                  width: 300,
                  height: 300,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(colors: [Brand.teal400.withValues(alpha: 0.28), Brand.teal400.withValues(alpha: 0)]),
                  ),
                ),
              ),
            ),
            ?child,
          ],
        ),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  const _GridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    const step = 22.0;
    final minor = Paint()
      ..color = Colors.white.withValues(alpha: 0.045)
      ..strokeWidth = 1;
    final major = Paint()
      ..color = Colors.white.withValues(alpha: 0.085)
      ..strokeWidth = 1;
    var i = 0;
    for (var x = 0.0; x <= size.width; x += step, i++) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), i % 5 == 0 ? major : minor);
    }
    i = 0;
    for (var y = 0.0; y <= size.height; y += step, i++) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), i % 5 == 0 ? major : minor);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// The app's mark: three schedule bars, like a small Gantt chart.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))],
      ),
      child: CustomPaint(painter: _MarkPainter()),
    );
  }
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final u = size.width / 56;
    final h = 7.5 * u;
    final r = Radius.circular(h / 2);
    void bar(double x, double y, double w, Color c) =>
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x * u, y * u, w * u, h), r), Paint()..color = c);
    bar(13, 15, 22, Brand.teal700);
    bar(20, 24.5, 23, Brand.teal600);
    bar(13, 34, 14, Brand.orange);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Initials in a tinted circle; the tint is stable per name.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.name, this.size = 44, this.onHero = false});
  final String name;
  final double size;
  final bool onHero;

  static const _tints = [Color(0xFF0F766E), Color(0xFF1D4ED8), Color(0xFF7C3AED), Color(0xFFC2410C), Color(0xFF047857), Color(0xFFBE185D)];

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
