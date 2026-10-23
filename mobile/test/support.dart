import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pms_mobile/app.dart';
import 'package:pms_mobile/core/api.dart';
import 'package:pms_mobile/core/models.dart';
import 'package:pms_mobile/core/providers.dart';
import 'package:pms_mobile/core/storage.dart';

// ── Sample API responses (same shapes as docs/mobile-api.md) ─────────────

Json userJson() => {'id': 'u1', 'name': 'Mona Ali', 'email': 'mona@example.com', 'image': null, 'locale': 'en'};

Json wsJson(String slug, String name, {String role = 'member', String view = 'member', bool allowed = true, int unread = 0}) => {
  'id': 'id-$slug',
  'slug': slug,
  'name': name,
  'role': role,
  'view': view,
  'managesProjects': view == 'manager' ? 1 : 0,
  'access': {'allowed': allowed, 'kind': allowed ? 'active' : 'pending'},
  'unread': unread,
};

Json meJson({List<Json>? workspaces}) => {
  'apiVersion': 1,
  'user': userJson(),
  'workspaces': workspaces ?? [wsJson('al-noor', 'Al-Noor Construction', unread: 3), wsJson('towers', 'Baghdad Towers', view: 'manager')],
};

Json memberHomeJson({String slug = 'al-noor', String name = 'Al-Noor Construction'}) => {
  'workspace': {'slug': slug, 'name': name, 'role': 'member'},
  'view': 'member',
  'today': '2026-10-23',
  'unread': 3,
  'myTasks': {'overdue': 3, 'today': 2, 'week': 3, 'later': 1, 'none': 1},
  'manage': null,
};

Json managerHomeJson({String slug = 'towers', String name = 'Baghdad Towers', String role = 'admin'}) => {
  'workspace': {'slug': slug, 'name': name, 'role': role},
  'view': 'manager',
  'today': '2026-10-23',
  'unread': 5,
  'myTasks': {'overdue': 1, 'today': 1, 'week': 2, 'later': 0, 'none': 0},
  'manage': {
    'projects': 6,
    'behind': 2,
    'overBudget': 1,
    'headingOver': 1,
    'lateTasks': 7,
    'approvals': {'expenses': 3, 'hours': 4, 'loans': 1},
  },
};

/// A server in memory. Each call can be set to answer or to fail.
class FakeApi implements ApiClient {
  FakeApi({this.onUnauthorized});

  void Function(String?)? onUnauthorized;
  Json meData = meJson();
  final Map<String, Json> homes = {'al-noor': memberHomeJson(), 'towers': managerHomeJson()};
  final Map<String, ApiException> homeErrors = {};
  ApiException? signInError;
  ApiException? meError;
  String password = 'password123';
  final List<String> calls = [];

  @override
  Future<(String, Me)> signIn(String email, String password) async {
    calls.add('signIn $email');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    if (signInError != null) throw signInError!;
    if (password != this.password) throw const ApiException(ApiFailure.invalidCredentials, 'Wrong email or password.');
    return ('tok.sig', Me.fromJson(meData));
  }

  @override
  Future<void> signOut(String token) async => calls.add('signOut');

  @override
  Future<(Me, String)> me({String? token}) async {
    calls.add('me');
    if (meError != null) {
      if (meError!.failure == ApiFailure.unauthorized) onUnauthorized?.call(meError!.message);
      throw meError!;
    }
    return (Me.fromJson(meData), jsonEncode(meData));
  }

  @override
  Future<(Home, String)> home(String slug) async {
    calls.add('home $slug');
    await Future<void>.delayed(const Duration(milliseconds: 30));
    final err = homeErrors[slug];
    if (err != null) {
      if (err.failure == ApiFailure.unauthorized) onUnauthorized?.call(err.message);
      throw err;
    }
    final j = homes[slug];
    if (j == null) throw const ApiException(ApiFailure.notFound, 'Not found');
    return (Home.fromJson(j), jsonEncode(j));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Saved values for a person already signed in on this phone.
Map<String, String> signedIn({String? lastSlug, Map<String, Json> homes = const {}, Json? me, String? locale, String? theme}) => {
  Store.token: 'tok.sig',
  Store.me: jsonEncode(me ?? meJson()),
  Store.lastSlug: ?lastSlug,
  Store.locale: ?locale,
  Store.theme: ?theme,
  for (final e in homes.entries) '${Store.homePrefix}${e.key}': jsonEncode(e.value),
};

/// Pumps the real app with [saved] on the "phone" and [api] as the server.
Future<ProviderContainer> pumpApp(WidgetTester tester, {Map<String, String> saved = const {}, FakeApi? api}) async {
  FlutterSecureStorage.setMockInitialValues(Map.of(saved));
  final fake = api ?? FakeApi();
  late ProviderContainer container;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bootProvider.overrideWithValue(Boot(Map.of(saved))),
        apiProvider.overrideWith((ref) {
          fake.onUnauthorized = (m) => ref.read(sessionProvider.notifier).expired(m);
          return fake;
        }),
      ],
      retry: (_, _) => null,
      child: Consumer(
        builder: (context, ref, _) {
          container = ProviderScope.containerOf(context);
          return const PmsApp();
        },
      ),
    ),
  );
  await settle(tester);
  return container;
}

/// Lets entrance animations, count-ups and fake requests finish.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

/// A phone-sized screen: iPhone 15 Pro (393×852 pt, 3×) with its notch and home bar.
void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1179, 2556);
  tester.view.devicePixelRatio = 3;
  tester.view.padding = const FakeViewPadding(top: 59 * 3, bottom: 34 * 3);
  tester.view.viewPadding = const FakeViewPadding(top: 59 * 3, bottom: 34 * 3);
  addTearDown(tester.view.reset);
}

/// Real fonts (not the test font), so screenshots look like the phone.
Future<void> loadFonts() async {
  Future<void> family(String name, List<String> files) async {
    final loader = FontLoader(name);
    for (final f in files) {
      loader.addFont(rootBundle.load(f));
    }
    await loader.load();
  }

  await family('PlusJakartaSans', [for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) 'assets/fonts/PlusJakartaSans-$w.ttf']);
  await family('IBMPlexSansArabic', [for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold']) 'assets/fonts/IBMPlexSansArabic-$w.ttf']);
  final flutterRoot = Platform.environment['FLUTTER_ROOT'] ?? '${Platform.environment['HOME']}/flutter';
  final icons = File('$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final loader = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())));
    await loader.load();
  }
}
