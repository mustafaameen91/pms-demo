import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../widgets/common.dart';
import '../../widgets/tab_bar.dart';
import '../../theme/icons.dart';

/// A company's tabs: Home · Tasks · Hours · Inbox · More. Each tab keeps its own
/// screen alive (an IndexedStack), so switching back is instant and keeps the scroll.
class WorkspaceShell extends ConsumerStatefulWidget {
  const WorkspaceShell({super.key, required this.slug, required this.shell});
  final String slug;
  final StatefulNavigationShell shell;

  @override
  ConsumerState<WorkspaceShell> createState() => _WorkspaceShellState();
}

class _WorkspaceShellState extends ConsumerState<WorkspaceShell> {
  // Branch order in the router: home, tasks, hours, inbox, more, projects, approvals.
  static const _paths = ['/home', '/tasks', '/hours', '/inbox', '/more', '/projects', '/approvals'];

  @override
  void initState() {
    super.initState();
    // Remember it so the next launch opens here.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(currentSlugProvider.notifier).open(widget.slug);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final home = ref.watch(homeProvider(widget.slug).select((h) => h.value));
    final view = home?.view ?? ref.watch(sessionProvider.select((s) => s.me?.workspace(widget.slug)?.view)) ?? HomeView.member;
    final unread = home?.unread ?? 0;
    final waiting = home?.manage?.approvals.total ?? 0;
    final manager = view == HomeView.manager;

    // (branch, icon, selected icon, label, badge)
    final items = manager
        ? [
            (0, AppIcons.house, AppIcons.houseFill, l.navHome, 0),
            (5, AppIcons.buildings, AppIcons.buildingsFill, l.navProjects, 0),
            (6, AppIcons.sealCheck, AppIcons.sealCheckFill, l.navApprovals, waiting),
            (3, AppIcons.bell, AppIcons.bellFill, l.navInbox, unread),
            (4, AppIcons.squaresFour, AppIcons.squaresFourFill, l.navMore, 0),
          ]
        : [
            (0, AppIcons.house, AppIcons.houseFill, l.navHome, 0),
            (1, AppIcons.checkSquare, AppIcons.checkSquareFill, l.navTasks, 0),
            (2, AppIcons.clock, AppIcons.clockFill, l.navHours, 0),
            (3, AppIcons.bell, AppIcons.bellFill, l.navInbox, unread),
            (4, AppIcons.squaresFour, AppIcons.squaresFourFill, l.navMore, 0),
          ];
    final branch = widget.shell.currentIndex;
    // A screen opened from More (e.g. a manager's own tasks) keeps More highlighted.
    final selected = items.indexWhere((i) => i.$1 == branch);

    return Scaffold(
      // Screens scroll under the frosted bar; their bottom padding includes its height.
      extendBody: true,
      body: widget.shell,
      bottomNavigationBar: FloatingTabBar(
        selected: selected < 0 ? items.length - 1 : selected,
        // Tapping the open tab again goes back to its start (e.g. Tasks unfiltered).
        onSelect: (i) => context.go('/w/${widget.slug}${_paths[items[i].$1]}'),
        items: [for (final (_, icon, filled, label, count) in items) TabItem(icon: icon, selectedIcon: filled, label: label, count: count)],
      ),
    );
  }
}
