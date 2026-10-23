// Screenshots of the main screens with real fonts, for review (not a pass/fail
// test: they change with the date). Make them with:
//   flutter test test/screenshots_test.dart --update-goldens --dart-define=SCREENSHOTS=true
// Output: test/screenshots/*.png (not committed). Skipped in a normal `flutter test`.

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pms_mobile/app.dart';

import 'support.dart';

const _enabled = bool.fromEnvironment('SCREENSHOTS');

void main() {
  setUpAll(loadFonts);

  Future<void> shot(WidgetTester tester, String name, Map<String, String> saved, {double height = 852}) async {
    phone(tester);
    tester.view.physicalSize = Size(1179, height * 3);
    await pumpApp(tester, saved: saved);
    await settle(tester);
    await expectLater(find.byType(PmsApp), matchesGoldenFile('screenshots/$name.png'));
  }

  testWidgets(skip: !_enabled, 'login · en · light', (t) => shot(t, 'login_en_light', {}));
  testWidgets(skip: !_enabled, 'login · ar · dark', (t) => shot(t, 'login_ar_dark', {'locale': 'ar', 'theme': 'dark'}));
  testWidgets(skip: !_enabled, 'companies · en · light', (t) => shot(t, 'companies_en_light', signedIn()));
  testWidgets(skip: !_enabled, 'member home · en · light', (t) => shot(t, 'home_member_en_light', signedIn(lastSlug: 'al-noor'), height: 1500));
  testWidgets(skip: !_enabled, 'member home · ar · dark', (t) => shot(t, 'home_member_ar_dark', signedIn(lastSlug: 'al-noor', locale: 'ar', theme: 'dark'), height: 1500));
  testWidgets(skip: !_enabled, 'manager home · en · light', (t) => shot(t, 'home_manager_en_light', signedIn(lastSlug: 'towers'), height: 2100));
  testWidgets(skip: !_enabled, 'manager home · ar · light', (t) => shot(t, 'home_manager_ar_light', signedIn(lastSlug: 'towers', locale: 'ar'), height: 2100));
  Future<void> flow(WidgetTester tester, String name, List<String> taps, {String? locale, String? theme, double height = 852}) async {
    phone(tester);
    tester.view.physicalSize = Size(1179, height * 3);
    final me = meJson(workspaces: [wsJson('al-noor', 'Al-Noor Construction', unread: 1)]);
    final api = FakeApi()..meData = me;
    await pumpApp(tester, api: api, saved: signedIn(lastSlug: 'al-noor', me: me, locale: locale, theme: theme));
    for (final t in taps) {
      await tester.tap(find.text(t).first);
      await settle(tester);
    }
    await settle(tester);
    await expectLater(find.byType(PmsApp), matchesGoldenFile('screenshots/$name.png'));
  }

  testWidgets(skip: !_enabled, 'tasks · en', (t) => flow(t, 'tasks_en_light', ['Tasks']));
  testWidgets(skip: !_enabled, 'task · en', (t) => flow(t, 'task_en_light', ['Tasks', 'Pour foundation slab'], height: 1500));
  testWidgets(skip: !_enabled, 'task · ar · dark', (t) => flow(t, 'task_ar_dark', ['المهام', 'Pour foundation slab'], locale: 'ar', theme: 'dark', height: 1500));
  testWidgets(skip: !_enabled, 'hours · en', (t) => flow(t, 'hours_en_light', ['Hours']));
  testWidgets(skip: !_enabled, 'log hours · en', (t) => flow(t, 'loghours_en_light', ['Hours', 'Log hours']));
  testWidgets(skip: !_enabled, 'inbox · ar', (t) => flow(t, 'inbox_ar_light', ['الوارد'], locale: 'ar'));
  testWidgets(skip: !_enabled, 'more · en', (t) => flow(t, 'more_en_light', ['More']));
  testWidgets(skip: !_enabled, 'site log · en', (t) => flow(t, 'sitelog_en_light', ['More', 'Site log'], height: 1300));
  testWidgets(skip: !_enabled, 'expense · en', (t) => flow(t, 'expense_en_light', ['More', 'Expenses & receipts', 'Add expense'], height: 1500));
  testWidgets(skip: !_enabled, 'loans · en · dark', (t) => flow(t, 'loans_en_dark', ['More', 'My loans'], theme: 'dark'));
  testWidgets(skip: !_enabled, 'member home · en · tabs', (t) => flow(t, 'home_tabs_en_light', [], height: 1300));
  testWidgets(skip: !_enabled, 'manager home · en · dark', (t) => shot(t, 'home_manager_en_dark', signedIn(lastSlug: 'towers', theme: 'dark')));
}
