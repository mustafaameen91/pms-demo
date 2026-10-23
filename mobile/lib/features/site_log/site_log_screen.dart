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

IconData weatherIcon(String? v) => switch (v) {
  'sunny' => Icons.wb_sunny_rounded,
  'cloudy' => Icons.cloud_rounded,
  'rain' => Icons.water_drop_rounded,
  'wind' => Icons.air_rounded,
  'dust' => Icons.blur_on_rounded,
  'hot' => Icons.local_fire_department_rounded,
  'cold' => Icons.ac_unit_rounded,
  _ => Icons.help_outline_rounded,
};

/// The day's site log for one project: weather, deliveries, problems, notes.
/// Anyone on the project team writes it; one log per project per day.
class SiteLogScreen extends ConsumerStatefulWidget {
  const SiteLogScreen({super.key, required this.slug, this.projectId});
  final String slug;
  final String? projectId;

  @override
  ConsumerState<SiteLogScreen> createState() => _SiteLogScreenState();
}

class _SiteLogScreenState extends ConsumerState<SiteLogScreen> {
  String? _project;
  String _date = todayIso();

  @override
  void initState() {
    super.initState();
    _project = widget.projectId;
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(context: context, initialDate: DateTime.parse(_date), firstDate: DateTime(now.year - 2), lastDate: now);
    if (picked != null) setState(() => _date = isoOf(picked));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final projects = ref.watch(projectsProvider(widget.slug));
    final list = projects.value;
    if (_project == null && list != null && list.isNotEmpty) _project = list.first.id;
    final key = _project == null ? null : (slug: widget.slug, projectId: _project!, date: _date);
    final value = key == null ? null : ref.watch(siteLogProvider(key));
    final day = value?.value;

    return Scaffold(
      appBar: AppBar(
        title: Text(l.siteLog),
        actions: [IconButton(tooltip: l.date, onPressed: _pickDate, icon: const Icon(Icons.calendar_month_rounded))],
      ),
      body: list == null
          ? AsyncBody(value: projects, onRetry: () => ref.invalidate(projectsProvider(widget.slug)), builder: (_) => const SizedBox())
          : list.isEmpty
          ? EmptyState(icon: Icons.apartment_rounded, message: l.notOnProjects)
          : ListView(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl),
              children: [
                if (list.length > 1) ...[
                  ProjectField(projects: list, value: _project, onChanged: (v) => setState(() => _project = v)),
                  const SizedBox(height: Space.md),
                ],
                _DayChips(
                  selected: _date,
                  today: day?.today ?? todayIso(),
                  days: day?.days ?? const [],
                  onSelected: (d) => setState(() => _date = d),
                ),
                const SizedBox(height: Space.md),
                if (day == null)
                  AsyncBody(value: value!, onRetry: () => ref.invalidate(siteLogProvider(key!)), builder: (_) => const SizedBox(), skeleton: const ListSkeleton(rows: 3))
                else
                  _SiteLogForm(
                    // A fresh form for each project/day, filled from what's saved.
                    key: ValueKey('$_project-$_date-${day.log?.updatedAt}'),
                    slug: widget.slug,
                    projectId: _project!,
                    day: day,
                  ),
              ],
            ),
    );
  }
}

class _DayChips extends StatelessWidget {
  const _DayChips({required this.selected, required this.today, required this.days, required this.onSelected});
  final String selected;
  final String today;
  final List<({String date, String? weather, bool problems})> days;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final dates = {today, selected, for (final d in days) d.date}.toList()..sort((a, b) => b.compareTo(a));
    final byDate = {for (final d in days) d.date: d};
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final d in dates)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: Space.sm),
              child: ChoiceChip(
                showCheckmark: false,
                selected: d == selected,
                avatar: byDate[d] == null
                    ? null
                    : Icon(byDate[d]!.problems ? Icons.report_problem_rounded : weatherIcon(byDate[d]!.weather), size: 16, color: byDate[d]!.problems ? p.warning : null),
                label: Text(d == today ? context.l10n.today : context.shortDate(d)),
                onSelected: (_) => onSelected(d),
              ),
            ),
        ],
      ),
    );
  }
}

class _SiteLogForm extends ConsumerStatefulWidget {
  const _SiteLogForm({super.key, required this.slug, required this.projectId, required this.day});
  final String slug;
  final String projectId;
  final SiteLogDay day;

  @override
  ConsumerState<_SiteLogForm> createState() => _SiteLogFormState();
}

class _SiteLogFormState extends ConsumerState<_SiteLogForm> {
  late String? _weather = widget.day.log?.weather;
  late final _temperature = TextEditingController(text: widget.day.log?.temperature?.toString() ?? '');
  late final _deliveries = TextEditingController(text: widget.day.log?.deliveries ?? '');
  late final _problems = TextEditingController(text: widget.day.log?.problems ?? '');
  late final _notes = TextEditingController(text: widget.day.log?.notes ?? '');
  bool _saving = false;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    for (final c in [_temperature, _deliveries, _problems, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _errors = const {};
    });
    try {
      final r = await ref.read(workProvider).saveSiteLog(widget.slug, widget.projectId, {
        'date': widget.day.date,
        'weather': _weather,
        'temperature': _temperature.text.trim(),
        'deliveries': _deliveries.text,
        'problems': _problems.text,
        'notes': _notes.text,
      });
      if (mounted) toastResult(context, r, context.l10n.siteLogSaved);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _errors = e.fields);
      if (e.fields.isEmpty) toastError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final log = widget.day.log;
    InputDecoration field(String label, IconData icon, String key) =>
        InputDecoration(labelText: label, prefixIcon: Icon(icon), alignLabelWithHint: true, errorText: _errors[key]);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(context.day(widget.day.date), style: context.text.titleLarge),
        const SizedBox(height: 2),
        Text(
          log?.updatedBy != null ? '${l.lastSavedBy(log!.updatedBy!)} · ${context.ago(log.updatedAt)}' : l.noLogYet,
          style: context.text.bodySmall,
        ),
        FieldLabel(l.weather),
        Wrap(
          spacing: Space.sm,
          runSpacing: Space.sm,
          children: [
            for (final w in widget.day.weather)
              ChoiceChip(
                showCheckmark: false,
                avatar: Icon(weatherIcon(w.value), size: 18),
                label: Text(w.label),
                selected: _weather == w.value,
                onSelected: (on) {
                  HapticFeedback.selectionClick();
                  setState(() => _weather = on ? w.value : null);
                },
              ),
          ],
        ),
        if (_errors['weather'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_errors['weather']!, style: context.text.bodySmall!.copyWith(color: p.danger))),
        const SizedBox(height: Space.lg),
        TextField(
          controller: _temperature,
          keyboardType: const TextInputType.numberWithOptions(signed: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^-?\d{0,2}'))],
          decoration: field(l.temperature, Icons.thermostat_rounded, 'temperature'),
        ),
        const SizedBox(height: Space.md),
        TextField(controller: _deliveries, minLines: 2, maxLines: 6, maxLength: 2000, decoration: field(l.deliveries, Icons.local_shipping_rounded, 'deliveries')),
        const SizedBox(height: Space.sm),
        TextField(controller: _problems, minLines: 2, maxLines: 6, maxLength: 2000, decoration: field(l.problems, Icons.report_problem_outlined, 'problems')),
        const SizedBox(height: Space.sm),
        TextField(controller: _notes, minLines: 3, maxLines: 10, maxLength: 4000, decoration: field(l.notes, Icons.notes_rounded, 'notes')),
        const SizedBox(height: Space.md),
        FilledButton.icon(
          onPressed: _saving ? null : _save,
          icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_rounded),
          label: Text(l.save),
        ),
      ],
    );
  }
}
