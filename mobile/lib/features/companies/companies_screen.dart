import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../widgets/motion.dart';
import '../account/account_sheet.dart';
import 'company_tile.dart';
import '../../theme/icons.dart';

class CompaniesScreen extends ConsumerWidget {
  const CompaniesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final me = ref.watch(sessionProvider.select((s) => s.me));
    if (me == null) return const Scaffold();
    final workspaces = me.workspaces;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.read(sessionProvider.notifier).refresh(),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverSafeArea(
              bottom: false,
              sliver: SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
                sliver: SliverToBoxAdapter(
                  child: Row(
                    children: [
                      const BrandMark(size: 40),
                      const SizedBox(width: Space.md),
                      const BrandWordmark(size: 24),
                      const Spacer(),
                      IconButton(
                        tooltip: l.account,
                        onPressed: () => showAccountSheet(context),
                        icon: InitialsAvatar(name: me.user.name, size: 40),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (workspaces.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: ErrorPanel(
                    icon: AppIcons.prohibit,
                    title: l.noCompanies,
                    message: l.noCompaniesHint,
                    actions: [
                      OutlinedButton.icon(
                        onPressed: () => ref.read(sessionProvider.notifier).refresh(),
                        icon: const Icon(AppIcons.arrowClockwise),
                        label: Text(l.tryAgain),
                      ),
                      TextButton(onPressed: () => ref.read(sessionProvider.notifier).signOut(), child: Text(l.signOut)),
                    ],
                  ),
                ),
              )
            else ...[
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.gutter, Space.xxl, Space.gutter, Space.xl),
                sliver: SliverToBoxAdapter(
                  child: Entrance(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(l.chooseCompany, style: context.text.headlineMedium)),
                        const SizedBox(height: Space.sm),
                        Text(l.chooseCompanySubtitle, style: context.text.bodyLarge!.copyWith(color: context.palette.muted)),
                      ],
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, MediaQuery.paddingOf(context).bottom + Space.xxl),
                sliver: SliverList.separated(
                  itemCount: workspaces.length,
                  separatorBuilder: (context, i) => const SizedBox(height: Space.md),
                  itemBuilder: (context, i) {
                    final w = workspaces[i];
                    return Entrance(
                      key: ValueKey(w.id),
                      delay: Duration(milliseconds: 60 + 40 * i.clamp(0, 8)),
                      child: CompanyTile(
                        workspace: w,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref.read(currentSlugProvider.notifier).open(w.slug);
                          context.go('/w/${w.slug}');
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
