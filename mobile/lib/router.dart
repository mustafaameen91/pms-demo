import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/models.dart';
import 'core/providers.dart';
import 'features/approvals/approvals_screen.dart';
import 'features/attendance/attendance_screen.dart';
import 'features/companies/companies_screen.dart';
import 'features/expenses/expense_form_screen.dart';
import 'features/expenses/expenses_screen.dart';
import 'features/home/home_screen.dart';
import 'features/hours/hours_screen.dart';
import 'features/inbox/inbox_screen.dart';
import 'features/loans/loans_screen.dart';
import 'features/login/login_screen.dart';
import 'features/more/more_screen.dart';
import 'features/photos/photos_screen.dart';
import 'features/projects/project_screen.dart';
import 'features/projects/projects_screen.dart';
import 'features/reports/reports_screen.dart';
import 'features/risks/risks_screen.dart';
import 'features/shell/workspace_shell.dart';
import 'features/site_log/site_log_screen.dart';
import 'features/splash_screen.dart';
import 'features/tasks/task_screen.dart';
import 'features/tasks/tasks_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Screens follow the session: signed out → login; one company → its home;
/// several → the last one opened, or the company picker.
///
/// Inside a company: five tabs (each keeps its own place and scroll), and
/// pages that open over the tabs (a task, the site log, photos, expenses, loans).
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(sessionProvider, (prev, next) {
    // Only a change of who is signed in (or their companies) moves screens.
    if (prev?.status != next.status || !identical(prev?.me, next.me)) refresh.value++;
  });
  ref.onDispose(refresh.dispose);

  String landing(Me me) {
    final last = ref.read(currentSlugProvider);
    if (me.workspace(last) != null) return '/w/$last';
    if (me.workspaces.length == 1) return '/w/${me.workspaces.first.slug}';
    return '/companies';
  }

  String slugOf(GoRouterState s) => s.pathParameters['slug']!;

  GoRoute page(String path, Widget Function(String slug, GoRouterState s) build) => GoRoute(
    path: path,
    parentNavigatorKey: rootNavigatorKey,
    builder: (context, state) => build(slugOf(state), state),
  );

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final path = state.uri.path;
      switch (session.status) {
        case SessionStatus.starting:
          return path == '/' ? null : '/';
        case SessionStatus.signedOut:
          return path == '/login' ? null : '/login';
        case SessionStatus.signedIn:
          final me = session.me!;
          if (path == '/' || path == '/login') return landing(me);
          final segments = state.uri.pathSegments;
          if (segments.length >= 2 && segments.first == 'w' && me.workspace(segments[1]) == null) {
            return me.workspaces.length == 1 ? '/w/${me.workspaces.first.slug}' : '/companies';
          }
          return null;
      }
    },
    routes: [
      GoRoute(path: '/', pageBuilder: (context, state) => _fade(state, const SplashScreen())),
      GoRoute(path: '/login', pageBuilder: (context, state) => _fade(state, const LoginScreen())),
      GoRoute(path: '/companies', pageBuilder: (context, state) => _fade(state, const CompaniesScreen())),
      GoRoute(
        path: '/w/:slug',
        // A company's address on its own opens its home tab.
        redirect: (context, state) => state.uri.pathSegments.length == 2 ? '/w/${slugOf(state)}/home' : null,
        routes: [
          StatefulShellRoute.indexedStack(
            pageBuilder: (context, state, shell) =>
                _fade(state, WorkspaceShell(key: ValueKey(slugOf(state)), slug: slugOf(state), shell: shell)),
            branches: [
              StatefulShellBranch(
                routes: [GoRoute(path: 'home', builder: (context, state) => HomeScreen(key: ValueKey(slugOf(state)), slug: slugOf(state)))],
              ),
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: 'tasks',
                    builder: (context, state) =>
                        TasksScreen(key: ValueKey(slugOf(state)), slug: slugOf(state), group: state.uri.queryParameters['group']),
                  ),
                ],
              ),
              StatefulShellBranch(
                routes: [GoRoute(path: 'hours', builder: (context, state) => HoursScreen(key: ValueKey(slugOf(state)), slug: slugOf(state)))],
              ),
              StatefulShellBranch(
                routes: [GoRoute(path: 'inbox', builder: (context, state) => InboxScreen(key: ValueKey(slugOf(state)), slug: slugOf(state)))],
              ),
              StatefulShellBranch(
                routes: [GoRoute(path: 'more', builder: (context, state) => MoreScreen(key: ValueKey(slugOf(state)), slug: slugOf(state)))],
              ),
              // Managers' tabs (the shell shows them instead of Tasks and Hours).
              StatefulShellBranch(
                routes: [GoRoute(path: 'projects', builder: (context, state) => ProjectsScreen(key: ValueKey(slugOf(state)), slug: slugOf(state)))],
              ),
              StatefulShellBranch(
                routes: [GoRoute(path: 'approvals', builder: (context, state) => ApprovalsScreen(key: ValueKey(slugOf(state)), slug: slugOf(state)))],
              ),
            ],
          ),
          page('task/:id', (slug, s) => TaskScreen(slug: slug, id: s.pathParameters['id']!)),
          page('site-log', (slug, s) => SiteLogScreen(slug: slug, projectId: s.uri.queryParameters['project'])),
          page('photos', (slug, s) => PhotosScreen(slug: slug, projectId: s.uri.queryParameters['project'])),
          page('expenses', (slug, s) => ExpensesScreen(slug: slug)),
          page('expenses/new', (slug, s) => ExpenseFormScreen(slug: slug, projectId: s.uri.queryParameters['project'])),
          page('loans', (slug, s) => LoansScreen(slug: slug)),
          page('project/:id', (slug, s) => ProjectScreen(slug: slug, id: s.pathParameters['id']!)),
          page('project/:id/attendance', (slug, s) => AttendanceScreen(slug: slug, projectId: s.pathParameters['id']!)),
          page('project/:id/risks', (slug, s) => RisksScreen(slug: slug, projectId: s.pathParameters['id']!)),
          page('reports', (slug, s) => ReportsScreen(slug: slug)),
          page('reports/:week', (slug, s) => ReportScreen(slug: slug, week: s.pathParameters['week']!)),
        ],
      ),
    ],
  );
});

/// These screens replace each other (they aren't stacked), so a quick
/// cross-fade reads better than a slide.
CustomTransitionPage<void> _fade(GoRouterState state, Widget child) => CustomTransitionPage<void>(
  key: state.pageKey,
  child: child,
  transitionDuration: const Duration(milliseconds: 280),
  reverseTransitionDuration: const Duration(milliseconds: 180),
  transitionsBuilder: (context, animation, secondary, child) => FadeTransition(
    opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
    child: child,
  ),
);
