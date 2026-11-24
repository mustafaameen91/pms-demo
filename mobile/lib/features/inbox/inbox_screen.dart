import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/work.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

/// My notifications. Tapping one marks it read and opens its task when the app has it.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final value = ref.watch(inboxProvider(slug));
    final data = value.value;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(inboxProvider(slug).future).then((_) {}, onError: (Object _) {}),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            BrandSliverHeader(
              title: l.inbox,
              icon: AppIcons.bell,
              slug: slug,
              actions: [
                if ((data?.unread ?? 0) > 0)
                  TextButton.icon(
                    onPressed: () => ref.read(inboxProvider(slug).notifier).markAllRead(),
                    icon: const Icon(AppIcons.checks, size: 18),
                    label: Text(l.markAllRead),
                  ),
                const SizedBox(width: Space.sm),
              ],
            ),
            // Breathing room between the header and the first card.
            const SliverToBoxAdapter(child: SizedBox(height: Space.lg)),
            if (data == null)
              SliverFillRemaining(
                // The skeleton is a list of its own.
                hasScrollBody: true,
                child: AsyncBody(value: value, onRetry: () => ref.invalidate(inboxProvider(slug)), builder: (_) => const SizedBox()),
              )
            else if (data.items.isEmpty)
              SliverToBoxAdapter(child: EmptyState(icon: AppIcons.bell, message: l.inboxEmpty))
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl + MediaQuery.paddingOf(context).bottom),
                sliver: SliverList.list(
                  children: [
                    // Unread first, then the rest, each in its own card (as on the website).
                    for (final (title, icon, items) in [
                      (l.inboxNew, AppIcons.bellFill, data.items.where((n) => !n.read).toList()),
                      (l.inboxEarlier, AppIcons.clockClockwise, data.items.where((n) => n.read).toList()),
                    ])
                      if (items.isNotEmpty) ...[
                        PanelTitle(title, icon: icon, count: items.length),
                        AppCard(
                          padding: EdgeInsets.zero,
                          child: Column(
                            children: [
                              for (final (i, n) in items.indexed) ...[
                                if (i > 0) const Divider(indent: 72),
                                _NoticeTile(
                                  key: ValueKey(n.id),
                                  notice: n,
                                  onTap: () {
                                    ref.read(inboxProvider(slug).notifier).markRead(n);
                                    if (n.taskKey != null) {
                                      context.push('/w/$slug/task/${n.taskKey}');
                                    } else {
                                      toast(context, l.onlyOnWebsite);
                                    }
                                  },
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _NoticeTile extends StatelessWidget {
  const _NoticeTile({super.key, required this.notice, required this.onTap});
  final Notice notice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final n = notice;
    return InkWell(
      onTap: onTap,
      child: Container(
        // Unread: a soft tint and an accent bar on the leading edge.
        decoration: BoxDecoration(
          color: n.read ? null : context.colors.primaryContainer.withValues(alpha: 0.22),
          border: n.read ? null : BorderDirectional(start: BorderSide(color: context.colors.primary, width: 3)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 44,
              child: n.actorName != null
                  ? InitialsAvatar(name: n.actorName!, size: 44)
                  : const ToneIcon(AppIcons.bell, tone: Tone.info, size: 44),
            ),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(n.title, textDirection: textDirOf(n.title), style: context.text.bodyLarge!.copyWith(fontWeight: n.read ? FontWeight.w400 : FontWeight.w600)),
                  if (n.body != null) ...[
                    const SizedBox(height: 2),
                    Text(n.body!, textDirection: textDirOf(n.body!), maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium!.copyWith(color: p.muted)),
                  ],
                  const SizedBox(height: 4),
                  Text(context.ago(n.createdAt), style: context.text.labelSmall!.copyWith(color: p.muted)),
                ],
              ),
            ),
            if (!n.read)
              Padding(
                padding: const EdgeInsetsDirectional.only(start: Space.sm, top: 6),
                child: Container(width: 10, height: 10, decoration: BoxDecoration(color: context.colors.primary, shape: BoxShape.circle)),
              ),
          ],
        ),
      ),
    );
  }
}
