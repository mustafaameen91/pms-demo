import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';

import '../theme/theme.dart';
import 'brand.dart';
import 'common.dart';
import 'motion.dart';

/// Page pieces in the website's dashboard style (brand/README.md): a branded header on every
/// screen, stat tiles, panel titles with a count, and a friendly empty state.

/// A tab's header: the Graphite brand band with a frosted icon tile, a large white title and a
/// subtitle; it shrinks into a Graphite bar with the title as the page scrolls.
class BrandSliverHeader extends ConsumerWidget {
  const BrandSliverHeader({super.key, required this.title, required this.icon, this.subtitle, this.slug, this.actions});
  final String title;
  final IconData icon;

  /// Under the title; defaults to the company's name when [slug] is given.
  final String? subtitle;
  final String? slug;
  final List<Widget>? actions;

  static const _extra = 84.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final top = MediaQuery.paddingOf(context).top;
    final company = slug == null ? null : ref.watch(sessionProvider.select((s) => s.me?.workspace(slug!)?.name));
    final subtitle = this.subtitle ?? company;
    return SliverAppBar(
      pinned: true,
      expandedHeight: kToolbarHeight + _extra,
      // Transparent so the band's rounded bottom corners show the page behind them.
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      foregroundColor: Colors.white,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      scrolledUnderElevation: 0,
      elevation: 0,
      actions: actions == null ? null : [_OnBrand(child: Row(mainAxisSize: MainAxisSize.min, children: actions!))],
      flexibleSpace: LayoutBuilder(
        builder: (context, c) {
          final min = kToolbarHeight + top;
          final t = ((c.maxHeight - min) / _extra).clamp(0.0, 1.0);
          return HeroBackdrop(
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(Radii.xl)),
            child: Stack(
              children: [
                // Collapsed: the title in the bar.
                PositionedDirectional(
                  start: Navigator.canPop(context) ? 56 : Space.gutter,
                  end: 120,
                  top: top,
                  height: kToolbarHeight,
                  child: IgnorePointer(
                    child: Opacity(
                      opacity: (1 - t * 2).clamp(0.0, 1.0),
                      child: Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleLarge!.copyWith(color: Colors.white)),
                      ),
                    ),
                  ),
                ),
                // Expanded: icon tile, big title, subtitle.
                PositionedDirectional(
                  start: Space.gutter,
                  end: Space.gutter,
                  bottom: Space.lg,
                  child: Opacity(
                    opacity: ((t - 0.35) / 0.65).clamp(0.0, 1.0),
                    child: Transform.translate(
                      offset: Offset(0, 12 * (1 - t)),
                      child: Row(
                        children: [
                          GlassIcon(icon),
                          const SizedBox(width: Space.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Semantics(
                                  header: true,
                                  child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.headlineMedium!.copyWith(color: Colors.white)),
                                ),
                                if (subtitle != null)
                                  Text(
                                    subtitle,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: context.text.bodyMedium!.copyWith(color: Colors.white.withValues(alpha: 0.82)),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// The app bar for screens opened on top (a task, a project, a form): the Graphite brand band
/// with white title and icons.
class BrandAppBar extends StatelessWidget implements PreferredSizeWidget {
  const BrandAppBar({super.key, this.title, this.actions, this.bottom});
  final Widget? title;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;

  @override
  Size get preferredSize => Size.fromHeight(kToolbarHeight + (bottom?.preferredSize.height ?? 0));

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: title,
      actions: actions == null ? null : [_OnBrand(child: Row(mainAxisSize: MainAxisSize.min, children: actions!))],
      bottom: bottom,
      backgroundColor: context.palette.hero,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      titleTextStyle: context.text.titleLarge!.copyWith(color: Colors.white),
      flexibleSpace: const HeroBackdrop(),
    );
  }
}

/// Buttons and icons on the brand band read white.
class _OnBrand extends StatelessWidget {
  const _OnBrand({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        iconTheme: const IconThemeData(color: Colors.white),
        textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: Colors.white)),
        iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: Colors.white)),
      ),
      child: IconTheme.merge(data: const IconThemeData(color: Colors.white), child: child),
    );
  }
}

/// A white icon in a frosted tile (on the brand band).
class GlassIcon extends StatelessWidget {
  const GlassIcon(this.icon, {super.key, this.size = 52});
  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(size * 0.32),
      border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
    ),
    child: Icon(icon, size: size * 0.46, color: Colors.white),
  );
}

/// A Graphite tile with a white icon (on light/dark surfaces).
class BrandIcon extends StatelessWidget {
  const BrandIcon(this.icon, {super.key, this.size = 44});
  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(size * 0.32),
      color: Brand.graphite,
      border: Theme.of(context).brightness == Brightness.dark ? Border.all(color: Colors.white.withValues(alpha: 0.12)) : null,
      boxShadow: [BoxShadow(color: Brand.graphite.withValues(alpha: 0.22), blurRadius: 14, offset: const Offset(0, 6))],
    ),
    child: Icon(icon, size: size * 0.48, color: Colors.white),
  );
}

/// A headline number: label, big value, icon chip, a hint and (optionally) its share of a whole.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, required this.icon, this.tone = Tone.info, this.hint, this.share, this.onTap});
  final String label;
  final String value;
  final IconData icon;
  final Tone tone;
  final String? hint;

  /// 0–1, drawn as a thin bar.
  final double? share;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final bad = tone == Tone.danger;
    final tile = AppCard(
      padding: const EdgeInsets.all(Space.lg),
      child: MergeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(label, maxLines: 2, style: context.text.labelMedium!.copyWith(color: p.muted, fontWeight: FontWeight.w500))),
                ToneIcon(icon, tone: tone, size: 32),
              ],
            ),
            const SizedBox(height: Space.sm),
            Text(
              value,
              maxLines: 1,
              style: context.text.headlineMedium!.copyWith(color: bad ? p.danger : null, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
            if (hint != null) Text(hint!, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodySmall),
            if (share != null) ...[
              const SizedBox(height: Space.md),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(value: share!.clamp(0, 1), minHeight: 5, backgroundColor: p.neutralSoft, color: tone.fg(p)),
              ),
            ],
          ],
        ),
      ),
    );
    if (onTap == null) return tile;
    return GestureDetector(onTap: onTap, behavior: HitTestBehavior.opaque, child: tile);
  }
}

/// Stat tiles two to a row (four on wide screens), equal heights per row.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final perRow = MediaQuery.sizeOf(context).width >= 720 ? 4 : 2;
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += perRow) {
      final slice = children.sublist(i, (i + perRow).clamp(0, children.length));
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (j, c) in slice.indexed) ...[if (j > 0) const SizedBox(width: Space.md), Expanded(child: c)],
              for (var k = slice.length; k < perRow; k++) ...[const SizedBox(width: Space.md), const Expanded(child: SizedBox())],
            ],
          ),
        ),
      );
    }
    return Column(children: [for (final (i, r) in rows.indexed) ...[if (i > 0) const SizedBox(height: Space.md), r]]);
  }
}

/// A section title with an icon and a count pill, like the website's panels.
class PanelTitle extends StatelessWidget {
  const PanelTitle(this.title, {super.key, this.icon, this.count, this.danger = false, this.trailing});
  final String title;
  final IconData? icon;
  final int? count;
  final bool danger;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final fg = danger ? p.danger : null;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(Space.xs, Space.xxl, Space.xs, Space.md),
      child: Row(
        children: [
          if (icon != null) ...[Icon(icon, size: 20, color: danger ? p.danger : p.muted), const SizedBox(width: Space.sm)],
          Flexible(child: Semantics(header: true, child: Text(title, style: context.text.titleLarge!.copyWith(color: fg)))),
          if (count != null) ...[
            const SizedBox(width: Space.sm),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
              decoration: BoxDecoration(color: danger ? p.dangerSoft : p.neutralSoft, borderRadius: BorderRadius.circular(99)),
              child: CountText(count!, style: context.text.labelMedium!.copyWith(color: danger ? p.danger : p.muted, fontWeight: FontWeight.w700)),
            ),
          ],
          const Spacer(),
          ?trailing,
        ],
      ),
    );
  }
}
