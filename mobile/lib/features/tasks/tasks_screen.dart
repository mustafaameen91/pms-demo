import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/work.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';

String dueGroupLabel(BuildContext context, DueGroup g) => switch (g) {
  DueGroup.overdue => context.l10n.overdue,
  DueGroup.today => context.l10n.dueToday,
  DueGroup.week => context.l10n.thisWeek,
  DueGroup.later => context.l10n.later,
  DueGroup.none => context.l10n.noDueDate,
};

Tone dueGroupTone(DueGroup g) => switch (g) {
  DueGroup.overdue => Tone.danger,
  DueGroup.today => Tone.warning,
  DueGroup.week => Tone.info,
  _ => Tone.neutral,
};

/// My open tasks, grouped by when they're due, with a filter per group.
class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key, required this.slug, this.group});
  final String slug;

  /// Opened from a home tile: start filtered to that group.
  final String? group;

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  DueGroup? _filter;

  @override
  void initState() {
    super.initState();
    _filter = widget.group == null ? null : DueGroup.parse(widget.group);
  }

  @override
  void didUpdateWidget(TasksScreen old) {
    super.didUpdateWidget(old);
    if (widget.group != old.group) _filter = widget.group == null ? null : DueGroup.parse(widget.group);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final value = ref.watch(myTasksProvider(widget.slug));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myTasksProvider(widget.slug).future).then((_) {}, onError: (Object _) {}),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.medium(title: Text(l.myTasks), pinned: true),
            if (value.value case final data?) ...[
              SliverToBoxAdapter(child: _Filters(tasks: data.tasks, selected: _filter, onSelected: (g) => setState(() => _filter = g))),
              ..._list(context, data),
            ] else
              SliverFillRemaining(
                // The skeleton is a list of its own.
                hasScrollBody: true,
                child: AsyncBody(value: value, onRetry: () => ref.invalidate(myTasksProvider(widget.slug)), builder: (_) => const SizedBox()),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _list(BuildContext context, MyTasks data) {
    final l = context.l10n;
    if (data.tasks.isEmpty) {
      return [SliverToBoxAdapter(child: EmptyState(icon: Icons.task_alt_rounded, message: l.noOpenTasks))];
    }
    // Headers and tasks in one flat, lazily built list.
    final items = <Object>[];
    for (final g in DueGroup.values) {
      if (_filter != null && _filter != g) continue;
      final inGroup = data.tasks.where((t) => t.group == g).toList();
      if (inGroup.isEmpty) continue;
      items
        ..add((g, inGroup.length))
        ..addAll(inGroup);
    }
    return [
      if (items.isEmpty) SliverToBoxAdapter(child: EmptyState(icon: Icons.filter_alt_off_rounded, message: l.nothingInGroup)),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.lg),
        sliver: SliverList.builder(
          itemCount: items.length,
          itemBuilder: (context, i) {
            final item = items[i];
            if (item is MyTask) {
              return Padding(
                key: ValueKey(item.id),
                padding: const EdgeInsets.only(bottom: Space.md),
                child: TaskCard(task: item, onTap: () => context.push('/w/${widget.slug}/task/${item.id}')),
              );
            }
            final (group, count) = item as (DueGroup, int);
            return _GroupHeader(group: group, count: count);
          },
        ),
      ),
      if (data.done > 0)
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl + MediaQuery.paddingOf(context).bottom),
            child: Text(l.finishedCount(data.done), textAlign: TextAlign.center, style: context.text.bodySmall),
          ),
        ),
    ];
  }
}

class _Filters extends StatelessWidget {
  const _Filters({required this.tasks, required this.selected, required this.onSelected});
  final List<MyTask> tasks;
  final DueGroup? selected;
  final ValueChanged<DueGroup?> onSelected;

  @override
  Widget build(BuildContext context) {
    final counts = {for (final g in DueGroup.values) g: tasks.where((t) => t.group == g).length};
    Widget chip(String label, DueGroup? g, int count) => Padding(
      padding: const EdgeInsetsDirectional.only(end: Space.sm),
      child: FilterChip(
        label: Text('$label · $count'),
        selected: selected == g,
        showCheckmark: false,
        onSelected: (_) {
          HapticFeedback.selectionClick();
          onSelected(g);
        },
      ),
    );
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
        children: [
          chip(context.l10n.filterAll, null, tasks.length),
          for (final g in DueGroup.values)
            if (counts[g]! > 0) chip(dueGroupLabel(context, g), g, counts[g]!),
        ],
      ),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group, required this.count});
  final DueGroup group;
  final int count;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final tone = dueGroupTone(group);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(Space.xs, Space.lg, Space.xs, Space.sm),
      child: Semantics(
        header: true,
        child: Row(
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: tone.fg(p), shape: BoxShape.circle)),
            const SizedBox(width: Space.sm),
            Text(dueGroupLabel(context, group), style: context.text.titleSmall),
            const SizedBox(width: Space.sm),
            Text('$count', style: context.text.titleSmall!.copyWith(color: p.muted)),
          ],
        ),
      ),
    );
  }
}

/// One task in a list: project, title, status, due date and progress.
class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.task, required this.onTap});
  final MyTask task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final t = task;
    final projectColor = Color(parseHex(t.project.color) ?? Brand.teal600.toARGB32());
    final dueTone = dueGroupTone(t.group);
    return Material(
      color: p.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg), side: BorderSide(color: p.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: projectColor),
              Expanded(
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(Space.md, Space.md, Space.lg, Space.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(t.key, style: context.text.labelSmall!.copyWith(color: p.muted, fontFeatures: const [FontFeature.tabularFigures()])),
                          Text('  ·  ', style: context.text.labelSmall!.copyWith(color: p.muted)),
                          Flexible(child: Text(t.project.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelSmall!.copyWith(color: p.muted))),
                          if (t.isMilestone) ...[const SizedBox(width: 6), Icon(Icons.flag_rounded, size: 14, color: p.warning, semanticLabel: l.milestone)],
                          if (t.isSubtask) ...[const SizedBox(width: 6), Icon(Icons.subdirectory_arrow_right_rounded, size: 14, color: p.muted, semanticLabel: l.subtask)],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(t.title, textDirection: textDirOf(t.title), maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleMedium),
                      const SizedBox(height: Space.sm),
                      Row(
                        children: [
                          // Status and due date take what's left; the % stays lined up at the end.
                          Expanded(
                            child: Row(
                              children: [
                                Flexible(child: StatusPill(status: t.status, dense: true)),
                                if (t.dueDate != null) ...[
                                  const SizedBox(width: Space.sm),
                                  Icon(Icons.event_rounded, size: 14, color: dueTone == Tone.neutral ? p.muted : dueTone.fg(p)),
                                  const SizedBox(width: 3),
                                  Text(
                                    context.shortDate(t.dueDate!),
                                    style: context.text.labelSmall!.copyWith(color: dueTone == Tone.neutral ? p.muted : dueTone.fg(p)),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: Space.sm),
                          Text('${t.progress}%', style: context.text.labelMedium!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                        ],
                      ),
                      const SizedBox(height: Space.sm),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: LinearProgressIndicator(
                          value: t.progress / 100,
                          minHeight: 5,
                          backgroundColor: p.neutralSoft,
                          color: t.progress >= 100 ? p.success : context.colors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
