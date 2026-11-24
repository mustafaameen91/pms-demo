import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/manage.dart';
import '../../core/manage_models.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

/// The projects I manage, most in need of attention first (the website's dashboard order).
class ProjectsScreen extends ConsumerWidget {
  const ProjectsScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final value = ref.watch(healthProvider(slug));
    final data = value.value;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(healthProvider(slug).future).then((_) {}, onError: (Object _) {}),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            BrandSliverHeader(title: l.navProjects, icon: AppIcons.buildings, slug: slug),
            // Breathing room between the header and the first card.
            const SliverToBoxAdapter(child: SizedBox(height: Space.lg)),
            if (data == null)
              SliverFillRemaining(
                hasScrollBody: true,
                child: AsyncBody(value: value, onRetry: () => ref.invalidate(healthProvider(slug)), builder: (_) => const SizedBox()),
              )
            else if (data.isEmpty)
              SliverToBoxAdapter(child: EmptyState(icon: AppIcons.folderDashed, message: l.noManagedProjects))
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl + MediaQuery.paddingOf(context).bottom),
                sliver: SliverList.separated(
                  itemCount: data.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.md),
                  itemBuilder: (context, i) => ProjectHealthCard(
                    key: ValueKey(data[i].id),
                    project: data[i],
                    onTap: () => context.push('/w/$slug/project/${data[i].id}'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Ahead / On track / Behind, with an icon (never colour alone).
class ScheduleChip extends StatelessWidget {
  const ScheduleChip(this.schedule, {super.key});
  final Schedule? schedule;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = schedule;
    if (s == null) return const SizedBox.shrink();
    final (tone, icon, label) = switch (s) {
      Schedule.ahead => (Tone.success, AppIcons.trendUp, l.ahead),
      Schedule.onTrack => (Tone.info, AppIcons.check, l.onTrack),
      Schedule.behind => (Tone.danger, AppIcons.trendDown, l.behind),
    };
    return Pill(icon: icon, label: label, tone: tone);
  }
}

class Pill extends StatelessWidget {
  const Pill({super.key, required this.icon, required this.label, required this.tone});
  final IconData icon;
  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: tone.bg(p), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: tone.fg(p)),
          const SizedBox(width: 4),
          Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelSmall!.copyWith(color: tone.fg(p)))),
        ],
      ),
    );
  }
}

/// Work done, with a tick where it should be today.
class ProgressMeter extends StatelessWidget {
  const ProgressMeter({super.key, required this.actual, this.planned, this.height = 10});
  final double actual;
  final double? planned;
  final double height;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final a = (actual / 100).clamp(0.0, 1.0);
    final pl = planned == null ? null : (planned! / 100).clamp(0.0, 1.0);
    final behind = pl != null && a + 0.005 < pl;
    return LayoutBuilder(
      builder: (context, c) => SizedBox(
        height: height + 8,
        child: Stack(
          alignment: AlignmentDirectional.centerStart,
          children: [
            Container(height: height, decoration: BoxDecoration(color: p.neutralSoft, borderRadius: BorderRadius.circular(99))),
            Container(
              width: c.maxWidth * a,
              height: height,
              decoration: BoxDecoration(color: behind ? p.warning : context.colors.primary, borderRadius: BorderRadius.circular(99)),
            ),
            if (pl != null)
              PositionedDirectional(
                start: (c.maxWidth * pl - 1.5).clamp(0, c.maxWidth - 3),
                child: Container(width: 3, height: height + 8, decoration: BoxDecoration(color: context.colors.onSurface, borderRadius: BorderRadius.circular(2))),
              ),
          ],
        ),
      ),
    );
  }
}

class ProjectHealthCard extends StatelessWidget {
  const ProjectHealthCard({super.key, required this.project, required this.onTap});
  final ProjectHealthRow project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final x = project;
    return Material(
      color: p.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg), side: BorderSide(color: x.overBudget || x.schedule == Schedule.behind ? p.danger.withValues(alpha: 0.35) : p.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: Color(parseHex(x.color) ?? Brand.graphite.toARGB32()), borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: Space.sm),
                  Expanded(child: Text(x.name, style: context.text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  ScheduleChip(x.schedule),
                ],
              ),
              const SizedBox(height: Space.md),
              Row(
                children: [
                  Text(
                    x.actual == null ? '—' : '${x.actual!.round()}%',
                    style: context.text.headlineSmall!.copyWith(fontFeatures: const [FontFeature.tabularFigures()], height: 1),
                  ),
                  const SizedBox(width: Space.sm),
                  if (x.planned != null) Text('${l.planned} ${x.planned!.round()}%', style: context.text.bodySmall),
                ],
              ),
              const SizedBox(height: Space.xs),
              ProgressMeter(actual: x.actual ?? 0, planned: x.planned),
              const SizedBox(height: Space.sm),
              Text(
                x.budget == null ? '${l.spent} ${context.money(x.spent, x.currency)} · ${l.noBudget}' : '${l.spent} ${context.money(x.spent, x.currency)} / ${context.money(x.budget!, x.currency)}${x.usedPct == null ? '' : ' (${x.usedPct!.round()}%)'}',
                style: context.text.bodySmall,
              ),
              const SizedBox(height: Space.sm),
              Wrap(
                spacing: Space.sm,
                runSpacing: 4,
                children: [
                  if (x.overBudget) Pill(icon: AppIcons.coins, label: l.overBudget, tone: Tone.danger),
                  if (x.headingOver) Pill(icon: AppIcons.gauge, label: l.headingOver, tone: Tone.warning),
                  if (x.late > 0) Pill(icon: AppIcons.calendarX, label: l.lateCount(x.late), tone: Tone.danger),
                  if (x.overdue && x.daysLeft != null)
                    Pill(icon: AppIcons.flagFill, label: l.daysOverdue(-x.daysLeft!), tone: Tone.danger)
                  else if (x.daysLeft != null)
                    Pill(icon: AppIcons.flag, label: l.daysLeft(x.daysLeft!), tone: Tone.neutral),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
