import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamm/core/api.dart';
import 'package:tamm/core/providers.dart';
import 'package:tamm/features/companies/companies_screen.dart';
import 'package:tamm/features/home/home_screen.dart';
import 'package:tamm/features/login/login_screen.dart';

import 'support.dart';

void main() {
  testWidgets('signed out → login; empty form shows field errors', (tester) async {
    phone(tester);
    await pumpApp(tester);
    expect(find.byType(LoginScreen), findsOneWidget);
    await tester.tap(find.text('Sign in').last);
    await settle(tester);
    expect(find.text('Enter your email.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'not-an-email');
    await settle(tester);
    expect(find.text("That doesn't look like an email address."), findsOneWidget);
  });

  testWidgets("wrong password shows the server's message; right one opens the company list", (tester) async {
    phone(tester);
    final api = FakeApi();
    final c = await pumpApp(tester, api: api);
    await tester.enterText(find.byType(TextFormField).first, 'mona@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'nope');
    await tester.tap(find.text('Sign in').last);
    await settle(tester);
    expect(find.text('Wrong email or password.'), findsOneWidget);
    expect(c.read(sessionProvider).status, SessionStatus.signedOut);

    await tester.enterText(find.byType(TextFormField).last, 'password123');
    await tester.tap(find.text('Sign in').last);
    await settle(tester);
    expect(find.byType(CompaniesScreen), findsOneWidget, reason: 'two companies → choose one');
    expect(find.text('Al-Noor Construction'), findsOneWidget);
    expect(find.text('Baghdad Towers'), findsOneWidget);
    expect(find.text('Member · Member view'), findsOneWidget);
    expect(find.text('Member · Manager view'), findsOneWidget);
  });

  testWidgets('no connection at sign-in → a clear message, still on login', (tester) async {
    phone(tester);
    final api = FakeApi()..signInError = const ApiException(ApiFailure.network);
    await pumpApp(tester, api: api);
    await tester.enterText(find.byType(TextFormField).first, 'mona@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'password123');
    await tester.tap(find.text('Sign in').last);
    await settle(tester);
    expect(find.textContaining("Can't reach the server"), findsOneWidget);
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('one company → straight to its home (member view)', (tester) async {
    phone(tester);
    final api = FakeApi()..meData = meJson(workspaces: [wsJson('al-noor', 'Al-Noor Construction')]);
    await pumpApp(tester, api: api);
    await tester.enterText(find.byType(TextFormField).first, 'mona@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'password123');
    await tester.tap(find.text('Sign in').last);
    await settle(tester);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('5 tasks need you today.'), findsOneWidget, reason: '3 overdue + 2 today');
    expect(find.text('My tasks'), findsOneWidget);
    expect(find.text('Waiting for your approval'), findsNothing, reason: 'members get no manager section');
    expect(find.text('10 open tasks'), findsOneWidget);
  });

  testWidgets('choosing a company opens it and remembers it for next time', (tester) async {
    phone(tester);
    final c = await pumpApp(tester, saved: signedIn());
    expect(find.byType(CompaniesScreen), findsOneWidget);
    await tester.tap(find.text('Baghdad Towers'));
    await settle(tester);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Waiting for your approval'), findsOneWidget);
    expect(find.text('Loans'), findsOneWidget, reason: 'admins approve loans');
    await tester.scrollUntilVisible(find.text('All projects'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('All projects'), findsOneWidget, reason: 'admin sees every project');
    expect(c.read(currentSlugProvider), 'towers');
  });

  testWidgets('saved home shows instantly at launch, then refreshes from the server', (tester) async {
    phone(tester);
    final saved = memberHomeJson()..['myTasks'] = {'overdue': 0, 'today': 1, 'week': 0, 'later': 0, 'none': 0};
    final api = FakeApi();
    await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor', homes: {'al-noor': saved}));
    expect(find.byType(HomeScreen), findsOneWidget, reason: 'no login, no company picker: last company opens');
    expect(api.calls, contains('home al-noor'));
    expect(find.text('5 tasks need you today.'), findsOneWidget, reason: 'fresh numbers replaced the saved ones');
  });

  testWidgets('offline with a saved home → saved numbers and an offline notice', (tester) async {
    phone(tester);
    final api = FakeApi()..homeErrors['al-noor'] = const ApiException(ApiFailure.network);
    await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor', homes: {'al-noor': memberHomeJson()}));
    expect(find.text('5 tasks need you today.'), findsOneWidget);
    expect(find.textContaining('Offline'), findsOneWidget);
  });

  testWidgets('offline with nothing saved → error with Try again', (tester) async {
    phone(tester);
    final api = FakeApi()..homeErrors['al-noor'] = const ApiException(ApiFailure.network);
    await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor'));
    expect(find.textContaining("Can't reach the server"), findsOneWidget);
    api.homeErrors.clear();
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.text('5 tasks need you today.'), findsOneWidget);
  });

  testWidgets('a locked company explains why and offers to switch', (tester) async {
    phone(tester);
    final api = FakeApi()..homeErrors['al-noor'] = const ApiException(ApiFailure.locked, "This workspace's subscription isn't active.");
    await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor', homes: {'al-noor': memberHomeJson()}));
    expect(find.text('This company is locked'), findsOneWidget);
    expect(find.text("This workspace's subscription isn't active."), findsOneWidget);
    expect(find.text('5 tasks need you today.'), findsNothing, reason: 'saved data is not shown for a locked company');
    await tester.tap(find.text('Switch company'));
    await settle(tester);
    await tester.tap(find.text('Baghdad Towers'));
    await settle(tester);
    expect(find.text('Waiting for your approval'), findsOneWidget);
  });

  testWidgets('token no longer accepted → back to login with the reason, account forgotten', (tester) async {
    phone(tester);
    final api = FakeApi()..homeErrors['al-noor'] = const ApiException(ApiFailure.unauthorized, 'Please sign in again.');
    final c = await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor'));
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('Please sign in again.'), findsOneWidget);
    expect(c.read(sessionProvider).token, isNull);
    expect(c.read(savedHomesProvider), isEmpty);
  });

  testWidgets('sign out from the account sheet', (tester) async {
    phone(tester);
    final api = FakeApi();
    final c = await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor'));
    await tester.tap(find.byTooltip('Account'));
    await settle(tester);
    await tester.tap(find.text('Sign out'));
    await settle(tester);
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(api.calls, contains('signOut'));
    expect(c.read(currentSlugProvider), isNull);
  });

  testWidgets('Arabic: right-to-left, Arabic text, Western digits', (tester) async {
    phone(tester);
    await pumpApp(tester, saved: signedIn(lastSlug: 'al-noor', locale: 'ar'));
    final ctx = tester.element(find.byType(HomeScreen));
    expect(Directionality.of(ctx), TextDirection.rtl);
    expect(find.text('مهامي'), findsOneWidget);
    expect(find.text('5 مهام تحتاجك اليوم.'), findsOneWidget);
  });

  testWidgets('language switch on the login screen', (tester) async {
    phone(tester);
    final c = await pumpApp(tester);
    await tester.tap(find.text('العربية'));
    await settle(tester);
    expect(find.text('أهلًا بعودتك'), findsOneWidget);
    expect(c.read(languageProvider), 'ar');
    await tester.tap(find.text('English'));
    await settle(tester);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('manager home for a project manager hides loans', (tester) async {
    phone(tester);
    final api = FakeApi()..homes['towers'] = managerHomeJson(role: 'member');
    await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'towers'));
    expect(find.text('Loans'), findsNothing);
    await tester.scrollUntilVisible(find.text('Projects you manage'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Projects you manage'), findsOneWidget);
    expect(find.text('Expenses'), findsOneWidget);
  });

}
