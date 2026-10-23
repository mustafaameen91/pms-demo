import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/models.dart';
import 'core/providers.dart';
import 'features/companies/companies_screen.dart';
import 'features/home/home_screen.dart';
import 'features/login/login_screen.dart';
import 'features/splash_screen.dart';

/// Screens follow the session: signed out → login; one company → its home;
/// several → the last one opened, or the company picker.
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

  return GoRouter(
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
        pageBuilder: (context, state) {
          final slug = state.pathParameters['slug']!;
          return _fade(state, HomeScreen(key: ValueKey(slug), slug: slug));
        },
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
