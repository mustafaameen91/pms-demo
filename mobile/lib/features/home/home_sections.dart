import 'package:flutter/material.dart';

import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/motion.dart';
import '../hours/hours_screen.dart';

// The home screen's cards. Everything here is stateless and built from one
// immutable Home, so a refresh only rebuilds what actually changed.

/// Opens My tasks, filtered to one due group (or all).
void openTasks(BuildContext context, String slug, [String? group]) => context.go('/w/$slug/tasks${group == null ? '' : '?group=$group'}');

List<Widget> memberHome(BuildContext context, String slug, Home home) => [
  Entrance(delay: const Duration(milliseconds: 150), child: QuickActions(slug: slug)),
  SectionTitle(context.l10n.myTasks, trailing: _Count(context.l10n.openTasks(home.myTasks.open))),
  Entrance(delay: const Duration(milliseconds: 180), child: TaskBreakdownCard(slug: slug, tasks: home.myTasks)),
];

List<Widget> managerHome(BuildContext context, String slug, Home home) {
  final l = context.l10n;
  final m = home.manage!;
  return [
    SectionTitle(l.waitingApproval, trailing: m.approvals.total > 0 ? _Count('${m.approvals.total}') : null),
    Entrance(delay: const Duration(milliseconds: 180), child: ApprovalsCard(slug: slug, approvals: m.approvals, showLoans: home.role.isAdmin)),
    SectionTitle(home.role.isAdmin ? l.allProjects : l.projectsYouManage),
    Entrance(delay: const Duration(milliseconds: 220), child: ProjectsCard(slug: slug, manage: m)),
    SectionTitle(l.myTasks, trailing: _Count(l.openTasks(home.myTasks.open))),
    Entrance(delay: const Duration(milliseconds: 260), child: TaskBreakdownCard(slug: slug, tasks: home.myTasks)),
    const SizedBox(height: Space.lg),
    QuickActions(slug: slug),
  ];
}

class _Count extends StatelessWidget {
  const _Count(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Text(label, style: context.text.labelMedium!.copyWith(color: context.palette.muted));
}

// ── Focus cards (sit half on the teal header) ───────────────────────────

class MemberFocusCard extends StatelessWidget {
  const MemberFocusCard({super.key, required this.slug, required this.tasks});
  final String slug;
  final TaskCounts tasks;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (tasks.open == 0) {
      return AppCard(
        child: Row(
          children: [
            const ToneIcon(Icons.task_alt_rounded, tone: Tone.success, size: 48),
            const SizedBox(width: Space.lg),
            Expanded(child: Text(l.noOpenTasks, style: context.text.bodyLarge)),
          ],
        ),
      );
    }
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: Space.xl, horizontal: Space.lg),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(child: _FocusStat(icon: Icons.error_outline_rounded, label: l.overdue, value: tasks.overdue, tone: Tone.danger, onTap: () => openTasks(context, slug, 'overdue'))),
            const _VDivider(),
            Expanded(child: _FocusStat(icon: Icons.today_rounded, label: l.dueToday, value: tasks.today, tone: Tone.warning, onTap: () => openTasks(context, slug, 'today'))),
            const _VDivider(),
            Expanded(child: _FocusStat(icon: Icons.date_range_rounded, label: l.thisWeek, value: tasks.week, tone: Tone.info, onTap: () => openTasks(context, slug, 'week'))),
          ],
        ),
      ),
    );
  }
}

class ManagerFocusCard extends StatelessWidget {
  const ManagerFocusCard({super.key, required this.home});
  final Home home;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final m = home.manage!;
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: Space.xl, horizontal: Space.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(start: Space.xs, bottom: Space.lg),
            child: Text(l.needsAttention, style: context.text.titleSmall!.copyWith(color: context.palette.muted)),
          ),
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(child: _FocusStat(icon: Icons.fact_check_outlined, label: l.toApprove, value: m.approvals.total, tone: Tone.info)),
                const _VDivider(),
                Expanded(child: _FocusStat(icon: Icons.event_busy_rounded, label: l.lateTasks, value: m.lateTasks, tone: Tone.danger)),
                const _VDivider(),
                Expanded(child: _FocusStat(icon: Icons.trending_down_rounded, label: l.behindSchedule, value: m.behind, tone: Tone.warning)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FocusStat extends StatelessWidget {
  const _FocusStat({required this.icon, required this.label, required this.value, required this.tone, this.onTap});
  final IconData icon;
  final String label;
  final int value;
  final Tone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final zero = value == 0;
    final stat = MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ToneIcon(icon, tone: tone, size: 34, quiet: zero),
            const SizedBox(height: Space.md),
            CountText(
              value,
              style: context.text.headlineMedium!.copyWith(color: zero ? p.muted : tone.fg(p), height: 1),
            ),
            const SizedBox(height: Space.xs),
            Text(label, style: context.text.bodySmall, maxLines: 2),
          ],
        ),
      ),
    );
    if (onTap == null) return stat;
    return InkWell(borderRadius: BorderRadius.circular(Radii.sm), onTap: onTap, child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: stat));
  }
}

class _VDivider extends StatelessWidget {
  const _VDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, margin: const EdgeInsets.symmetric(horizontal: Space.sm), color: context.palette.border);
}

// ── Cards ────────────────────────────────────────────────────────────────

class TaskBreakdownCard extends StatelessWidget {
  const TaskBreakdownCard({super.key, required this.slug, required this.tasks});
  final String slug;
  final TaskCounts tasks;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final rows = [
      (Icons.error_outline_rounded, l.overdue, tasks.overdue, Tone.danger, 'overdue'),
      (Icons.today_rounded, l.dueToday, tasks.today, Tone.warning, 'today'),
      (Icons.date_range_rounded, l.thisWeek, tasks.week, Tone.info, 'week'),
      (Icons.event_note_rounded, l.later, tasks.later, Tone.neutral, 'later'),
      (Icons.hourglass_empty_rounded, l.noDueDate, tasks.none, Tone.neutral, 'none'),
    ];
    return AppCard(
      child: Column(
        children: [
          if (tasks.open > 0) ...[
            _DistributionBar(
              label: l.openTasks(tasks.open),
              parts: [
                (tasks.overdue, p.danger),
                (tasks.today, p.warning),
                (tasks.week, p.info),
                (tasks.later, p.neutral),
                (tasks.none, p.neutral.withValues(alpha: 0.35)),
              ],
            ),
            const SizedBox(height: Space.sm),
          ],
          for (final (i, r) in rows.indexed) ...[
            if (i > 0) const Divider(indent: 50),
            MetricRow(icon: r.$1, label: r.$2, value: r.$3, tone: r.$4, onTap: r.$3 == 0 ? null : () => openTasks(context, slug, r.$5)),
          ],
        ],
      ),
    );
  }
}

class ApprovalsCard extends StatelessWidget {
  const ApprovalsCard({super.key, required this.slug, required this.approvals, required this.showLoans});
  final String slug;
  final Approvals approvals;

  /// Loan requests go to owners and admins only.
  final bool showLoans;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    void open() => context.go('/w/$slug/approvals');
    if (approvals.total == 0) {
      return AppCard(
        child: Row(
          children: [
            const ToneIcon(Icons.verified_rounded, tone: Tone.success),
            const SizedBox(width: Space.md),
            Expanded(child: Text(l.nothingToApprove, style: context.text.bodyLarge)),
          ],
        ),
      );
    }
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
      child: Column(
        children: [
          MetricRow(icon: Icons.receipt_long_rounded, label: l.expenses, value: approvals.expenses, tone: Tone.info, onTap: open),
          const Divider(indent: 50),
          MetricRow(icon: Icons.schedule_rounded, label: l.hours, value: approvals.hours, tone: Tone.info, onTap: open),
          if (showLoans) ...[
            const Divider(indent: 50),
            MetricRow(icon: Icons.payments_outlined, label: l.loans, value: approvals.loans, tone: Tone.info, onTap: open),
          ],
        ],
      ),
    );
  }
}

class ProjectsCard extends StatelessWidget {
  const ProjectsCard({super.key, required this.slug, required this.manage});
  final String slug;
  final Manage manage;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final m = manage;
    void open() => context.go('/w/$slug/projects');
    if (m.projects == 0) {
      return AppCard(
        child: Row(
          children: [
            const ToneIcon(Icons.folder_off_outlined, tone: Tone.neutral),
            const SizedBox(width: Space.md),
            Expanded(child: Text(l.noProjects, style: context.text.bodyLarge)),
          ],
        ),
      );
    }
    final onSchedule = (m.projects - m.behind).clamp(0, m.projects);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              CountText(m.projects, style: context.text.displaySmall!.copyWith(height: 1)),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(l.activeProjects, style: context.text.bodyMedium!.copyWith(color: p.muted)),
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.lg),
          _DistributionBar(
            label: '${l.onSchedule(onSchedule)} · ${l.behindSchedule}: ${m.behind}',
            parts: [(onSchedule, p.success), (m.behind, p.danger)],
          ),
          const SizedBox(height: Space.sm),
          Wrap(
            spacing: Space.lg,
            runSpacing: Space.xs,
            children: [
              _Legend(color: p.success, label: l.onSchedule(onSchedule)),
              _Legend(color: p.danger, label: '${l.behindSchedule} · ${m.behind}'),
            ],
          ),
          const SizedBox(height: Space.md),
          const Divider(),
          MetricRow(icon: Icons.money_off_rounded, label: l.overBudget, value: m.overBudget, tone: Tone.danger, onTap: open),
          const Divider(indent: 50),
          MetricRow(icon: Icons.speed_rounded, label: l.headingOver, value: m.headingOver, tone: Tone.warning, onTap: open),
          const Divider(indent: 50),
          MetricRow(icon: Icons.event_busy_rounded, label: l.lateTasks, value: m.lateTasks, tone: Tone.danger, onTap: open),
        ],
      ),
    );
  }
}

/// A thin stacked bar: each part's share of the whole, with 3px gaps.
class _DistributionBar extends StatelessWidget {
  const _DistributionBar({required this.parts, required this.label});
  final List<(int, Color)> parts;
  final String label;

  @override
  Widget build(BuildContext context) {
    final shown = parts.where((e) => e.$1 > 0).toList();
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: SizedBox(
          height: 10,
          child: Row(
            children: [
              for (final (i, part) in shown.indexed) ...[
                if (i > 0) const SizedBox(width: 3),
                Expanded(flex: part.$1, child: ColoredBox(color: part.$2, child: const SizedBox.expand())),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 6),
        Text(label, style: context.text.bodySmall),
      ],
    );
  }
}

// ── Loading ──────────────────────────────────────────────────────────────

class FocusSkeleton extends StatelessWidget {
  const FocusSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(Space.xl),
      child: Skeleton(
        child: Row(
          children: [
            for (var i = 0; i < 3; i++) ...[
              if (i > 0) const SizedBox(width: Space.lg),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(width: 34, height: 34),
                    SizedBox(height: Space.md),
                    SkeletonBox(width: 44, height: 28),
                    SizedBox(height: Space.sm),
                    SkeletonBox(height: 12),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Skeleton(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: Space.xxl),
          SkeletonBox(width: 140, height: 22),
          SizedBox(height: Space.md),
          SkeletonBox(height: 300, radius: Radii.lg),
        ],
      ),
    );
  }
}

/// One-tap shortcuts for site work.
class QuickActions extends StatelessWidget {
  const QuickActions({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final actions = [
      (Icons.more_time_rounded, l.logHours, Tone.info, () => showLogHours(context, slug)),
      (Icons.assignment_rounded, l.siteLog, Tone.success, () => context.push('/w/$slug/site-log')),
      (Icons.add_a_photo_rounded, l.addPhoto, Tone.warning, () => context.push('/w/$slug/photos')),
      (Icons.receipt_long_rounded, l.addExpense, Tone.neutral, () => context.push('/w/$slug/expenses/new')),
    ];
    return Padding(
      padding: const EdgeInsets.only(top: Space.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (icon, label, tone, onTap) in actions)
            Expanded(
              child: Semantics(
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
              ),
            ),
        ],
      ),
    );
  }
}
