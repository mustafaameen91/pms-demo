import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamm/core/api.dart';
import 'package:tamm/features/approvals/approvals_screen.dart';
import 'package:tamm/features/attendance/attendance_screen.dart';
import 'package:tamm/features/projects/project_screen.dart';
import 'package:tamm/features/projects/projects_screen.dart';
import 'package:tamm/features/reports/reports_screen.dart';

import 'package:tamm/widgets/tab_bar.dart';

import 'support.dart';

/// Signed in to a company where I'm an admin (manager view), on its home tab.
Future<FakeApi> openManager(WidgetTester tester, {String? locale}) async {
  phone(tester);
  final api = FakeApi()..meData = meJson(workspaces: [wsJson('towers', 'Baghdad Towers', role: 'admin', view: 'manager')]);
  await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'towers', me: api.meData, locale: locale));
  return api;
}

Future<void> tab(WidgetTester tester, String label) async {
  await tester.tap(find.byTooltip(label));
  await settle(tester);
}

void expectSent(FakeApi api, String method, String path, Map<String, Object?>? body) {
  final (m, p, b) = api.sent.last;
  expect((m, p), (method, path));
  expect(b, body);
}

void main() {
  setUpAll(loadFonts);

  testWidgets("managers' tabs: Projects and Approvals (with what's waiting)", (tester) async {
    await openManager(tester);
    final nav = find.byType(FloatingTabBar);
    expect(find.descendant(of: nav, matching: find.byTooltip('Projects')), findsOneWidget);
    expect(find.descendant(of: nav, matching: find.byTooltip('Approvals')), findsOneWidget);
    expect(find.descendant(of: nav, matching: find.byTooltip('Tasks')), findsNothing);
    expect(find.descendant(of: nav, matching: find.text('8')), findsOneWidget, reason: 'approvals badge');
  });

  testWidgets('approve an expense: it leaves the list; my own one has no buttons', (tester) async {
    final api = await openManager(tester);
    await tab(tester, 'Approvals');
    expect(find.byType(ApprovalsScreen), findsOneWidget);
    expect(find.text('Scaffolding rental'), findsOneWidget);
    expect(find.text('Your own request — another approver decides'), findsOneWidget);
    expect(find.text('Approve'), findsOneWidget, reason: 'only the one I can decide');
    await tester.tap(find.text('Approve'));
    await settle(tester);
    expectSent(api, 'POST', '/approvals/expenses/e1', {'decision': 'approved'});
    expect(find.text('Scaffolding rental'), findsNothing);
    expect(find.text('Approved'), findsOneWidget);
  });

  testWidgets('reject hours: a reason is required and sent', (tester) async {
    final api = await openManager(tester);
    await tab(tester, 'Approvals');
    await tester.tap(find.text('Hours · 1'));
    await settle(tester);
    expect(find.text('Night pour'), findsOneWidget);
    await tester.tap(find.text('Reject'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Reject').last);
    await settle(tester);
    expect(find.text('Required'), findsOneWidget);
    expect(api.sent, isEmpty);
    await tester.enterText(find.byType(TextField).last, 'Pour was the day before');
    await tester.tap(find.widgetWithText(FilledButton, 'Reject').last);
    await settle(tester);
    expectSent(api, 'POST', '/approvals/hours/h9', {'decision': 'rejected', 'note': 'Pour was the day before'});
    expect(find.text('Night pour'), findsNothing);
  });

  testWidgets('approve a loan for a different amount', (tester) async {
    final api = await openManager(tester);
    await tab(tester, 'Approvals');
    await tester.tap(find.text('Loans · 1'));
    await settle(tester);
    await tester.tap(find.text('Approve'));
    await settle(tester);
    expect(find.widgetWithText(TextField, '600'), findsOneWidget, reason: 'prefilled with what was asked');
    await tester.enterText(find.byType(TextField).last, '400');
    // The sheet's button (the card's is behind it).
    await tester.tap(find.widgetWithText(FilledButton, 'Approve').last);
    await settle(tester);
    expectSent(api, 'POST', '/approvals/loans/r9', {'decision': 'approved', 'amount': '400'});
  });

  testWidgets('a refused decision puts the item back and says why', (tester) async {
    final api = await openManager(tester)
      ..failSend = (m, p) => p.startsWith('/approvals') ? const ApiException(ApiFailure.invalid, 'This expense was already decided.') : null;
    await tab(tester, 'Approvals');
    await tester.tap(find.text('Approve'));
    await settle(tester);
    expect(find.text('This expense was already decided.'), findsOneWidget);
    expect(find.text('Scaffolding rental'), findsOneWidget);
    expect(api.sent.length, 1);
  });

  testWidgets('Projects → a project: health, late tasks, risks; then attendance', (tester) async {
    final api = await openManager(tester);
    await tab(tester, 'Projects');
    expect(find.byType(ProjectsScreen), findsOneWidget);
    expect(find.byType(ProjectHealthCard), findsNWidgets(2));
    expect(find.text('Behind'), findsOneWidget);
    expect(find.text('Over budget'), findsOneWidget);
    await tester.tap(find.text('Riverside Clinic'));
    await settle(tester);
    expect(find.byType(ProjectScreen), findsOneWidget);
    expect(find.text('43%'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Pour foundation slab'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Pour foundation slab'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('Rain delays the pour'), 300, scrollable: find.byType(Scrollable).first);

    await tester.scrollUntilVisible(find.text('Attendance'), -300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Attendance'));
    await settle(tester);
    expect(find.byType(AttendanceScreen), findsOneWidget);
    expect(find.text('Choose workers'), findsOneWidget);
    await tester.tap(find.text('Ahmed Mason'));
    await settle(tester);
    await tester.tap(find.byTooltip('+').first);
    await tester.tap(find.text('Karim Electrician'));
    await settle(tester);
    expect(find.text('8 hour'), findsOneWidget, reason: 'default for an hourly worker');
    await tester.tap(find.text('Record 2 workers'));
    await settle(tester);
    final (method, path, body) = api.sent.last;
    expect((method, path), ('POST', '/projects/p1/attendance'));
    expect((body! as Map)['workers'], [
      {'resourceId': 'w1', 'quantity': '1.5'},
      {'resourceId': 'w2', 'quantity': '8'},
    ]);
    expect(find.text('Attendance saved'), findsOneWidget);
  });

  testWidgets('risks: raise one (score shown as you choose)', (tester) async {
    final api = await openManager(tester);
    await tab(tester, 'Projects');
    await tester.tap(find.text('Riverside Clinic'));
    await settle(tester);
    await tester.tap(find.text('Risks').first);
    await settle(tester);
    expect(find.text('R-1 · Rain delays the pour'), findsOneWidget);
    await tester.tap(find.text('Raise a risk'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextField, 'What could go wrong?'), 'Cement price jump');
    await tester.tap(find.text('5').first);
    await settle(tester);
    expect(find.text('15'), findsOneWidget, reason: '5 × 3 = 15');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Save'));
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final (method, path, body) = api.sent.last;
    expect((method, path), ('POST', '/projects/p1/risks'));
    expect(body, containsPair('title', 'Cement price jump'));
    expect(body, containsPair('likelihood', 5));
    expect(body, containsPair('impact', 3));
    expect(find.text('Risk saved'), findsOneWidget);
  });

  testWidgets('More → weekly reports → one week', (tester) async {
    await openManager(tester);
    await tab(tester, 'More');
    expect(find.text('My tasks'), findsOneWidget, reason: "a manager's own work is under More");
    await tester.tap(find.text('Weekly reports'));
    await settle(tester);
    expect(find.byType(ReportsScreen), findsOneWidget);
    await tester.tap(find.textContaining('Oct 10'));
    await settle(tester);
    expect(find.byType(ReportScreen), findsOneWidget);
    expect(find.text('+6.5 pts this week'), findsOneWidget);
    expect(find.text('CLIN-4 · Site survey'), findsOneWidget);
  });

  testWidgets('home: tapping an approvals row opens Approvals', (tester) async {
    await openManager(tester);
    await tester.scrollUntilVisible(find.text('Expenses'), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Expenses'));
    await settle(tester);
    expect(find.byType(ApprovalsScreen), findsOneWidget);
  });

  testWidgets('Arabic: manager tabs right-to-left', (tester) async {
    await openManager(tester, locale: 'ar');
    expect(find.byTooltip('الموافقات'), findsOneWidget);
    await tab(tester, 'المشاريع');
    expect(Directionality.of(tester.element(find.byType(ProjectsScreen))), TextDirection.rtl);
    expect(find.text('متأخر'), findsOneWidget);
  });
}
