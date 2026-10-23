import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../account/account_sheet.dart';

/// Site work and money: site log, photos, expenses and receipts, my loans; then settings.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final me = ref.watch(sessionProvider.select((s) => s.me));
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.medium(title: Text(l.navMore), pinned: true),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl),
            sliver: SliverList.list(
              children: [
                _Tile(icon: Icons.assignment_rounded, tone: Tone.info, title: l.siteLog, subtitle: l.siteLogHint, onTap: () => context.push('/w/$slug/site-log')),
                const SizedBox(height: Space.md),
                _Tile(icon: Icons.photo_library_rounded, tone: Tone.success, title: l.photos, subtitle: l.photosHint, onTap: () => context.push('/w/$slug/photos')),
                const SizedBox(height: Space.md),
                _Tile(icon: Icons.receipt_long_rounded, tone: Tone.warning, title: l.expensesReceipts, subtitle: l.expensesHint, onTap: () => context.push('/w/$slug/expenses')),
                const SizedBox(height: Space.md),
                _Tile(icon: Icons.payments_rounded, tone: Tone.neutral, title: l.myLoans, subtitle: l.loansHint, onTap: () => context.push('/w/$slug/loans')),
                const SizedBox(height: Space.xxl),
                if (me != null)
                  _Tile(
                    leading: InitialsAvatar(name: me.user.name, size: 40),
                    title: l.settings,
                    subtitle: me.user.email,
                    onTap: () => showAccountSheet(context),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({this.icon, this.tone = Tone.info, this.leading, required this.title, required this.subtitle, required this.onTap});
  final IconData? icon;
  final Tone tone;
  final Widget? leading;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: p.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg), side: BorderSide(color: p.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Row(
            children: [
              leading ?? ToneIcon(icon!, tone: tone, size: 44),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.text.titleMedium),
                    const SizedBox(height: 2),
                    Text(subtitle, style: context.text.bodySmall),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: p.muted),
            ],
          ),
        ),
      ),
    );
  }
}
