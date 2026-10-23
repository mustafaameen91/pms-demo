import 'dart:async';
import 'dart:io';

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

/// Add an expense: amount, category, what it was for, and a photo of the receipt.
/// Bought with a cash advance? Link it, and it settles the advance once approved.
class ExpenseFormScreen extends ConsumerStatefulWidget {
  const ExpenseFormScreen({super.key, required this.slug, this.projectId});
  final String slug;
  final String? projectId;

  @override
  ConsumerState<ExpenseFormScreen> createState() => _ExpenseFormScreenState();
}

class _ExpenseFormScreenState extends ConsumerState<ExpenseFormScreen> {
  String? _project;
  String _category = 'materials';
  String? _advance;
  String? _task;
  String _date = todayIso();
  String? _receipt;
  final _amount = TextEditingController();
  final _description = TextEditingController();
  final _payee = TextEditingController();
  bool _saving = false;
  Map<String, String> _errors = const {};

  @override
  void initState() {
    super.initState();
    _project = widget.projectId;
  }

  @override
  void dispose() {
    _amount.dispose();
    _description.dispose();
    _payee.dispose();
    super.dispose();
  }

  Future<void> _pickReceipt() async {
    final path = await pickPhoto(context);
    if (path != null) setState(() => _receipt = path);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(context: context, initialDate: DateTime.parse(_date), firstDate: DateTime(now.year - 2), lastDate: now);
    if (picked != null) setState(() => _date = isoOf(picked));
  }

  Future<void> _save() async {
    final l = context.l10n;
    final errors = <String, String>{
      if (_project == null) 'projectId': l.chooseProject,
      if (_amount.text.trim().isEmpty) 'amount': l.fieldRequired,
      if (_description.text.trim().isEmpty) 'description': l.fieldRequired,
    };
    if (errors.isNotEmpty) return setState(() => _errors = errors);
    setState(() {
      _saving = true;
      _errors = const {};
    });
    try {
      final r = await ref.read(workProvider).addExpense(widget.slug, {
        'projectId': _project!,
        'date': _date,
        'amount': _amount.text.trim().replaceAll(',', ''),
        'category': _category,
        'description': _description.text.trim(),
        if (_payee.text.trim().isNotEmpty) 'payee': _payee.text.trim(),
        'taskId': ?_task,
        'loanId': ?_advance,
      }, receipt: _receipt);
      if (!mounted) return;
      unawaited(HapticFeedback.lightImpact());
      toast(context, r.pending ? l.expensePending : (r.warning ?? l.expenseSaved), warning: r.warning != null);
      Navigator.pop(context);
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
    final p = context.palette;
    final projects = ref.watch(projectsProvider(widget.slug));
    final page = ref.watch(expensesProvider(widget.slug)).value;
    final list = projects.value ?? const <ProjectRef>[];
    if (_project == null && list.length == 1) _project = list.first.id;
    ProjectRef? project;
    for (final x in list) {
      if (x.id == _project) project = x;
    }
    final advances = [for (final a in page?.advances ?? const <Advance>[]) if (a.projectId == _project) a];
    final tasks = _project == null ? null : ref.watch(projectTasksProvider((slug: widget.slug, id: _project!))).value;

    return Scaffold(
      appBar: AppBar(title: Text(l.addExpense)),
      body: projects.value == null
          ? AsyncBody(value: projects, onRetry: () => ref.invalidate(projectsProvider(widget.slug)), builder: (_) => const SizedBox())
          : list.isEmpty
          ? EmptyState(icon: Icons.apartment_rounded, message: l.notOnProjects)
          : ListView(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl),
              children: [
                ProjectField(
                  projects: list,
                  value: _project,
                  error: _errors['projectId'],
                  onChanged: (v) => setState(() {
                    _project = v;
                    _advance = null;
                    _task = null;
                  }),
                ),
                const SizedBox(height: Space.md),
                TextField(
                  controller: _amount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                  style: context.text.headlineSmall!.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                  decoration: InputDecoration(
                    labelText: l.amount,
                    prefixIcon: const Icon(Icons.payments_outlined),
                    suffixText: project?.currency,
                    errorText: _errors['amount'],
                  ),
                ),
                FieldLabel(l.category),
                Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: [
                    for (final c in page?.categories ?? const <Choice>[])
                      ChoiceChip(
                        showCheckmark: false,
                        label: Text(c.label),
                        selected: _category == c.value,
                        onSelected: (_) {
                          HapticFeedback.selectionClick();
                          setState(() => _category = c.value);
                        },
                      ),
                  ],
                ),
                const SizedBox(height: Space.lg),
                TextField(
                  controller: _description,
                  maxLength: 300,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(labelText: l.whatFor, prefixIcon: const Icon(Icons.edit_note_rounded), errorText: _errors['description']),
                ),
                const SizedBox(height: Space.sm),
                TextField(
                  controller: _payee,
                  maxLength: 120,
                  decoration: InputDecoration(labelText: l.payeeOptional, prefixIcon: const Icon(Icons.storefront_outlined), errorText: _errors['payee']),
                ),
                const SizedBox(height: Space.sm),
                InkWell(
                  borderRadius: BorderRadius.circular(Radii.md),
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: InputDecoration(labelText: l.date, prefixIcon: const Icon(Icons.event_rounded), errorText: _errors['date']),
                    child: Text(context.day(_date), style: context.text.bodyLarge),
                  ),
                ),
                const SizedBox(height: Space.md),
                DropdownButtonFormField<String?>(
                  key: ValueKey('task-$_project-${tasks?.tasks.length}'),
                  initialValue: _task,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.taskOptional, prefixIcon: const Icon(Icons.task_alt_rounded), errorText: _errors['taskId']),
                  items: [
                    DropdownMenuItem<String?>(value: null, child: Text(l.noTask)),
                    for (final t in tasks?.tasks ?? const <TaskLink>[])
                      DropdownMenuItem(value: t.id, child: Text('${t.key} · ${t.title}', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _task = v),
                ),
                if (advances.isNotEmpty) ...[
                  FieldLabel(l.fromAdvance),
                  RadioGroup<String?>(
                    groupValue: _advance,
                    onChanged: (v) => setState(() => _advance = v),
                    child: AppCard(
                      padding: const EdgeInsets.symmetric(vertical: Space.xs),
                      child: Column(
                        children: [
                          RadioListTile<String?>(value: null, title: Text(l.notFromAdvance)),
                          for (final a in advances)
                            RadioListTile<String?>(
                              value: a.id,
                              title: Text(a.reason ?? context.money(a.amount, a.currency)),
                              subtitle: Text(l.amountLeft(context.money(a.open, a.currency))),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (_errors['loanId'] != null)
                    Padding(padding: const EdgeInsets.only(top: 4), child: Text(_errors['loanId']!, style: context.text.bodySmall!.copyWith(color: p.danger))),
                ],
                FieldLabel(l.receipt),
                if (_receipt == null)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(64)),
                    onPressed: _pickReceipt,
                    icon: const Icon(Icons.add_a_photo_rounded),
                    label: Text(l.addReceipt),
                  )
                else
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(Radii.md),
                        child: Image.file(File(_receipt!), height: 220, width: double.infinity, fit: BoxFit.cover, cacheWidth: 900),
                      ),
                      PositionedDirectional(
                        top: Space.sm,
                        end: Space.sm,
                        child: FilledButton.tonalIcon(
                          onPressed: () => setState(() => _receipt = null),
                          icon: const Icon(Icons.close_rounded),
                          label: Text(l.remove),
                        ),
                      ),
                    ],
                  ),
                if (_errors['receipt'] != null)
                  Padding(padding: const EdgeInsets.only(top: 4), child: Text(_errors['receipt']!, style: context.text.bodySmall!.copyWith(color: p.danger))),
              ],
            ),
      // Always in reach, above the keyboard.
      bottomNavigationBar: list.isEmpty
          ? null
          : StickyAction(
              child: FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l.save),
              ),
            ),
    );
  }
}
