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

/// My loans and cash advances (what's left of each), my requests, and "Ask for a loan".
class LoansScreen extends ConsumerWidget {
  const LoansScreen({super.key, required this.slug});
  final String slug;

  Future<void> _withdraw(BuildContext context, WidgetRef ref, LoanRequest r) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.withdrawConfirm),
        content: Text('${context.money(r.amount, r.currency)} · ${r.reason}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l.withdraw)),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      final res = await ref.read(workProvider).withdrawLoanRequest(slug, r.id);
      if (context.mounted) toastResult(context, res, l.deleted);
    } catch (e) {
      if (context.mounted) toastError(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final value = ref.watch(loansProvider(slug));
    return Scaffold(
      appBar: BrandAppBar(title: Text(l.myLoans)),
      floatingActionButton: value.value == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => showModalBottomSheet<void>(
                useRootNavigator: true,
                context: context,
                isScrollControlled: true,
                useSafeArea: true,
                builder: (_) => _RequestSheet(slug: slug, currencies: value.value!.currencies, defaultCurrency: value.value!.loans.firstOrNull?.currency),
              ),
              icon: const Icon(AppIcons.plus),
              label: Text(l.askLoan),
            ),
      body: AsyncBody(
        value: value,
        onRetry: () => ref.invalidate(loansProvider(slug)),
        builder: (page) => RefreshIndicator(
          onRefresh: () => ref.refresh(loansProvider(slug).future).then((_) {}, onError: (Object _) {}),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 96),
            children: [
              if (page.loans.isEmpty) EmptyState(icon: AppIcons.money, message: l.noLoans),
              for (final loan in page.loans) Padding(padding: const EdgeInsets.only(bottom: Space.md), child: _LoanCard(loan: loan)),
              if (page.requests.isNotEmpty) ...[
                SectionTitle(l.myRequests),
                for (final r in page.requests)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Space.md),
                    child: AppCard(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(context.money(r.amount, r.currency), style: context.text.titleMedium),
                                Text(r.reason, style: context.text.bodyMedium),
                                const SizedBox(height: Space.sm),
                                ApprovalPill(r.status),
                                if (r.decisionNote != null) ...[
                                  const SizedBox(height: 4),
                                  Text(r.decisionNote!, style: context.text.bodySmall),
                                ],
                              ],
                            ),
                          ),
                          if (r.status == Approval.pending) TextButton(onPressed: () => _withdraw(context, ref, r), child: Text(l.withdraw)),
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LoanCard extends StatelessWidget {
  const _LoanCard({required this.loan});
  final Loan loan;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final x = loan;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ToneIcon(x.project != null ? AppIcons.wallet : AppIcons.money, tone: x.paidOff ? Tone.success : Tone.info),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(x.project != null ? l.cashAdvanceFrom(x.project!.name) : l.loan, style: context.text.titleSmall),
                    Text(l.givenOn(context.shortDate(x.issuedOn)), style: context.text.bodySmall),
                  ],
                ),
              ),
              Text(context.money(x.amount, x.currency), style: context.text.titleMedium!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
          if (x.reason != null) ...[const SizedBox(height: Space.sm), Text(x.reason!, style: context.text.bodyMedium)],
          const SizedBox(height: Space.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(value: x.paidPct / 100, minHeight: 8, backgroundColor: p.neutralSoft, color: x.paidOff ? p.success : context.colors.primary),
          ),
          const SizedBox(height: Space.sm),
          if (x.paidOff)
            Row(children: [Icon(AppIcons.sealCheck, size: 16, color: p.success), const SizedBox(width: 4), Text(l.paidOff, style: context.text.labelMedium!.copyWith(color: p.success))])
          else
            Wrap(
              spacing: Space.lg,
              runSpacing: 4,
              children: [
                _Figure(label: l.stillOwed, value: context.money(x.balance, x.currency), strong: true),
                if (x.returned > 0) _Figure(label: l.returned, value: context.money(x.returned, x.currency)),
                if (x.spent > 0) _Figure(label: l.receipts, value: context.money(x.spent, x.currency)),
              ],
            ),
          if (x.pending > 0) ...[
            const SizedBox(height: Space.sm),
            Text(l.pendingReceipts(context.money(x.pending, x.currency)), style: context.text.bodySmall!.copyWith(color: p.warning)),
          ],
        ],
      ),
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
      Text(value, style: (strong ? context.text.titleSmall : context.text.bodyMedium)!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
    ],
  );
}

class _RequestSheet extends ConsumerStatefulWidget {
  const _RequestSheet({required this.slug, required this.currencies, this.defaultCurrency});
  final String slug;
  final List<String> currencies;
  final String? defaultCurrency;

  @override
  ConsumerState<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends ConsumerState<_RequestSheet> {
  final _amount = TextEditingController();
  final _reason = TextEditingController();
  late String _currency = widget.defaultCurrency ?? (widget.currencies.contains('IQD') ? 'IQD' : widget.currencies.firstOrNull ?? 'USD');
  bool _saving = false;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _saving = true;
      _errors = const {};
    });
    try {
      final r = await ref.read(workProvider).requestLoan(widget.slug, amount: _amount.text.trim().replaceAll(',', ''), currency: _currency, reason: _reason.text.trim());
      if (!mounted) return;
      Navigator.pop(context);
      toastResult(context, r, context.l10n.requestSent);
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
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.askLoan, style: context.text.titleLarge),
            const SizedBox(height: Space.lg),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _amount,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    decoration: InputDecoration(labelText: l.amount, errorText: _errors['amount']),
                  ),
                ),
                const SizedBox(width: Space.md),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    initialValue: _currency,
                    decoration: InputDecoration(labelText: l.currency, errorText: _errors['currency']),
                    items: [for (final c in widget.currencies) DropdownMenuItem(value: c, child: Text(c))],
                    onChanged: (v) => setState(() => _currency = v ?? _currency),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Space.md),
            TextField(
              controller: _reason,
              minLines: 2,
              maxLines: 4,
              maxLength: 500,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: l.loanReason, alignLabelWithHint: true, errorText: _errors['reason']),
            ),
            const SizedBox(height: Space.md),
            FilledButton(
              onPressed: _saving ? null : _send,
              child: _saving ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l.sendRequest),
            ),
          ],
        ),
      ),
    );
  }
}
