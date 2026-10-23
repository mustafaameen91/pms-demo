import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Fades and lifts its child in once, after [delay]. Only opacity and a
/// translation are animated (no layout), and nothing moves when the phone asks
/// for reduced motion.
class Entrance extends StatefulWidget {
  const Entrance({super.key, required this.child, this.delay = Duration.zero});
  final Widget child;
  final Duration delay;

  @override
  State<Entrance> createState() => _EntranceState();
}

class _EntranceState extends State<Entrance> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.slow);
  late final Animation<double> _t = CurvedAnimation(parent: _c, curve: Motion.enter);
  Timer? _start;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_start != null || _c.isAnimating || _c.isCompleted) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 1;
    } else if (widget.delay == Duration.zero) {
      _c.forward();
    } else {
      _start = Timer(widget.delay, _c.forward);
    }
  }

  @override
  void dispose() {
    _start?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _t,
      child: AnimatedBuilder(
        animation: _t,
        builder: (context, child) => Transform.translate(offset: Offset(0, 14 * (1 - _t.value)), child: child),
        child: widget.child,
      ),
    );
  }
}

/// A number that counts to its new value. Tabular digits, so nothing jiggles.
class CountText extends StatelessWidget {
  const CountText(this.value, {super.key, required this.style});
  final int value;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final s = style.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    if (MediaQuery.disableAnimationsOf(context)) return Text('$value', style: s);
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value.toDouble()),
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Text('${v.round()}', style: s),
    );
  }
}

/// Grey placeholders that breathe while the first data loads. One animation
/// drives the whole skeleton, so it stays cheap however many boxes there are.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.child});
  final Widget child;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  late final Animation<double> _opacity = Tween(begin: 0.45, end: 1.0).animate(_c);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 0.5;
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: FadeTransition(opacity: _opacity, child: widget.child),
    );
  }
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, required this.height, this.radius = Radii.sm});
  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(color: context.colors.surfaceContainerHighest, borderRadius: BorderRadius.circular(radius)),
    );
  }
}
