import 'package:flutter/material.dart';

import '../core/api.dart';
import '../l10n/gen/app_localizations.dart';
import '../theme/theme.dart';
import 'motion.dart';

extension L10nX on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// The message to show for a failed request: the server's own (already in the
/// person's language) or ours when the server couldn't be reached.
String errorText(BuildContext context, Object error) {
  if (error is ApiException) {
    if (error.failure == ApiFailure.network) return context.l10n.networkError;
    if (error.message != null && error.message!.isNotEmpty) return error.message!;
  }
  return context.l10n.serverError;
}

/// What a number means, carried by colour *and* by its icon and label.
enum Tone { danger, warning, info, success, neutral }

extension ToneColors on Tone {
  Color fg(Palette p) => switch (this) {
    Tone.danger => p.danger,
    Tone.warning => p.warning,
    Tone.info => p.info,
    Tone.success => p.success,
    Tone.neutral => p.neutral,
  };

  Color bg(Palette p) => switch (this) {
    Tone.danger => p.dangerSoft,
    Tone.warning => p.warningSoft,
    Tone.info => p.infoSoft,
    Tone.success => p.successSoft,
    Tone.neutral => p.neutralSoft,
  };
}

class ToneIcon extends StatelessWidget {
  const ToneIcon(this.icon, {super.key, required this.tone, this.size = 40, this.quiet = false});
  final IconData icon;
  final Tone tone;
  final double size;

  /// Greyed out (e.g. the count is zero).
  final bool quiet;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: quiet ? p.neutralSoft : tone.bg(p),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(icon, size: size * 0.52, color: quiet ? p.muted : tone.fg(p)),
    );
  }
}

/// A white (or dark) card with a hairline border and a soft, cheap shadow.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(Space.lg)});
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: p.border),
        boxShadow: dark
            ? null
            : const [BoxShadow(color: Color(0x0F0E1A20), blurRadius: 24, offset: Offset(0, 10)), BoxShadow(color: Color(0x0A0E1A20), blurRadius: 3, offset: Offset(0, 1))],
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(Space.xs, Space.xxl, Space.xs, Space.md),
      child: Row(
        children: [
          Expanded(child: Semantics(header: true, child: Text(title, style: context.text.titleLarge))),
          ?trailing,
        ],
      ),
    );
  }
}

/// One labelled count: icon, label, number. At least 56 high.
class MetricRow extends StatelessWidget {
  const MetricRow({super.key, required this.icon, required this.label, required this.value, required this.tone});
  final IconData icon;
  final String label;
  final int value;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final zero = value == 0;
    return MergeSemantics(
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Row(
          children: [
            ToneIcon(icon, tone: tone, size: 38, quiet: zero),
            const SizedBox(width: Space.md),
            Expanded(child: Text(label, style: context.text.bodyLarge)),
            const SizedBox(width: Space.sm),
            Container(
              constraints: const BoxConstraints(minWidth: 36),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: zero ? Colors.transparent : tone.bg(p), borderRadius: BorderRadius.circular(99)),
              child: CountText(
                value,
                style: context.text.titleMedium!.copyWith(color: zero ? p.muted : tone.fg(p), fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A slim notice inside the page (offline, signed out…).
class InlineBanner extends StatelessWidget {
  const InlineBanner({super.key, required this.icon, required this.message, required this.tone, this.action});
  final IconData icon;
  final String message;
  final Tone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsetsDirectional.fromSTEB(Space.md, Space.md, Space.md, Space.md),
        decoration: BoxDecoration(color: tone.bg(p), borderRadius: BorderRadius.circular(Radii.md)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: tone.fg(p)),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Text(message, style: context.text.bodyMedium!.copyWith(color: tone.fg(p), fontWeight: FontWeight.w500)),
            ),
            ?action,
          ],
        ),
      ),
    );
  }
}

/// Full-width "couldn't load" with a way out.
class ErrorPanel extends StatelessWidget {
  const ErrorPanel({super.key, required this.icon, required this.title, this.message, this.actions = const []});
  final IconData icon;
  final String title;
  final String? message;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.xxl, vertical: Space.xxxl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: p.neutralSoft, shape: BoxShape.circle),
            child: Icon(icon, size: 34, color: p.muted),
          ),
          const SizedBox(height: Space.lg),
          Text(title, style: context.text.titleLarge, textAlign: TextAlign.center),
          if (message != null) ...[
            const SizedBox(height: Space.sm),
            Text(message!, style: context.text.bodyMedium!.copyWith(color: p.muted), textAlign: TextAlign.center),
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: Space.xl),
            Wrap(spacing: Space.md, runSpacing: Space.md, alignment: WrapAlignment.center, children: actions),
          ],
        ],
      ),
    );
  }
}
