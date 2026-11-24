// The app's ApiClient against a running server (skipped unless LIVE_EMAIL is set):
//   flutter test test/live_api_test.dart --dart-define=LIVE_EMAIL=… --dart-define=LIVE_PASSWORD=… \
//     --dart-define=API_URL=http://localhost:3001
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tamm/core/api.dart';
import 'package:tamm/core/models.dart';

const _email = String.fromEnvironment('LIVE_EMAIL');
const _password = String.fromEnvironment('LIVE_PASSWORD');

void main() {
  // Widget tests block real network; these are plain tests and need it.
  setUpAll(() => HttpOverrides.global = null);

  test('sign in → me → home for each company → sign out', skip: _email.isEmpty, () async {
    String? token;
    var expiredCalls = 0;
    final api = ApiClient(token: () => token, language: () => 'ar', onUnauthorized: (_) => expiredCalls++);

    final wrong = await api.signIn(_email, 'definitely-wrong').then<Object?>((_) => null, onError: (Object e) => e);
    expect(wrong, isA<ApiException>().having((e) => e.failure, 'failure', ApiFailure.invalidCredentials));
    expect((wrong! as ApiException).message, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', reason: 'Arabic phone → Arabic message');

    final (t, me) = await api.signIn(_email, _password);
    token = t;
    expect(me.workspaces, isNotEmpty);
    final (again, _) = await api.me();
    expect(again.user.email, _email);

    for (final w in me.workspaces) {
      final (home, _) = await api.home(w.slug);
      expect(home.view, w.view, reason: '${w.slug}: home view matches me');
      expect(home.manage != null, w.view == HomeView.manager);
      // ignore: avoid_print
      print('${w.slug}: ${w.role.name}/${w.view.name} · tasks overdue=${home.myTasks.overdue} today=${home.myTasks.today} '
          'week=${home.myTasks.week} open=${home.myTasks.open}${home.manage == null ? '' : ' · manage projects=${home.manage!.projects} late=${home.manage!.lateTasks}'}');
    }

    final notMine = await api.home('not-my-company-xyz').then<Object?>((_) => null, onError: (Object e) => e);
    expect((notMine! as ApiException).failure, ApiFailure.notFound);

    await api.signOut(t);
    final after = await api.me().then<Object?>((_) => null, onError: (Object e) => e);
    expect((after! as ApiException).failure, ApiFailure.unauthorized);
    expect(expiredCalls, 1, reason: 'a 401 after sign-out sends the app back to login');
  });
}
