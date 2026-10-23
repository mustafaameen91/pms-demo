import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
  static const _paths = ['/home', '/tasks', '/hours', '/inbox', '/more'];

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
    final unread = ref.watch(homeProvider(widget.slug).select((h) => h.value?.unread ?? 0));
    final index = widget.shell.currentIndex;
    return Scaffold(
      body: widget.shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) {
          HapticFeedback.selectionClick();
          // Tapping the open tab again goes back to its start (e.g. Tasks unfiltered).
          context.go('/w/${widget.slug}${_paths[i]}');
        },
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: l.navHome),
          NavigationDestination(icon: const Icon(Icons.task_alt_outlined), selectedIcon: const Icon(Icons.task_alt_rounded), label: l.navTasks),
          NavigationDestination(icon: const Icon(Icons.schedule_outlined), selectedIcon: const Icon(Icons.schedule_rounded), label: l.navHours),
          NavigationDestination(
            icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_none_rounded)),
            selectedIcon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_rounded)),
            label: l.navInbox,
          ),
          NavigationDestination(icon: const Icon(Icons.grid_view_outlined), selectedIcon: const Icon(Icons.grid_view_rounded), label: l.navMore),
        ],
      ),
    );
  }
}
