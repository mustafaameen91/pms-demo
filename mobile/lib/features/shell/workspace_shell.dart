import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../widgets/common.dart';

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

    Widget badge(int n, IconData icon) => Badge(isLabelVisible: n > 0, label: Text('$n'), child: Icon(icon));
    // (branch, outlined icon, filled icon, label, badge)
    final items = manager
        ? [
            (0, Icons.home_outlined, Icons.home_rounded, l.navHome, 0),
            (5, Icons.insights_outlined, Icons.insights_rounded, l.navProjects, 0),
            (6, Icons.fact_check_outlined, Icons.fact_check_rounded, l.navApprovals, waiting),
            (3, Icons.notifications_none_rounded, Icons.notifications_rounded, l.navInbox, unread),
            (4, Icons.grid_view_outlined, Icons.grid_view_rounded, l.navMore, 0),
          ]
        : [
            (0, Icons.home_outlined, Icons.home_rounded, l.navHome, 0),
            (1, Icons.task_alt_outlined, Icons.task_alt_rounded, l.navTasks, 0),
            (2, Icons.schedule_outlined, Icons.schedule_rounded, l.navHours, 0),
            (3, Icons.notifications_none_rounded, Icons.notifications_rounded, l.navInbox, unread),
            (4, Icons.grid_view_outlined, Icons.grid_view_rounded, l.navMore, 0),
          ];
    final branch = widget.shell.currentIndex;
    // A screen opened from More (e.g. a manager's own tasks) keeps More highlighted.
    final selected = items.indexWhere((i) => i.$1 == branch);

    return Scaffold(
      body: widget.shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected < 0 ? items.length - 1 : selected,
        onDestinationSelected: (i) {
          HapticFeedback.selectionClick();
          // Tapping the open tab again goes back to its start (e.g. Tasks unfiltered).
          context.go('/w/${widget.slug}${_paths[items[i].$1]}');
        },
        destinations: [
          for (final (_, icon, filled, label, count) in items)
            NavigationDestination(icon: badge(count, icon), selectedIcon: badge(count, filled), label: label),
        ],
      ),
    );
  }
}
