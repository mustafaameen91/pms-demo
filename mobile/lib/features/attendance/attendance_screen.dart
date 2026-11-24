import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/manage.dart';
import '../../core/manage_models.dart';
import '../../core/work.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

/// The manager marks who was on site today (and for how long). It fills in each
/// worker's used days and cost on the project, like the website's attendance.
class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key, required this.slug, required this.projectId});
  final String slug;
  final String projectId;

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  String _date = todayIso();
  String? _task;
  final _note = TextEditingController();

  /// Chosen workers → amount (in the worker's unit).
  final Map<String, double> _chosen = {};
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(context: context, initialDate: DateTime.parse(_date), firstDate: now.subtract(const Duration(days: 60)), lastDate: now);
    if (picked != null) {
      setState(() {
        _date = isoOf(picked);
        _chosen.clear();
      });
    }
  }

  Future<void> _save() async {
    if (_chosen.isEmpty) return;
    setState(() => _saving = true);
    try {
      final r = await ref
          .read(manageProvider)
          .recordAttendance(
            widget.slug,
            widget.projectId,
            date: _date,
            taskId: _task,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            workers: {for (final e in _chosen.entries) e.key: context.hours(e.value)},
          );
      if (!mounted) return;
      toastResult(context, r, context.l10n.attendanceSaved);
      setState(() => _chosen.clear());
    } on ApiException catch (e) {
      if (mounted) toastError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final key = (slug: widget.slug, projectId: widget.projectId, date: _date);
    final value = ref.watch(attendanceProvider(key));
    final day = value.value;
    final tasks = ref.watch(projectTasksProvider((slug: widget.slug, id: widget.projectId))).value;

    return Scaffold(
      appBar: BrandAppBar(title: Text(l.attendance)),
      bottomNavigationBar: day == null || day.workers.isEmpty
          ? null
          : StickyAction(
              child: FilledButton(
                onPressed: _chosen.isEmpty || _saving ? null : _save,
                child: _saving
                    ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                    : Text(l.saveAttendanceCount(_chosen.length)),
              ),
            ),
      body: day == null
          ? AsyncBody(value: value, onRetry: () => ref.invalidate(attendanceProvider(key)), builder: (_) => const SizedBox())
          : ListView(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl),
              children: [
                Text(l.attendanceHint, style: context.text.bodySmall),
                const SizedBox(height: Space.md),
                InkWell(
                  borderRadius: BorderRadius.circular(Radii.md),
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: InputDecoration(labelText: l.date, prefixIcon: const Icon(AppIcons.calendarBlank)),
                    child: Text(_date == day.today ? '${l.today} · ${context.day(_date)}' : context.day(_date), style: context.text.bodyLarge),
                  ),
                ),
                const SizedBox(height: Space.md),
                DropdownButtonFormField<String?>(
                  key: ValueKey('task-${tasks?.tasks.length}'),
                  initialValue: _task,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.taskOptional, prefixIcon: const Icon(AppIcons.checkCircle)),
                  items: [
                    DropdownMenuItem<String?>(value: null, child: Text(l.noTask)),
                    for (final t in tasks?.tasks ?? const <TaskLink>[])
                      DropdownMenuItem(value: t.id, child: Text('${t.key} · ${t.title}', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _task = v),
                ),
                if (day.recorded.isNotEmpty) ...[
                  FieldLabel(l.alreadyRecorded),
                  AppCard(
                    padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
                    child: Column(
                      children: [
                        for (final r in day.recorded)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                Icon(AppIcons.checkCircleFill, size: 20, color: p.success),
                                const SizedBox(width: Space.md),
                                Expanded(child: Text(r.name, style: context.text.bodyLarge)),
                                Text('${context.hours(r.quantity)} ${r.unitLabel}', style: context.text.bodyMedium!.copyWith(color: p.muted)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                FieldLabel(l.workersLabel),
                if (day.workers.isEmpty)
                  InlineBanner(icon: AppIcons.info, tone: Tone.info, message: l.noWorkers)
                else
                  AppCard(
                    padding: const EdgeInsets.symmetric(vertical: Space.xs),
                    child: Column(
                      children: [
                        for (final (i, w) in day.workers.indexed) ...[
                          if (i > 0) const Divider(indent: 64),
                          _WorkerRow(
                            worker: w,
                            quantity: _chosen[w.id],
                            onToggle: (on) {
                              HapticFeedback.selectionClick();
                              setState(() => on ? _chosen[w.id] = w.defaultQuantity : _chosen.remove(w.id));
                            },
                            onQuantity: (q) => setState(() => _chosen[w.id] = q),
                          ),
                        ],
                      ],
                    ),
                  ),
                const SizedBox(height: Space.lg),
                TextField(controller: _note, maxLength: 500, decoration: InputDecoration(labelText: l.noteOptional, prefixIcon: const Icon(AppIcons.notepad))),
              ],
            ),
    );
  }
}

class _WorkerRow extends StatelessWidget {
  const _WorkerRow({required this.worker, required this.quantity, required this.onToggle, required this.onQuantity});
  final Worker worker;
  final double? quantity;
  final ValueChanged<bool> onToggle;
  final ValueChanged<double> onQuantity;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final w = worker;
    final on = quantity != null;
    final step = w.defaultQuantity >= 8 ? 1.0 : 0.5;
    return InkWell(
      onTap: () => onToggle(!on),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.sm, Space.xs, Space.md, Space.xs),
        child: Row(
          children: [
            Checkbox(value: on, onChanged: (v) => onToggle(v ?? false)),
            const SizedBox(width: Space.xs),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(w.name, style: context.text.bodyLarge),
                  Text([if (w.role != null) w.role!, if (w.onProject) context.l10n.onThisProject].join(' · '), style: context.text.bodySmall),
                ],
              ),
            ),
            if (on) ...[
              IconButton(
                tooltip: '−',
                onPressed: quantity! - step <= 0 ? null : () => onQuantity(quantity! - step),
                icon: const Icon(AppIcons.minusCircle),
              ),
              Text('${context.hours(quantity!)} ${w.unitLabel}', style: context.text.titleSmall!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
              IconButton(tooltip: '+', onPressed: () => onQuantity(quantity! + step), icon: const Icon(AppIcons.plusCircle)),
            ] else
              Text(w.unitLabel, style: context.text.bodySmall!.copyWith(color: p.muted)),
          ],
        ),
      ),
    );
  }
}
