import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/manage.dart';
import '../../core/manage_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';

/// Everything waiting for my decision: expenses, team members' hours, loan requests.
class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> {
  int _tab = 0;

  Future<void> _decide(String kind, String id, {required bool approve, String? label, double? askedAmount, String? currency}) async {
    final l = context.l10n;
    String? note;
    String? amount;
    if (!approve) {
      note = await _askReason(context, label);
      if (note == null) return;
    } else if (kind == 'loans') {
      amount = await _askLoanAmount(context, askedAmount ?? 0, currency ?? '');
      if (amount == null) return;
    }
    try {
      final r = await ref.read(approvalsProvider(widget.slug).notifier).decide(kind, id, approve: approve, note: note, amount: amount);
      if (mounted) toastResult(context, r, approve ? l.approvedToast : l.rejectedToast);
    } catch (e) {
      if (mounted) toastError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final value = ref.watch(approvalsProvider(widget.slug));
    final data = value.value;
    final tabs = [
      (l.expenses, data?.expenses.where((e) => !e.mine).length ?? 0),
      (l.hours, data?.hours.length ?? 0),
      if (data?.canLoans ?? false) (l.loans, data!.loans.length),
    ];
    final tab = _tab.clamp(0, tabs.length - 1);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(approvalsProvider(widget.slug).future).then((_) {}, onError: (Object _) {}),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.medium(title: Text(l.approvals), pinned: true),
            if (data == null)
              SliverFillRemaining(
                hasScrollBody: true,
                child: AsyncBody(value: value, onRetry: () => ref.invalidate(approvalsProvider(widget.slug)), builder: (_) => const SizedBox()),
              )
            else ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.md),
                  child: SegmentedButton<int>(
                    showSelectedIcon: false,
                    segments: [
                      for (final (i, (label, count)) in tabs.indexed) ButtonSegment(value: i, label: Text(count > 0 ? '$label · $count' : label)),
                    ],
                    selected: {tab},
                    onSelectionChanged: (s) {
                      HapticFeedback.selectionClick();
                      setState(() => _tab = s.first);
                    },
                  ),
                ),
              ),
              ..._list(context, data, tab),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _list(BuildContext context, ApprovalsPage data, int tab) {
    final l = context.l10n;
    final cards = switch (tab) {
      0 => [
        for (final e in data.expenses)
          _ApprovalCard(
            key: ValueKey(e.id),
            icon: Icons.receipt_long_rounded,
            title: e.description,
            amount: context.money(e.amount, e.currency),
            lines: [
              '${e.project.name} · ${context.shortDate(e.date)}${e.payee == null ? '' : ' · ${e.payee}'}',
              if (e.requester != null) l.requestedBy(e.requester!),
              if (e.advance) l.fromAdvance,
            ],
            mineNote: e.mine ? l.yourOwnRequest : null,
            onApprove: () => _decide('expenses', e.id, approve: true),
            onReject: () => _decide('expenses', e.id, approve: false, label: e.description),
          ),
      ],
      1 => [
        for (final h in data.hours)
          _ApprovalCard(
            key: ValueKey(h.id),
            icon: Icons.schedule_rounded,
            title: h.person ?? '—',
            amount: l.hoursShort(context.hours(h.hours)),
            lines: [
              '${h.project.name} · ${context.day(h.date)}',
              if (h.task != null) '${h.task!.key} · ${h.task!.title}',
              if (h.note != null) h.note!,
            ],
            onApprove: () => _decide('hours', h.id, approve: true),
            onReject: () => _decide('hours', h.id, approve: false, label: h.person),
          ),
      ],
      _ => [
        for (final r in data.loans)
          _ApprovalCard(
            key: ValueKey(r.id),
            icon: Icons.payments_rounded,
            title: r.person ?? '—',
            amount: context.money(r.amount, r.currency),
            lines: [r.reason, context.ago(r.createdAt)],
            onApprove: () => _decide('loans', r.id, approve: true, askedAmount: r.amount, currency: r.currency),
            onReject: () => _decide('loans', r.id, approve: false, label: r.person),
          ),
      ],
    };
    if (cards.isEmpty) return [SliverToBoxAdapter(child: EmptyState(icon: Icons.verified_rounded, message: l.nothingWaiting))];
    return [
      SliverPadding(
        padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl + MediaQuery.paddingOf(context).bottom),
        sliver: SliverList.separated(itemCount: cards.length, separatorBuilder: (_, _) => const SizedBox(height: Space.md), itemBuilder: (_, i) => cards[i]),
      ),
    ];
  }
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({
    super.key,
    required this.icon,
    required this.title,
    required this.amount,
    required this.lines,
    required this.onApprove,
    required this.onReject,
    this.mineNote,
  });
  final IconData icon;
  final String title;
  final String amount;
  final List<String> lines;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  /// Set when it's my own request: no buttons, just this note.
  final String? mineNote;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ToneIcon(icon, tone: Tone.info),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, textDirection: textDirOf(title), style: context.text.titleMedium),
                    for (final line in lines) Text(line, textDirection: textDirOf(line), style: context.text.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: Space.sm),
              Text(amount, style: context.text.titleMedium!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
          const SizedBox(height: Space.md),
          if (mineNote != null)
            Text(mineNote!, style: context.text.bodySmall!.copyWith(color: p.muted))
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(foregroundColor: p.danger, minimumSize: const Size(0, 48)),
                    onPressed: onReject,
                    icon: const Icon(Icons.close_rounded),
                    label: Text(l.reject),
                  ),
                ),
                const SizedBox(width: Space.md),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                    onPressed: onApprove,
                    icon: const Icon(Icons.check_rounded),
                    label: Text(l.approve),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// A reason is required to reject: the person sees it and can fix things.
Future<String?> _askReason(BuildContext context, String? about) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => _TextSheet(
    title: context.l10n.rejectWhy,
    subtitle: about,
    hint: context.l10n.rejectWhyHint,
    action: context.l10n.reject,
    danger: true,
  ),
);

Future<String?> _askLoanAmount(BuildContext context, double asked, String currency) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => _TextSheet(
    title: context.l10n.approveLoan,
    label: context.l10n.loanAmountToLend,
    initial: asked == asked.roundToDouble() ? asked.toInt().toString() : asked.toString(),
    suffix: currency,
    number: true,
    action: context.l10n.approve,
  ),
);

class _TextSheet extends StatefulWidget {
  const _TextSheet({
    required this.title,
    required this.action,
    this.subtitle,
    this.hint,
    this.label,
    this.initial,
    this.suffix,
    this.number = false,
    this.danger = false,
  });
  final String title;
  final String action;
  final String? subtitle;
  final String? hint;
  final String? label;
  final String? initial;
  final String? suffix;
  final bool number;
  final bool danger;

  @override
  State<_TextSheet> createState() => _TextSheetState();
}

class _TextSheetState extends State<_TextSheet> {
  late final _text = TextEditingController(text: widget.initial);
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _done() {
    final v = _text.text.trim().replaceAll(',', '');
    if (v.isEmpty) return setState(() => _error = context.l10n.fieldRequired);
    Navigator.pop(context, v);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: context.text.titleLarge),
            if (widget.subtitle != null) Text(widget.subtitle!, style: context.text.bodySmall),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _text,
              autofocus: true,
              minLines: widget.number ? 1 : 2,
              maxLines: widget.number ? 1 : 4,
              maxLength: widget.number ? null : 500,
              keyboardType: widget.number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.multiline,
              inputFormatters: widget.number ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))] : null,
              decoration: InputDecoration(labelText: widget.label, helperText: widget.hint, suffixText: widget.suffix, errorText: _error, alignLabelWithHint: true),
            ),
            const SizedBox(height: Space.md),
            FilledButton(
              style: widget.danger ? FilledButton.styleFrom(backgroundColor: p.danger) : null,
              onPressed: _done,
              child: Text(widget.action),
            ),
          ],
        ),
      ),
    );
  }
}
