import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/manage.dart';
import '../../core/manage_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../risks/risks_screen.dart';
import 'projects_screen.dart';

/// One project for its manager: progress, money, late and upcoming tasks, top
/// risks, and the site actions (attendance, risks, site log, photos).
class ProjectScreen extends ConsumerWidget {
  const ProjectScreen({super.key, required this.slug, required this.id});
  final String slug;
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (slug: slug, id: id);
    final value = ref.watch(projectDetailProvider(key));
    final d = value.value;
    return Scaffold(
      appBar: AppBar(title: Text(d?.project.name ?? '')),
      body: d == null
          ? AsyncBody(value: value, onRetry: () => ref.invalidate(projectDetailProvider(key)), builder: (_) => const SizedBox())
          : RefreshIndicator(
              onRefresh: () => ref.refresh(projectDetailProvider(key).future).then((_) {}, onError: (Object _) {}),
              child: _Body(slug: slug, d: d),
            ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.slug, required this.d});
  final String slug;
  final ProjectDetail d;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final x = d.project;
    final f = x.forecast;
    return ListView(
      padding: EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl + MediaQuery.paddingOf(context).bottom),
      children: [
        // Progress
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(l.progress, style: context.text.titleSmall!.copyWith(color: p.muted))),
                  ScheduleChip(x.schedule),
                ],
              ),
              const SizedBox(height: Space.sm),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(x.actual == null ? '—' : '${x.actual!.round()}%', style: context.text.displaySmall!.copyWith(height: 1)),
                  const SizedBox(width: Space.md),
                  if (x.planned != null)
                    Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('${l.planned} ${x.planned!.round()}%', style: context.text.bodyMedium!.copyWith(color: p.muted))),
                ],
              ),
              const SizedBox(height: Space.sm),
              ProgressMeter(actual: x.actual ?? 0, planned: x.planned, height: 12),
              if (x.daysLeft != null) ...[
                const SizedBox(height: Space.sm),
                Text(
                  x.overdue ? l.daysOverdue(-x.daysLeft!) : l.daysLeft(x.daysLeft!),
                  style: context.text.bodySmall!.copyWith(color: x.overdue ? p.danger : null),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: Space.md),
        // Money
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(l.budget, style: context.text.titleSmall!.copyWith(color: p.muted))),
                  if (x.overBudget) Pill(icon: Icons.money_off_rounded, label: l.overBudget, tone: Tone.danger),
                  if (x.headingOver) Pill(icon: Icons.speed_rounded, label: l.headingOver, tone: Tone.warning),
                ],
              ),
              const SizedBox(height: Space.sm),
              Row(
                children: [
                  Expanded(child: _Figure(label: l.spent, value: context.money(x.spent, x.currency), strong: true)),
                  Expanded(child: _Figure(label: l.budget, value: x.budget == null ? l.noBudget : context.money(x.budget!, x.currency))),
                ],
              ),
              if (x.budget != null && x.budget! > 0) ...[
                const SizedBox(height: Space.md),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: (x.spent / x.budget!).clamp(0, 1),
                    minHeight: 8,
                    backgroundColor: p.neutralSoft,
                    color: x.overBudget ? p.danger : (x.headingOver ? p.warning : context.colors.primary),
                  ),
                ),
              ],
              if (f != null && !f.early) ...[
                const SizedBox(height: Space.md),
                const Divider(),
                const SizedBox(height: Space.sm),
                Row(
                  children: [
                    Expanded(child: _Figure(label: l.expectedFinal, value: context.money(f.finalCost, x.currency))),
                    if (f.overBy != null && f.overBy! > 0)
                      Text(l.overBy(context.money(f.overBy!, x.currency)), style: context.text.labelMedium!.copyWith(color: p.danger)),
                  ],
                ),
              ],
            ],
          ),
        ),

        FieldLabel(l.actions),
        // Sized by their content (labels can wrap in Arabic or with large text).
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _Action(icon: Icons.groups_rounded, label: l.attendance, tone: Tone.info, onTap: () => context.push('/w/$slug/project/${x.id}/attendance'))),
            Expanded(child: _Action(icon: Icons.report_gmailerrorred_rounded, label: l.risks, tone: Tone.warning, onTap: () => context.push('/w/$slug/project/${x.id}/risks'))),
            Expanded(child: _Action(icon: Icons.assignment_rounded, label: l.siteLog, tone: Tone.success, onTap: () => context.push('/w/$slug/site-log?project=${x.id}'))),
            Expanded(child: _Action(icon: Icons.photo_library_rounded, label: l.photos, tone: Tone.neutral, onTap: () => context.push('/w/$slug/photos?project=${x.id}'))),
          ],
        ),

        SectionTitle(l.lateTasks, trailing: d.late.isEmpty ? null : Text('${d.late.length}', style: context.text.titleSmall!.copyWith(color: p.danger))),
        if (d.late.isEmpty)
          AppCard(child: Row(children: [const ToneIcon(Icons.task_alt_rounded, tone: Tone.success), const SizedBox(width: Space.md), Expanded(child: Text(l.noLate))]))
        else
          _TaskList(slug: slug, tasks: d.late, late: true),
        if (d.upcoming.isNotEmpty) ...[
          SectionTitle(l.upcoming),
          _TaskList(slug: slug, tasks: d.upcoming),
        ],
        SectionTitle(
          l.topRisks,
          trailing: TextButton(onPressed: () => context.push('/w/$slug/project/${x.id}/risks'), child: Text(l.risks)),
        ),
        if (d.risks.isEmpty)
          AppCard(child: Text(l.noRisks, style: context.text.bodyMedium!.copyWith(color: p.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.xs),
            child: Column(
              children: [
                for (final (i, r) in d.risks.indexed) ...[
                  if (i > 0) const Divider(),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 56),
                    child: Row(
                      children: [
                        RiskScoreBadge(score: r.score, level: r.level),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${r.key} · ${r.title}', textDirection: textDirOf(r.title), style: context.text.bodyLarge),
                              if (r.owner != null) Text(r.owner!, style: context.text.bodySmall),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: context.text.labelSmall!.copyWith(color: context.palette.muted)),
      Text(value, style: (strong ? context.text.titleLarge : context.text.titleMedium)!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
    ],
  );
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.tone, required this.onTap});
  final IconData icon;
  final String label;
  final Tone tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    child: InkWell(
      borderRadius: BorderRadius.circular(Radii.md),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.sm, horizontal: 2),
        child: Column(
          children: [
            ToneIcon(icon, tone: tone, size: 52),
            const SizedBox(height: Space.sm),
            Text(label, textAlign: TextAlign.center, maxLines: 2, style: context.text.labelMedium),
          ],
        ),
      ),
    ),
  );
}

class _TaskList extends StatelessWidget {
  const _TaskList({required this.slug, required this.tasks, this.late = false});
  final String slug;
  final List<HealthTask> tasks;
  final bool late;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: Space.xs),
      child: Column(
        children: [
          for (final (i, t) in tasks.indexed) ...[
            if (i > 0) const Divider(indent: Space.lg, endIndent: Space.lg),
            ListTile(
              minTileHeight: 56,
              onTap: () => context.push('/w/$slug/task/${t.id}'),
              title: Text(t.title, textDirection: textDirOf(t.title), maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: Text('${t.key} · ${t.status.name} · ${t.progress}%'),
              trailing: t.dueDate == null
                  ? null
                  : Text(context.shortDate(t.dueDate!), style: context.text.labelMedium!.copyWith(color: late ? p.danger : p.muted)),
            ),
          ],
        ],
      ),
    );
  }
}
