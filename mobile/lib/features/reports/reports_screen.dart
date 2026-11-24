import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/manage.dart';
import '../../core/manage_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../projects/projects_screen.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

/// Every Saturday, last week for the projects I manage.
class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final value = ref.watch(reportsProvider(slug));
    return Scaffold(
      appBar: BrandAppBar(title: Text(l.weeklyReports)),
      body: AsyncBody(
        value: value,
        onRetry: () => ref.invalidate(reportsProvider(slug)),
        builder: (weeks) => RefreshIndicator(
          onRefresh: () => ref.refresh(reportsProvider(slug).future).then((_) {}, onError: (Object _) {}),
          child: weeks.isEmpty
              ? ListView(children: [EmptyState(icon: AppIcons.chartBar, message: l.noReports)])
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl),
                  itemCount: weeks.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.md),
                  itemBuilder: (context, i) {
                    final w = weeks[i];
                    final h = w.headline;
                    return Material(
                      color: context.palette.card,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg), side: BorderSide(color: context.palette.border)),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => context.push('/w/$slug/reports/${w.start}'),
                        child: Padding(
                          padding: const EdgeInsets.all(Space.lg),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(child: Text('${context.shortDate(w.start)} – ${context.shortDate(w.end)}', style: context.text.titleMedium)),
                                  Icon(AppIcons.caretRight, color: context.palette.muted),
                                ],
                              ),
                              const SizedBox(height: Space.sm),
                              Wrap(
                                spacing: Space.sm,
                                runSpacing: 4,
                                children: [
                                  Pill(icon: AppIcons.folder, label: '${h.projects} ${l.navProjects}', tone: Tone.neutral),
                                  if (h.behind > 0) Pill(icon: AppIcons.trendDown, label: '${l.behindSchedule} · ${h.behind}', tone: Tone.danger),
                                  if (h.overBudget > 0) Pill(icon: AppIcons.coins, label: '${l.overBudget} · ${h.overBudget}', tone: Tone.danger),
                                  if (h.headingOver > 0) Pill(icon: AppIcons.gauge, label: '${l.headingOver} · ${h.headingOver}', tone: Tone.warning),
                                  if (h.late > 0) Pill(icon: AppIcons.calendarX, label: l.lateCount(h.late), tone: Tone.danger),
                                  if (h.done > 0) Pill(icon: AppIcons.checkCircle, label: '${l.finishedThisWeek} · ${h.done}', tone: Tone.success),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

/// One week's report, project by project.
class ReportScreen extends ConsumerWidget {
  const ReportScreen({super.key, required this.slug, required this.week});
  final String slug;
  final String week;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (slug: slug, week: week);
    final value = ref.watch(reportProvider(key));
    final r = value.value;
    return Scaffold(
      appBar: BrandAppBar(title: Text(r == null ? '' : '${context.shortDate(r.start)} – ${context.shortDate(r.end)}')),
      body: AsyncBody(
        value: value,
        onRetry: () => ref.invalidate(reportProvider(key)),
        builder: (r) => ListView.separated(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl),
          itemCount: r.projects.length,
          separatorBuilder: (_, _) => const SizedBox(height: Space.md),
          itemBuilder: (context, i) => _ReportCard(project: r.projects[i]),
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.project});
  final ReportProject project;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final x = project;
    Widget list(String title, List<({int number, String title})> items, int total, Color color) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: Space.md),
        Text('$title · $total', style: context.text.labelLarge!.copyWith(color: color)),
        for (final t in items) Text('${x.key}-${t.number} · ${t.title}', textDirection: textDirOf(t.title), style: context.text.bodyMedium),
      ],
    );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Expanded(child: Text(x.name, style: context.text.titleMedium)), ScheduleChip(x.schedule)]),
          const SizedBox(height: Space.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(x.actual == null ? '—' : '${x.actual!.round()}%', style: context.text.headlineSmall!.copyWith(height: 1)),
              const SizedBox(width: Space.sm),
              if (x.change != null)
                Text(
                  l.progressChange('${x.change! >= 0 ? '+' : ''}${x.change}'),
                  style: context.text.labelMedium!.copyWith(color: x.change! > 0 ? p.success : p.muted),
                ),
            ],
          ),
          const SizedBox(height: Space.xs),
          ProgressMeter(actual: x.actual ?? 0, planned: x.planned),
          const SizedBox(height: Space.sm),
          Text(
            '${l.spentThisWeek} ${context.money(x.spentThisWeek, x.currency)} · ${l.spent} ${context.money(x.spent, x.currency)}${x.budget == null ? '' : ' / ${context.money(x.budget!, x.currency)}'}',
            style: context.text.bodySmall,
          ),
          if (x.overBudget) ...[const SizedBox(height: Space.sm), Pill(icon: AppIcons.coins, label: l.overBudget, tone: Tone.danger)],
          if (x.lateCount > 0) list(l.lateTasks, x.late, x.lateCount, p.danger),
          if (x.doneCount > 0) list(l.finishedThisWeek, x.done, x.doneCount, p.success),
          if (x.risks.isNotEmpty || x.newRisks > 0) ...[
            const SizedBox(height: Space.md),
            Text('${l.topRisks} · ${l.newRisksCount(x.newRisks)}', style: context.text.labelLarge!.copyWith(color: p.warning)),
            for (final r in x.risks) Text('R-${r.number} · ${r.title} (${r.score})', textDirection: textDirOf(r.title), style: context.text.bodyMedium),
          ],
        ],
      ),
    );
  }
}
