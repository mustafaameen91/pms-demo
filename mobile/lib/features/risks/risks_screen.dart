import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/manage.dart';
import '../../core/manage_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

Tone riskTone(String level) => switch (level) {
  'high' => Tone.danger,
  'medium' => Tone.warning,
  _ => Tone.success,
};

/// Likelihood × impact in a coloured square, with the level in words for screen readers.
class RiskScoreBadge extends StatelessWidget {
  const RiskScoreBadge({super.key, required this.score, required this.level, this.size = 40});
  final int score;
  final String level;
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final tone = riskTone(level);
    final l = context.l10n;
    final word = switch (level) {
      'high' => l.levelHigh,
      'medium' => l.levelMedium,
      _ => l.levelLow,
    };
    return Semantics(
      label: '$word · ${l.score('$score')}',
      excludeSemantics: true,
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: tone.bg(p), borderRadius: BorderRadius.circular(size * 0.28), border: Border.all(color: tone.fg(p).withValues(alpha: 0.4))),
        child: Text('$score', style: context.text.titleMedium!.copyWith(color: tone.fg(p), fontWeight: FontWeight.w800)),
      ),
    );
  }
}

/// A project's risk register: anyone on the team raises a risk; the manager,
/// the owner and whoever raised it keep it up to date.
class RisksScreen extends ConsumerWidget {
  const RisksScreen({super.key, required this.slug, required this.projectId});
  final String slug;
  final String projectId;

  Future<void> _open(BuildContext context, RisksPage page, Risk? risk) => showModalBottomSheet<void>(
    useRootNavigator: true,
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _RiskForm(slug: slug, projectId: projectId, page: page, risk: risk),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final p = context.palette;
    final key = (slug: slug, id: projectId);
    final value = ref.watch(risksProvider(key));
    final page = value.value;
    return Scaffold(
      appBar: BrandAppBar(title: Text(l.risks)),
      floatingActionButton: page == null
          ? null
          : FloatingActionButton.extended(onPressed: () => _open(context, page, null), icon: const Icon(AppIcons.plus), label: Text(l.raiseRisk)),
      body: AsyncBody(
        value: value,
        onRetry: () => ref.invalidate(risksProvider(key)),
        builder: (page) => RefreshIndicator(
          onRefresh: () => ref.refresh(risksProvider(key).future).then((_) {}, onError: (Object _) {}),
          child: page.risks.isEmpty
              ? ListView(children: [EmptyState(icon: AppIcons.shieldCheck, message: l.noRisks)])
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 96),
                  itemCount: page.risks.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.md),
                  itemBuilder: (context, i) {
                    final r = page.risks[i];
                    final closed = r.status == 'closed';
                    return Opacity(
                      key: ValueKey(r.id),
                      opacity: closed ? 0.6 : 1,
                      child: Material(
                        color: p.card,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg), side: BorderSide(color: p.border)),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: r.canEdit ? () => _open(context, page, r) : null,
                          child: Padding(
                            padding: const EdgeInsets.all(Space.lg),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                RiskScoreBadge(score: r.score, level: r.level, size: 44),
                                const SizedBox(width: Space.md),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('${r.key} · ${r.title}', textDirection: textDirOf(r.title), style: context.text.titleMedium),
                                      const SizedBox(height: 2),
                                      Text(
                                        [page.label(page.categories, r.category), page.label(page.statuses, r.status), if (r.owner != null) r.owner!.name].join(' · '),
                                        style: context.text.bodySmall,
                                      ),
                                      if (r.mitigation != null) ...[
                                        const SizedBox(height: Space.sm),
                                        Text(r.mitigation!, textDirection: textDirOf(r.mitigation!), maxLines: 3, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium),
                                      ],
                                    ],
                                  ),
                                ),
                                if (r.canEdit) Icon(AppIcons.pencilSimple, size: 18, color: p.muted),
                              ],
                            ),
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

class _RiskForm extends ConsumerStatefulWidget {
  const _RiskForm({required this.slug, required this.projectId, required this.page, this.risk});
  final String slug;
  final String projectId;
  final RisksPage page;
  final Risk? risk;

  @override
  ConsumerState<_RiskForm> createState() => _RiskFormState();
}

class _RiskFormState extends ConsumerState<_RiskForm> {
  late final _title = TextEditingController(text: widget.risk?.title ?? '');
  late final _mitigation = TextEditingController(text: widget.risk?.mitigation ?? '');
  late String _category = widget.risk?.category ?? 'schedule';
  late int _likelihood = widget.risk?.likelihood ?? 3;
  late int _impact = widget.risk?.impact ?? 3;
  late String _status = widget.risk?.status ?? 'open';
  late String? _owner = widget.risk?.owner?.id;
  bool _saving = false;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    _title.dispose();
    _mitigation.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _errors = const {};
    });
    try {
      final r = await ref.read(manageProvider).saveRisk(widget.slug, widget.projectId, widget.risk?.id, {
        'title': _title.text.trim(),
        'category': _category,
        'likelihood': _likelihood,
        'impact': _impact,
        'status': _status,
        'mitigation': _mitigation.text.trim(),
        'description': widget.risk?.description,
        'ownerId': _owner,
        'taskId': widget.risk?.task?.id,
      });
      if (!mounted) return;
      Navigator.pop(context);
      toastResult(context, r, context.l10n.riskSaved);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errors = e.fields;
      });
      if (e.fields.isEmpty) toastError(context, e);
    }
  }

  Widget _scale(String label, List<ScaleChoice> choices, int value, ValueChanged<int> onChanged, String field) {
    final current = choices.where((c) => c.value == value).firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FieldLabel('$label · ${current?.label ?? value}'),
        SegmentedButton<int>(
          showSelectedIcon: false,
          segments: [for (final c in choices) ButtonSegment(value: c.value, label: Text('${c.value}'), tooltip: c.label)],
          selected: {value},
          onSelectionChanged: (s) {
            HapticFeedback.selectionClick();
            onChanged(s.first);
          },
        ),
        if (_errors[field] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_errors[field]!, style: context.text.bodySmall!.copyWith(color: context.palette.danger))),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final page = widget.page;
    final score = _likelihood * _impact;
    final level = score >= 15 ? 'high' : (score >= 5 ? 'medium' : 'low');
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(widget.risk == null ? l.raiseRisk : '${l.editRisk} ${widget.risk!.key}', style: context.text.titleLarge)),
                RiskScoreBadge(score: score, level: level),
              ],
            ),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _title,
              maxLength: 200,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: l.riskTitle, errorText: _errors['title']),
            ),
            DropdownButtonFormField<String>(
              initialValue: _category,
              isExpanded: true,
              decoration: InputDecoration(labelText: l.category, errorText: _errors['category']),
              items: [for (final c in page.categories) DropdownMenuItem(value: c.value, child: Text(c.label))],
              onChanged: (v) => setState(() => _category = v ?? _category),
            ),
            _scale(l.likelihood, page.likelihood, _likelihood, (v) => setState(() => _likelihood = v), 'likelihood'),
            _scale(l.impact, page.impact, _impact, (v) => setState(() => _impact = v), 'impact'),
            FieldLabel(l.status),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [for (final s in page.statuses) ButtonSegment(value: s.value, label: Text(s.label))],
              selected: {_status},
              onSelectionChanged: (s) => setState(() => _status = s.first),
            ),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _mitigation,
              minLines: 2,
              maxLines: 5,
              maxLength: 2000,
              decoration: InputDecoration(labelText: l.mitigation, alignLabelWithHint: true, errorText: _errors['mitigation']),
            ),
            // Only the manager chooses who owns a risk.
            if (page.manager) ...[
              DropdownButtonFormField<String?>(
                initialValue: _owner,
                isExpanded: true,
                decoration: InputDecoration(labelText: l.riskOwner, prefixIcon: const Icon(AppIcons.user), errorText: _errors['ownerId']),
                items: [
                  DropdownMenuItem<String?>(value: null, child: Text(l.noOwner)),
                  for (final person in page.people) DropdownMenuItem(value: person.id, child: Text(person.name)),
                ],
                onChanged: (v) => setState(() => _owner = v),
              ),
              const SizedBox(height: Space.md),
            ],
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l.save),
            ),
          ],
        ),
      ),
    );
  }
}
