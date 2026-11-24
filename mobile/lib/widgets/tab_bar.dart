import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/theme.dart';

class TabItem {
  const TabItem({required this.icon, required this.selectedIcon, required this.label, this.count = 0});
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final int count;
}

/// The floating, frosted tab bar. The open tab grows into a brand-coloured pill with its
/// label; the others show their icon only (label on long-press and for screen
/// readers). Widths animate together, so the bar never changes size.
class FloatingTabBar extends StatelessWidget {
  const FloatingTabBar({super.key, required this.items, required this.selected, required this.onSelect});
  final List<TabItem> items;
  final int selected;
  final ValueChanged<int> onSelect;

  static const height = 64.0;
  static const _inset = 6.0;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final safe = MediaQuery.viewPaddingOf(context).bottom;
    // Sit just above the home indicator; on phones without one, lift off the edge.
    final bottom = safe > 0 ? math.max(Space.md, safe - Space.sm) : Space.md;
    final label = context.text.labelMedium!.copyWith(color: context.colors.onPrimary);
    final scaler = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.2);

    return Padding(
      padding: EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, bottom),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(height / 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: dark ? 0.45 : 0.10),
              blurRadius: 28,
              offset: const Offset(0, 10),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: dark ? 0.25 : 0.04),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(height / 2),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: Container(
              height: height,
              padding: const EdgeInsets.all(_inset),
              decoration: BoxDecoration(
                color: p.card.withValues(alpha: dark ? 0.78 : 0.86),
                borderRadius: BorderRadius.circular(height / 2),
                border: Border.all(color: p.border.withValues(alpha: dark ? 1 : 0.7)),
              ),
              child: LayoutBuilder(
                builder: (context, c) {
                  // The open tab is as wide as its icon + label (within reason); the rest share what's left.
                  final text = TextPainter(
                    text: TextSpan(text: items[selected].label, style: label),
                    textDirection: Directionality.of(context),
                    textScaler: scaler,
                    maxLines: 1,
                  )..layout();
                  final want = 22 + Space.sm + text.width + Space.lg * 2 + 2;
                  text.dispose();
                  final open = want.clamp(c.maxWidth / items.length, c.maxWidth * 0.44);
                  final rest = (c.maxWidth - open) / (items.length - 1);
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final (i, item) in items.indexed)
                        _Tab(
                          item: item,
                          selected: i == selected,
                          width: i == selected ? open : rest,
                          labelStyle: label,
                          scaler: scaler,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            onSelect(i);
                          },
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.item, required this.selected, required this.width, required this.labelStyle, required this.scaler, required this.onTap});
  final TabItem item;
  final bool selected;
  final double width;
  final TextStyle labelStyle;
  final TextScaler scaler;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final p = context.palette;
    final fg = selected ? colors.onPrimary : p.muted;
    final count = item.count;

    Widget icon = AnimatedSwitcher(
      duration: Motion.fast,
      transitionBuilder: (child, a) => ScaleTransition(
        scale: Tween(begin: 0.8, end: 1.0).animate(a),
        child: FadeTransition(opacity: a, child: child),
      ),
      child: Icon(selected ? item.selectedIcon : item.icon, key: ValueKey(selected), size: 22, color: fg),
    );
    // The open tab's screen shows its own counts; elsewhere the badge sits on the icon's outer corner.
    if (count > 0 && !selected) {
      icon = Badge(label: Text(count > 99 ? '99+' : '$count'), backgroundColor: p.danger, textColor: Colors.white, offset: Offset(Directionality.of(context) == TextDirection.rtl ? -8 : 8, -6), child: icon);
    }

    return Semantics(
      button: true,
      selected: selected,
      label: count > 0 ? '${item.label}, $count' : item.label,
      excludeSemantics: true,
      child: Tooltip(
        message: item.label,
        excludeFromSemantics: true,
        triggerMode: selected ? TooltipTriggerMode.manual : TooltipTriggerMode.longPress,
        child: AnimatedContainer(
          duration: Motion.medium,
          curve: Motion.enter,
          width: width,
          decoration: BoxDecoration(color: selected ? colors.primary : colors.primary.withValues(alpha: 0), borderRadius: BorderRadius.circular(99)),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: onTap,
              customBorder: const StadiumBorder(),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  icon,
                  if (selected)
                    Flexible(
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0, end: 1),
                        duration: Motion.medium,
                        curve: Motion.enter,
                        builder: (_, t, child) => Opacity(opacity: t, child: child),
                        child: Padding(
                          padding: const EdgeInsetsDirectional.only(start: Space.sm),
                          child: Text(item.label, maxLines: 1, softWrap: false, overflow: TextOverflow.fade, textScaler: scaler, style: labelStyle),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
