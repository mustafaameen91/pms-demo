import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/work.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

/// My hours, a week at a time (Saturday to Friday, like the website).
class HoursScreen extends ConsumerStatefulWidget {
  const HoursScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<HoursScreen> createState() => _HoursScreenState();
}

class _HoursScreenState extends ConsumerState<HoursScreen> {
  /// Any day in the week shown.
  String _week = todayIso();

  String _shift(String iso, int days) => isoOf(DateTime.parse(iso).add(Duration(days: days)));

  Future<void> _delete(TimeEntry e) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.deleteEntryConfirm),
        content: Text('${context.day(e.date)} · ${l.hoursShort(context.hours(e.hours))} · ${e.project.name}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: context.palette.danger, minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.delete),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final r = await ref.read(workProvider).deleteHours(widget.slug, e.id);
      if (mounted) toastResult(context, r, l.deleted);
    } catch (err) {
      if (mounted) toastError(context, err);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final key = (slug: widget.slug, week: _week);
    final value = ref.watch(hoursProvider(key));
    final data = value.value;
    return Scaffold(
      // Above the floating tab bar (the scaffold only clears the safe area).
      floatingActionButton: Padding(
        padding: EdgeInsets.only(bottom: math.max(0, MediaQuery.paddingOf(context).bottom - MediaQuery.viewPaddingOf(context).bottom)),
        child: FloatingActionButton.extended(
          onPressed: () => showLogHours(context, widget.slug, date: data != null && data.today.compareTo(data.to) > 0 ? data.to : null),
          icon: const Icon(AppIcons.plus),
          label: Text(l.logHours),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(hoursProvider(key).future).then((_) {}, onError: (Object _) {}),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            BrandSliverHeader(title: l.myHours, icon: AppIcons.clock, slug: widget.slug),
            // Breathing room between the header and the first card.
            const SliverToBoxAdapter(child: SizedBox(height: Space.lg)),
            if (data == null)
              SliverFillRemaining(
                // The skeleton is a list of its own.
                hasScrollBody: true,
                child: AsyncBody(value: value, onRetry: () => ref.invalidate(hoursProvider(key)), builder: (_) => const SizedBox()),
              )
            else ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.sm),
                  child: _WeekCard(
                    week: data,
                    onPrevious: () => setState(() => _week = _shift(data.from, -7)),
                    onNext: data.to.compareTo(data.today) < 0 ? () => setState(() => _week = _shift(data.from, 7)) : null,
                    onThisWeek: data.to.compareTo(data.today) < 0 ? () => setState(() => _week = todayIso()) : null,
                  ),
                ),
              ),
              if (data.entries.isEmpty)
                SliverToBoxAdapter(child: EmptyState(icon: AppIcons.clock, message: l.noHours))
              else
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, 96 + MediaQuery.paddingOf(context).bottom),
                  sliver: SliverList.list(children: [for (final day in _byDay(data.entries)) _DayGroup(day: day, onDelete: _delete)]),
                ),
            ],
          ],
        ),
      ),
    );
  }

  List<(String, List<TimeEntry>)> _byDay(List<TimeEntry> entries) {
    final map = <String, List<TimeEntry>>{};
    for (final e in entries) {
      (map[e.date] ??= []).add(e);
    }
    final days = map.keys.toList()..sort((a, b) => b.compareTo(a));
    return [for (final d in days) (d, map[d]!)];
  }
}

class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.week, required this.onPrevious, required this.onNext, required this.onThisWeek});
  final HoursWeek week;
  final VoidCallback onPrevious;
  final VoidCallback? onNext;
  final VoidCallback? onThisWeek;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final pending = week.entries.where((e) => e.status == Approval.pending).fold<double>(0, (s, e) => s + e.hours);
    return AppCard(
      padding: const EdgeInsets.fromLTRB(Space.sm, Space.md, Space.sm, Space.lg),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(tooltip: l.previousWeek, onPressed: onPrevious, icon: const Icon(AppIcons.caretLeft)),
              Expanded(
                child: Text(
                  '${context.shortDate(week.from)} – ${context.shortDate(week.to)}',
                  textAlign: TextAlign.center,
                  style: context.text.titleMedium,
                ),
              ),
              IconButton(tooltip: l.nextWeek, onPressed: onNext, icon: const Icon(AppIcons.caretRight)),
            ],
          ),
          const SizedBox(height: Space.sm),
          // Not rounded: 7.5 hours is 7.5.
          Text(
            context.hours(week.total),
            style: context.text.displaySmall!.copyWith(color: context.colors.primary, height: 1, fontFeatures: const [FontFeature.tabularFigures()]),
          ),
          const SizedBox(height: 2),
          Text(l.hoursLabel, style: context.text.bodySmall),
          if (pending > 0) ...[
            const SizedBox(height: Space.md),
            const ApprovalPill(Approval.pending),
            const SizedBox(height: 2),
            Text(l.hoursShort(context.hours(pending)), style: context.text.labelSmall!.copyWith(color: p.muted)),
          ],
          if (onThisWeek != null) ...[
            const SizedBox(height: Space.sm),
            TextButton(onPressed: onThisWeek, child: Text(l.backToThisWeek)),
          ],
        ],
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  const _DayGroup({required this.day, required this.onDelete});
  final (String, List<TimeEntry>) day;
  final void Function(TimeEntry) onDelete;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final (date, entries) = day;
    final total = entries.fold<double>(0, (s, e) => s + e.hours);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(Space.xs, Space.lg, Space.xs, Space.sm),
          child: Row(
            children: [
              Expanded(child: Text(context.day(date), style: context.text.titleSmall)),
              Text(l.hoursShort(context.hours(total)), style: context.text.titleSmall!.copyWith(color: p.muted)),
            ],
          ),
        ),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.xs),
          child: Column(
            children: [
              for (final (i, e) in entries.indexed) ...[
                if (i > 0) const Divider(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Space.md),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(e.project.name, style: context.text.titleSmall),
                            if (e.task != null) Text('${e.task!.key} · ${e.task!.title}', style: context.text.bodySmall, maxLines: 2),
                            if (e.note != null) ...[const SizedBox(height: 2), Text(e.note!, textDirection: textDirOf(e.note!), style: context.text.bodyMedium)],
                            const SizedBox(height: Space.sm),
                            ApprovalPill(e.status),
                            if (e.status == Approval.rejected && e.decisionNote != null) ...[
                              const SizedBox(height: 4),
                              Text(e.decisionNote!, style: context.text.bodySmall!.copyWith(color: p.danger)),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: Space.sm),
                      Text(
                        l.hoursShort(context.hours(e.hours)),
                        style: context.text.titleLarge!.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                      ),
                      if (e.status != Approval.approved)
                        IconButton(tooltip: l.delete, onPressed: () => onDelete(e), icon: Icon(AppIcons.trash, color: p.muted)),
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

/// The "Log hours" sheet. [projectId]/[taskId] preselect (e.g. from a task).
Future<void> showLogHours(BuildContext context, String slug, {String? projectId, String? taskId, String? date}) => showModalBottomSheet<void>(
  useRootNavigator: true,
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => _LogHoursSheet(slug: slug, projectId: projectId, taskId: taskId, date: date),
);

class _LogHoursSheet extends ConsumerStatefulWidget {
  const _LogHoursSheet({required this.slug, this.projectId, this.taskId, this.date});
  final String slug;
  final String? projectId;
  final String? taskId;
  final String? date;

  @override
  ConsumerState<_LogHoursSheet> createState() => _LogHoursSheetState();
}

class _LogHoursSheetState extends ConsumerState<_LogHoursSheet> {
  String? _project;
  String? _task;
  late String _date = widget.date ?? todayIso();
  final _hours = TextEditingController();
  final _note = TextEditingController();
  bool _saving = false;
  Map<String, String> _errors = const {};

  @override
  void initState() {
    super.initState();
    _project = widget.projectId;
    _task = widget.taskId;
  }

  @override
  void dispose() {
    _hours.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_date),
      firstDate: now.subtract(const Duration(days: 90)),
      // Time can't be logged for a future date.
      lastDate: now,
    );
    if (picked != null) setState(() => _date = isoOf(picked));
  }

  Future<void> _save() async {
    final l = context.l10n;
    final errors = <String, String>{
      if (_project == null) 'projectId': l.chooseProject,
      if (_hours.text.trim().isEmpty) 'hours': l.fieldRequired,
    };
    if (errors.isNotEmpty) return setState(() => _errors = errors);
    setState(() {
      _saving = true;
      _errors = const {};
    });
    try {
      final r = await ref
          .read(workProvider)
          .logHours(widget.slug, projectId: _project!, date: _date, hours: _hours.text.trim().replaceAll(',', '.'), taskId: _task, note: _note.text.trim().isEmpty ? null : _note.text.trim());
      if (!mounted) return;
      Navigator.pop(context);
      toastResult(context, r, l.hoursSaved);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errors = e.fields;
      });
      if (e.fields.isEmpty) toastError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final projects = ref.watch(projectsProvider(widget.slug));
    final list = projects.value ?? const <ProjectRef>[];
    if (_project == null && list.length == 1) _project = list.first.id;
    final tasks = _project == null ? null : ref.watch(projectTasksProvider((slug: widget.slug, id: _project!))).value;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.logHours, style: context.text.titleLarge),
            const SizedBox(height: Space.lg),
            if (projects.value == null && projects.isLoading)
              const LinearProgressIndicator()
            else if (list.isEmpty)
              InlineBanner(icon: AppIcons.info, tone: Tone.info, message: l.notOnProjects)
            else ...[
              ProjectField(
                projects: list,
                value: _project,
                error: _errors['projectId'],
                onChanged: (v) => setState(() {
                  _project = v;
                  _task = null;
                }),
              ),
              const SizedBox(height: Space.md),
              DropdownButtonFormField<String?>(
                key: ValueKey('task-$_project-${tasks?.tasks.length}'),
                initialValue: _task,
                isExpanded: true,
                decoration: InputDecoration(labelText: l.taskOptional, prefixIcon: const Icon(AppIcons.checkCircle), errorText: _errors['taskId']),
                items: [
                  DropdownMenuItem<String?>(value: null, child: Text(l.noTask)),
                  for (final t in tasks?.tasks ?? const <TaskLink>[])
                    DropdownMenuItem(value: t.id, child: Text('${t.key} · ${t.title}', overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => setState(() => _task = v),
              ),
            ],
            const SizedBox(height: Space.md),
            InkWell(
              borderRadius: BorderRadius.circular(Radii.md),
              onTap: _pickDate,
              child: InputDecorator(
                decoration: InputDecoration(labelText: l.date, prefixIcon: const Icon(AppIcons.calendarBlank), errorText: _errors['date']),
                child: Text(context.day(_date), style: context.text.bodyLarge),
              ),
            ),
            const SizedBox(height: Space.md),
            TextField(
              controller: _hours,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              decoration: InputDecoration(labelText: l.hoursLabel, prefixIcon: const Icon(AppIcons.timer), errorText: _errors['hours']),
            ),
            const SizedBox(height: Space.sm),
            Wrap(
              spacing: Space.sm,
              children: [
                for (final h in const ['1', '2', '4', '8'])
                  ActionChip(
                    label: Text(l.hoursShort(h)),
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      _hours.text = h;
                    },
                  ),
              ],
            ),
            const SizedBox(height: Space.md),
            TextField(
              controller: _note,
              maxLength: 500,
              decoration: InputDecoration(labelText: l.noteOptional, prefixIcon: const Icon(AppIcons.notepad), errorText: _errors['note']),
            ),
            const SizedBox(height: Space.md),
            FilledButton(
              onPressed: _saving || list.isEmpty ? null : _save,
              child: _saving ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l.save),
            ),
          ],
        ),
      ),
    );
  }
}
