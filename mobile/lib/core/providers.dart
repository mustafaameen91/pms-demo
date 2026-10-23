import 'dart:async';
import 'dart:convert';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';
import 'storage.dart';

/// What was on the phone at launch; provided in main().
final bootProvider = Provider<Boot>((ref) => throw UnimplementedError('bootProvider is set in main()'));

final storeProvider = Provider<Store>((ref) => Store());

// ── Language & appearance ────────────────────────────────────────────────

/// null = follow the phone.
class LanguageController extends Notifier<String?> {
  @override
  String? build() {
    final v = ref.read(bootProvider).values[Store.locale];
    return v == 'ar' || v == 'en' ? v : null;
  }

  void set(String? code) {
    state = code;
    unawaited(ref.read(storeProvider).write(Store.locale, code));
  }
}

final languageProvider = NotifierProvider<LanguageController, String?>(LanguageController.new);

/// The language in use: the chosen one, else the phone's when it's Arabic, else English.
String resolveLanguage(String? chosen) {
  if (chosen != null) return chosen;
  for (final l in PlatformDispatcher.instance.locales) {
    if (l.languageCode == 'ar' || l.languageCode == 'en') return l.languageCode;
  }
  return 'en';
}

class ThemeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => switch (ref.read(bootProvider).values[Store.theme]) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  void set(ThemeMode mode) {
    state = mode;
    unawaited(ref.read(storeProvider).write(Store.theme, mode == ThemeMode.system ? null : mode.name));
  }
}

final themeModeProvider = NotifierProvider<ThemeController, ThemeMode>(ThemeController.new);

// ── API ──────────────────────────────────────────────────────────────────

final apiProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    token: () => ref.read(sessionProvider).token,
    language: () => resolveLanguage(ref.read(languageProvider)),
    onUnauthorized: (message) => ref.read(sessionProvider.notifier).expired(message),
  ),
);

// ── Session ──────────────────────────────────────────────────────────────

enum SessionStatus { starting, signedOut, signedIn }

@immutable
class SessionState {
  const SessionState._(this.status, {this.token, this.me, this.message, this.startFailed = false});

  const SessionState.starting({bool failed = false}) : this._(SessionStatus.starting, startFailed: failed);
  const SessionState.signedOut([String? message]) : this._(SessionStatus.signedOut, message: message);
  const SessionState.signedIn(String token, Me me) : this._(SessionStatus.signedIn, token: token, me: me);

  final SessionStatus status;
  final String? token;
  final Me? me;

  /// Why the person was signed out (shown once on the login screen).
  final String? message;

  /// Signed in on this phone but the profile couldn't be loaded (offline at first launch).
  final bool startFailed;
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    final saved = ref.read(bootProvider).values;
    final token = saved[Store.token];
    if (token == null) return const SessionState.signedOut();
    final me = _decodeMe(saved[Store.me]);
    // Open straight away from what's saved, then refresh in the background.
    unawaited(Future(refresh));
    return me == null ? const SessionState.starting() : SessionState.signedIn(token, me);
  }

  /// Reload my companies and roles (e.g. after pull-to-refresh).
  Future<void> refresh() async {
    final token = state.token ?? ref.read(bootProvider).values[Store.token];
    if (token == null) return;
    if (state.status == SessionStatus.starting) state = const SessionState.starting();
    try {
      final (me, raw) = await ref.read(apiProvider).me(token: token);
      if (!ref.mounted || state.status == SessionStatus.signedOut) return;
      state = SessionState.signedIn(token, me);
      unawaited(ref.read(storeProvider).write(Store.me, raw));
    } on ApiException catch (e) {
      // 401 is handled by expired(); offline keeps whatever we have.
      if (e.failure != ApiFailure.unauthorized && state.status == SessionStatus.starting) {
        state = const SessionState.starting(failed: true);
      }
    }
  }

  Future<void> signIn(String email, String password) async {
    final (token, me) = await ref.read(apiProvider).signIn(email, password);
    final store = ref.read(storeProvider);
    await store.write(Store.token, token);
    unawaited(store.write(Store.me, jsonEncode(_meJson(me))));
    state = SessionState.signedIn(token, me);
  }

  Future<void> signOut() async {
    final token = state.token;
    await _forget();
    state = const SessionState.signedOut();
    if (token != null) unawaited(ref.read(apiProvider).signOut(token));
  }

  /// The server no longer accepts the token (signed out elsewhere, password changed…).
  void expired(String? message) {
    if (state.status == SessionStatus.signedOut) return;
    unawaited(_forget());
    state = SessionState.signedOut(message);
  }

  Future<void> _forget() async {
    final saved = ref.read(savedHomesProvider);
    final keys = [Store.token, Store.me, Store.lastSlug, for (final slug in saved.keys) '${Store.homePrefix}$slug'];
    saved.clear();
    ref.read(currentSlugProvider.notifier).forget();
    await ref.read(storeProvider).clearAccount(keys);
  }

  static Me? _decodeMe(String? raw) {
    if (raw == null) return null;
    try {
      return Me.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
    } catch (_) {
      return null;
    }
  }

  // The sign-in response's `me` is re-encoded so the next launch opens instantly.
  static Json _meJson(Me me) => {
    'user': {'id': me.user.id, 'name': me.user.name, 'email': me.user.email, 'image': me.user.image, 'locale': me.user.locale},
    'workspaces': [
      for (final w in me.workspaces)
        {
          'id': w.id,
          'slug': w.slug,
          'name': w.name,
          'role': w.role.name,
          'view': w.view.name,
          'managesProjects': w.managesProjects,
          'access': {'allowed': w.allowed},
          'unread': w.unread,
        },
    ],
  };
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

// ── The company that's open ──────────────────────────────────────────────

class CurrentSlugController extends Notifier<String?> {
  @override
  String? build() => ref.read(bootProvider).values[Store.lastSlug];

  void open(String slug) {
    if (state == slug) return;
    state = slug;
    unawaited(ref.read(storeProvider).write(Store.lastSlug, slug));
  }

  void forget() => state = null;
}

final currentSlugProvider = NotifierProvider<CurrentSlugController, String?>(CurrentSlugController.new);

// ── Home ─────────────────────────────────────────────────────────────────

/// The last home screen of each company, as raw JSON (shown instantly at launch and offline).
final savedHomesProvider = Provider<Map<String, String>>((ref) {
  final values = ref.read(bootProvider).values;
  return {
    for (final e in values.entries)
      if (e.key.startsWith(Store.homePrefix)) e.key.substring(Store.homePrefix.length): e.value,
  };
});

class HomeController extends AsyncNotifier<Home> {
  HomeController(this.slug);
  final String slug;
  bool _servedSaved = false;

  @override
  Future<Home> build() async {
    final saved = ref.read(savedHomesProvider)[slug];
    if (!_servedSaved && saved != null) {
      _servedSaved = true;
      try {
        final home = Home.fromJson((jsonDecode(saved) as Map).cast<String, dynamic>());
        // Show the saved screen this frame, then fetch the fresh one.
        unawaited(
          Future(() {
            if (ref.mounted) ref.invalidateSelf();
          }),
        );
        return home;
      } catch (_) {}
    }
    _servedSaved = true;
    try {
      final (home, raw) = await ref.read(apiProvider).home(slug);
      ref.read(savedHomesProvider)[slug] = raw;
      unawaited(ref.read(storeProvider).write('${Store.homePrefix}$slug', raw));
      return home;
    } on ApiException catch (e) {
      // Removed from the company, or its access changed: reload the company list.
      if (e.failure == ApiFailure.notFound || e.failure == ApiFailure.locked) {
        unawaited(ref.read(sessionProvider.notifier).refresh());
      }
      rethrow;
    }
  }
}

final homeProvider = AsyncNotifierProvider.autoDispose.family<HomeController, Home, String>(HomeController.new);
