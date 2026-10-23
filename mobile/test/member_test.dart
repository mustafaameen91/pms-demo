import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pms_mobile/core/api.dart';
import 'package:pms_mobile/features/expenses/expense_form_screen.dart';
import 'package:pms_mobile/features/hours/hours_screen.dart';
import 'package:pms_mobile/features/inbox/inbox_screen.dart';
import 'package:pms_mobile/features/tasks/task_screen.dart';
import 'package:pms_mobile/features/tasks/tasks_screen.dart';

import 'support.dart';

/// Signed in to one company (member view), on its home tab.
Future<FakeApi> openMember(WidgetTester tester, {String? locale}) async {
  phone(tester);
  final api = FakeApi()..meData = meJson(workspaces: [wsJson('al-noor', 'Al-Noor Construction')]);
  await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor', me: api.meData, locale: locale));
  return api;
}

/// The last change sent to the server (maps compared by content).
void expectSent(FakeApi api, String method, String path, Map<String, Object?>? body) {
  final (m, p, b) = api.sent.last;
  expect((m, p), (method, path));
  expect(b, body);
}

Future<void> tab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
  await settle(tester);
}

void main() {
  // Real fonts: layouts are checked at the sizes people see.
  setUpAll(loadFonts);

  testWidgets('Tasks tab: my tasks grouped by due date, with a filter', (tester) async {
    await openMember(tester);
    await tab(tester, 'Tasks');
    expect(find.byType(TasksScreen), findsOneWidget);
    expect(find.byType(TaskCard), findsNWidgets(3));
    expect(find.text('Pour foundation slab'), findsOneWidget);
    expect(find.text('4 finished tasks'), findsOneWidget);
    await tester.tap(find.text('Overdue · 1'));
    await settle(tester);
    expect(find.byType(TaskCard), findsOneWidget);
    await tester.tap(find.text('All · 3'));
    await settle(tester);
    expect(find.byType(TaskCard), findsNWidgets(3));
  });

  testWidgets('home: tapping Overdue opens Tasks filtered to overdue', (tester) async {
    await openMember(tester);
    await tester.tap(find.text('Overdue').first);
    await settle(tester);
    expect(find.byType(TasksScreen), findsOneWidget);
    expect(find.byType(TaskCard), findsOneWidget);
  });

  testWidgets('task: move it to Done (server told), comment, read-only for others', (tester) async {
    final api = await openMember(tester);
    await tab(tester, 'Tasks');
    await tester.tap(find.text('Pour foundation slab'));
    await settle(tester);
    expect(find.byType(TaskScreen), findsOneWidget);
    expect(find.text('Pour foundation slab'), findsWidgets);
    final list = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Rebar check'), 300, scrollable: list);
    expect(find.byWidgetPredicate((w) => w is SelectableText && w.data == 'Grade C30 concrete, 25 m³.'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Done'), -300, scrollable: list);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Done'));
    await settle(tester);
    expectSent(api, 'PATCH', '/tasks/t1', {'statusId': 's3'});
    expect(find.text('Saved'), findsOneWidget);

    // Let the "Saved" message go (it floats over the comment box).
    ScaffoldMessenger.of(tester.element(find.byType(TaskScreen))).hideCurrentSnackBar();
    await settle(tester);
    await tester.enterText(find.byType(TextField).last, 'Curing started');
    await settle(tester);
    await tester.tap(find.byTooltip('Send'));
    await settle(tester);
    expectSent(api, 'POST', '/tasks/t1/comments', {'body': 'Curing started'});

    // Back, and someone else's task.
    await tester.pageBack();
    await settle(tester);
    await tester.tap(find.text('Order rebar'));
    await settle(tester);
    expect(find.textContaining('only its assignee or the project manager'), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNothing);
    expect(find.byType(Slider), findsNothing);
  });

  testWidgets("task: the server's refusal is shown and the status goes back", (tester) async {
    final api = await openMember(tester)
      ..failSend = (m, p) => m == 'PATCH' ? const ApiException(ApiFailure.invalid, 'Blocked until “Survey” is finished.') : null;
    await tab(tester, 'Tasks');
    await tester.tap(find.text('Pour foundation slab'));
    await settle(tester);
    await tester.tap(find.widgetWithText(ChoiceChip, 'Done'));
    await settle(tester);
    expect(find.text('Blocked until “Survey” is finished.'), findsOneWidget);
    final done = tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Done'));
    expect(done.selected, isFalse);
    expect(api.sent.length, 1);
  });

  testWidgets('task: progress slider → Save progress', (tester) async {
    final api = await openMember(tester);
    await tab(tester, 'Tasks');
    await tester.tap(find.text('Pour foundation slab'));
    await settle(tester);
    expect(find.text('Save progress'), findsNothing);
    final slider = find.byType(Slider);
    await tester.drag(slider, const Offset(400, 0));
    await settle(tester);
    expect(find.text('100%'), findsOneWidget);
    await tester.tap(find.text('Save progress'));
    await settle(tester);
    expectSent(api, 'PATCH', '/tasks/t1', {'progress': 100});
  });

  testWidgets('Hours tab: the week, and logging hours (with field checks)', (tester) async {
    final api = await openMember(tester);
    await tab(tester, 'Hours');
    expect(find.byType(HoursScreen), findsOneWidget);
    expect(find.text('7.5'), findsOneWidget, reason: 'week total, not rounded');
    expect(find.text('Formwork'), findsOneWidget);
    expect(find.text('Waiting for approval'), findsWidgets);

    await tester.tap(find.text('Log hours'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Required'), findsOneWidget);
    await tester.tap(find.widgetWithText(ActionChip, '4 h'));
    await tester.enterText(find.widgetWithText(TextField, 'Note (optional)'), 'Scaffolding');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final (method, path, body) = api.sent.last;
    expect((method, path), ('POST', '/hours'));
    expect(body, containsPair('projectId', 'p1'));
    expect(body, containsPair('hours', '4'));
    expect(body, containsPair('note', 'Scaffolding'));
    expect(find.text('Hours saved'), findsOneWidget);
  });

  testWidgets("hours: the server's field message shows under the field", (tester) async {
    final api = await openMember(tester)
      ..failSend = (m, p) => p == '/hours' ? const ApiException(ApiFailure.invalid, 'x', {'hours': "That's more than one day allows"}) : null;
    await tab(tester, 'Hours');
    await tester.tap(find.text('Log hours'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Hours'), '30');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text("That's more than one day allows"), findsOneWidget);
    expect(api.sent.length, 1);
  });

  testWidgets('Inbox: tap opens the task and marks it read; mark all read', (tester) async {
    final api = await openMember(tester);
    await tab(tester, 'Inbox');
    expect(find.byType(InboxScreen), findsOneWidget);
    expect(find.text('5 min ago'), findsOneWidget);
    await tester.tap(find.text('Mark all read'));
    await settle(tester);
    expectSent(api, 'POST', '/inbox/read', null);
    expect(find.text('Mark all read'), findsNothing);
    await tester.tap(find.text('Omar commented on CLIN-1 Pour foundation slab'));
    await settle(tester);
    expect(find.byType(TaskScreen), findsOneWidget);
  });

  testWidgets('More → Site log: weather and notes saved for today', (tester) async {
    final api = await openMember(tester);
    await tab(tester, 'More');
    await tester.tap(find.text('Site log'));
    await settle(tester);
    expect(find.text('Nothing written for this day yet.'), findsOneWidget);
    await tester.tap(find.widgetWithText(ChoiceChip, 'Very hot'));
    await tester.enterText(find.widgetWithText(TextField, 'Temperature (°C)'), '46');
    await tester.enterText(find.widgetWithText(TextField, 'Notes'), 'Pour finished at noon');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Save'));
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final (method, path, body) = api.sent.last;
    expect((method, path), ('PUT', '/projects/p1/site-log'));
    expect(body, containsPair('weather', 'hot'));
    expect(body, containsPair('temperature', '46'));
    expect(body, containsPair('notes', 'Pour finished at noon'));
    expect(find.text('Site log saved'), findsOneWidget);
  });

  testWidgets('Expenses: the list, then a new one against my advance', (tester) async {
    final api = await openMember(tester)..result = const ApiResult(pending: true);
    await tab(tester, 'More');
    await tester.tap(find.text('Expenses & receipts'));
    await settle(tester);
    expect(find.text('Cement bags'), findsOneWidget);
    expect(find.text('150,000 IQD'), findsOneWidget);
    await tester.tap(find.text('Add expense'));
    await settle(tester);
    expect(find.byType(ExpenseFormScreen), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Required'), findsNWidgets(2), reason: 'amount and description');
    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '300000');
    await tester.enterText(find.widgetWithText(TextField, 'What was it for?'), 'Drill');
    await tester.tap(find.widgetWithText(ChoiceChip, 'Equipment'));
    // Clear of the pinned Save bar.
    await tester.scrollUntilVisible(find.text('Add a photo of the receipt'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Site purchases'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final (method, path, body) = api.sent.last;
    expect((method, path), ('UPLOAD', '/expenses'));
    expect(body, containsPair('amount', '300000'));
    expect(body, containsPair('category', 'equipment'));
    expect(body, containsPair('loanId', 'l1'));
    expect(find.text('Saved — waiting for approval'), findsOneWidget);
  });

  testWidgets("Loans: what's left of my advance; ask for a loan; withdraw", (tester) async {
    final api = await openMember(tester);
    await tab(tester, 'More');
    await tester.tap(find.text('My loans'));
    await settle(tester);
    expect(find.text('Cash advance · Riverside Clinic'), findsOneWidget);
    expect(find.text('700,000 IQD'), findsOneWidget);
    expect(find.text('New tools'), findsOneWidget);
    await tester.tap(find.text('Withdraw'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Withdraw'));
    await settle(tester);
    expectSent(api, 'DELETE', '/loans/requests/r1', null);

    await tester.tap(find.text('Ask for a loan'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '250000');
    await tester.enterText(find.widgetWithText(TextField, 'What is it for?'), 'Generator repair');
    await tester.tap(find.text('Send request'));
    await settle(tester);
    expectSent(api, 'POST', '/loans/requests', {'amount': '250000', 'currency': 'IQD', 'reason': 'Generator repair'});
  });

  testWidgets('home quick action: Log hours opens the form', (tester) async {
    await openMember(tester);
    await tester.tap(find.text('Log hours'));
    await settle(tester);
    expect(find.widgetWithText(FilledButton, 'Save'), findsOneWidget);
  });

  testWidgets('Arabic: tabs and task list right-to-left', (tester) async {
    await openMember(tester, locale: 'ar');
    await tab(tester, 'المهام');
    final ctx = tester.element(find.byType(TasksScreen));
    expect(Directionality.of(ctx), TextDirection.rtl);
    expect(find.text('متأخرة · 1'), findsOneWidget);
    expect(find.text('٤ مهام منتهية'), findsNothing, reason: 'Western digits');
    expect(find.text('4 مهام منتهية'), findsOneWidget);
  });
}
