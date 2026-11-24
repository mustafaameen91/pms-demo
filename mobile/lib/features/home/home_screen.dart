import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../widgets/motion.dart';
import '../account/account_sheet.dart';
import 'home_sections.dart';
import '../../theme/icons.dart';

/// One home for everyone; what's on it follows the person's role in this
/// company: members see their own work, managers see what needs them first.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  Future<void> _refresh() async {
    await Future.wait<void>([
      ref.refresh(homeProvider(widget.slug).future).then((_) {}, onError: (Object _) {}),
      ref.read(sessionProvider.notifier).refresh(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final slug = widget.slug;
    final home = ref.watch(homeProvider(slug));
    final me = ref.watch(sessionProvider.select((s) => s.me));
    final workspace = me?.workspace(slug);
    if (me == null || workspace == null) return const Scaffold();

    final data = home.value;
    final error = home.error;
    final locked = error is ApiException && error.failure == ApiFailure.locked;
    final view = data?.view ?? workspace.view;

    final List<Widget> body;
    if (locked) {
      body = [
        _Locked(
          message: error.message,
          canSwitch: me.workspaces.length > 1,
          onSwitch: () => showCompanySwitcher(context, slug),
        ),
      ];
    } else if (data == null && error != null) {
      body = [
        ErrorPanel(
          icon: AppIcons.cloudSlash,
          title: errorText(context, error),
          actions: [
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size(180, 52)),
              onPressed: () => ref.invalidate(homeProvider(slug)),
              icon: const Icon(AppIcons.arrowClockwise),
              label: Text(context.l10n.tryAgain),
            ),
          ],
        ),
      ];
    } else if (data == null) {
      body = const [HomeSkeleton()];
    } else {
      body = [
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.md),
            child: InlineBanner(icon: AppIcons.cloudSlash, message: context.l10n.showingSaved, tone: Tone.warning),
          ),
        if (view == HomeView.manager) ...managerHome(context, slug, data) else ...memberHome(context, slug, data),
      ];
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: RefreshIndicator(
          onRefresh: _refresh,
          edgeOffset: MediaQuery.paddingOf(context).top,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _Header(
                  user: me.user,
                  workspace: workspace,
                  canSwitch: me.workspaces.length > 1,
                  home: locked ? null : data,
                  view: view,
                  refreshing: home.isLoading && data != null,
                  focus: locked || (data == null && error != null)
                      ? null
                      : data == null
                      ? const FocusSkeleton()
                      : view == HomeView.manager
                      ? ManagerFocusCard(home: data)
                      : MemberFocusCard(slug: slug, tasks: data.myTasks),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, MediaQuery.paddingOf(context).bottom + Space.xxxl),
                sliver: SliverList.list(children: body),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.user,
    required this.workspace,
    required this.canSwitch,
    required this.home,
    required this.view,
    required this.refreshing,
    required this.focus,
  });

  final User user;
  final Workspace workspace;
  final bool canSwitch;
  final Home? home;
  final HomeView view;
  final bool refreshing;

  /// The card that sits half on the brand header.
  final Widget? focus;

  static const _overlap = 64.0;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final top = MediaQuery.paddingOf(context).top;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final now = DateTime.now();
    final greeting = switch (now.hour) {
      < 12 => l.goodMorning(user.firstName),
      < 17 => l.goodAfternoon(user.firstName),
      _ => l.goodEvening(user.firstName),
    };
    final onHero = Colors.white.withValues(alpha: 0.82);

    return Stack(
      children: [
        Positioned.fill(
          bottom: focus == null ? 0 : _overlap,
          child: const HeroBackdrop(borderRadius: BorderRadius.vertical(bottom: Radius.circular(Radii.xl))),
        ),
        if (refreshing)
          Positioned(
            top: top,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(minHeight: 2, color: Colors.white.withValues(alpha: 0.7)),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(Space.gutter, top + Space.sm, Space.gutter, focus == null ? Space.xxl : 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: _CompanyButton(name: home?.workspaceName ?? workspace.name, canSwitch: canSwitch, slug: workspace.slug),
                  ),
                  const SizedBox(width: Space.sm),
                  IconButton(
                    tooltip: l.account,
                    onPressed: () => showAccountSheet(context),
                    icon: InitialsAvatar(name: user.name, size: 40, onHero: true),
                  ),
                ],
              ),
              const SizedBox(height: Space.xl),
              Entrance(
                child: Text(
                  DateFormat.MMMMEEEEd(locale).format(now),
                  style: context.text.labelLarge!.copyWith(color: onHero, fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(height: Space.xs),
              Entrance(
                delay: const Duration(milliseconds: 40),
                child: Text(greeting, style: context.text.headlineMedium!.copyWith(color: Colors.white)),
              ),
              const SizedBox(height: Space.sm),
              Entrance(
                delay: const Duration(milliseconds: 80),
                child: Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (home != null)
                      Text(l.needsYouToday(home!.myTasks.needsYouToday), style: context.text.bodyLarge!.copyWith(color: onHero)),
                    if (view == HomeView.manager) _HeroChip(icon: AppIcons.chartLineUp, label: l.managerView),
                    if ((home?.unread ?? workspace.unread) > 0)
                      _HeroChip(icon: AppIcons.bell, label: l.unreadNotifications(home?.unread ?? workspace.unread)),
                  ],
                ),
              ),
              if (focus != null) ...[
                const SizedBox(height: Space.xxl),
                Entrance(delay: const Duration(milliseconds: 120), child: focus!),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _CompanyButton extends StatelessWidget {
  const _CompanyButton({required this.name, required this.canSwitch, required this.slug});
  final String name;
  final bool canSwitch;
  final String slug;

  @override
  Widget build(BuildContext context) {
    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(9)),
          child: const Icon(AppIcons.buildings, size: 18, color: Colors.white),
        ),
        const SizedBox(width: Space.sm),
        Flexible(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: context.text.titleMedium!.copyWith(color: Colors.white),
          ),
        ),
        if (canSwitch) ...[
          const SizedBox(width: 2),
          const Icon(AppIcons.caretUpDown, size: 20, color: Colors.white),
        ],
      ],
    );
    if (!canSwitch) return Align(alignment: AlignmentDirectional.centerStart, child: content);
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Semantics(
        button: true,
        hint: context.l10n.switchCompany,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => showCompanySwitcher(context, slug),
          child: Padding(padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4), child: content),
        ),
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: Colors.white),
          const SizedBox(width: 5),
          Text(label, style: context.text.labelMedium!.copyWith(color: Colors.white)),
        ],
      ),
    );
  }
}

class _Locked extends ConsumerWidget {
  const _Locked({required this.message, required this.canSwitch, required this.onSwitch});
  final String? message;
  final bool canSwitch;
  final VoidCallback onSwitch;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return ErrorPanel(
      icon: AppIcons.lock,
      title: l.lockedTitle,
      message: message ?? l.lockedHint,
      actions: [
        if (canSwitch)
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size(200, 52)),
            onPressed: onSwitch,
            icon: const Icon(AppIcons.arrowsLeftRight),
            label: Text(l.switchCompany),
          ),
        TextButton(
          onPressed: () => ref.read(sessionProvider.notifier).signOut(),
          child: Text(l.signOut),
        ),
      ],
    );
  }
}
