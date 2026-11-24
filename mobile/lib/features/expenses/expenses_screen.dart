import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/work.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

/// The expenses I added, with where each stands; "Add expense" with a receipt photo.
class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final value = ref.watch(expensesProvider(slug));
    return Scaffold(
      appBar: BrandAppBar(title: Text(l.expensesReceipts)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/w/$slug/expenses/new'),
        icon: const Icon(AppIcons.plus),
        label: Text(l.addExpense),
      ),
      body: AsyncBody(
        value: value,
        onRetry: () => ref.invalidate(expensesProvider(slug)),
        builder: (page) => RefreshIndicator(
          onRefresh: () => ref.refresh(expensesProvider(slug).future).then((_) {}, onError: (Object _) {}),
          child: page.expenses.isEmpty
              ? ListView(children: [EmptyState(icon: AppIcons.receipt, message: l.noExpenses)])
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 96),
                  itemCount: page.expenses.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.md),
                  itemBuilder: (context, i) => _ExpenseCard(key: ValueKey(page.expenses[i].id), expense: page.expenses[i], page: page),
                ),
        ),
      ),
    );
  }
}

class _ExpenseCard extends StatelessWidget {
  const _ExpenseCard({super.key, required this.expense, required this.page});
  final Expense expense;
  final ExpensesPage page;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final e = expense;
    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (e.receiptUrl != null)
            Semantics(
              button: true,
              label: l.receipt,
              child: GestureDetector(
                onTap: () => PhotoViewer.open(context, e.receiptUrl!, title: e.description),
                child: ClipRRect(borderRadius: BorderRadius.circular(Radii.sm), child: SizedBox.square(dimension: 56, child: AuthImage(e.receiptUrl!, size: 56))),
              ),
            )
          else
            const ToneIcon(AppIcons.receipt, tone: Tone.neutral, size: 56),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(e.description, style: context.text.titleMedium, maxLines: 2, overflow: TextOverflow.ellipsis)),
                    const SizedBox(width: Space.sm),
                    Text(context.money(e.amount, e.currency), style: context.text.titleMedium!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  [e.project.name, page.categoryLabel(e.category), context.shortDate(e.date), if (e.payee != null) e.payee!].join(' · '),
                  style: context.text.bodySmall,
                ),
                const SizedBox(height: Space.sm),
                Wrap(
                  spacing: Space.sm,
                  runSpacing: 4,
                  children: [
                    ApprovalPill(e.status),
                    if (e.advance)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: p.neutralSoft, borderRadius: BorderRadius.circular(99)),
                        child: Text(l.fromAdvance, style: context.text.labelSmall),
                      ),
                  ],
                ),
                if (e.status == Approval.rejected && e.decisionNote != null) ...[
                  const SizedBox(height: 4),
                  Text(e.decisionNote!, style: context.text.bodySmall!.copyWith(color: p.danger)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
