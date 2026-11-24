import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamm/app.dart';
import 'package:tamm/core/api.dart';
import 'package:tamm/core/models.dart';
import 'package:tamm/core/providers.dart';
import 'package:tamm/core/storage.dart';

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

  // ── The rest of the API: canned answers by path, and a log of every change ──

  final Map<String, Json> gets = memberFixtures();
  final List<(String, String, Object?)> sent = [];

  /// Fail a change: (method, path) → the error to throw (null = succeed).
  ApiException? Function(String method, String path)? failSend;
  ApiResult result = const ApiResult();

  @override
  Future<Json> get(String slug, String path, {Map<String, String>? query}) async {
    calls.add('GET $path');
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final j = gets[path];
    if (j == null) throw const ApiException(ApiFailure.notFound, 'Not found');
    return j;
  }

  @override
  Future<ApiResult> send(String method, String slug, String path, [Json? body]) async {
    sent.add((method, path, body));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final err = failSend?.call(method, path);
    if (err != null) throw err;
    return result;
  }

  @override
  Future<ApiResult> upload(String slug, String path, Map<String, String> fields, {Map<String, List<String>> files = const {}}) async {
    sent.add(('UPLOAD', path, {...fields, 'files': files}));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final err = failSend?.call('UPLOAD', path);
    if (err != null) throw err;
    return result;
  }

  @override
  String fileUrl(String path) => 'http://test$path';

  @override
  Map<String, String> get authHeaders => const {};

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Json _task(String id, String key, String title, String group, {String? due, int progress = 0, String status = 'To do', String category = 'todo'}) => {
  'id': id,
  'key': key,
  'title': title,
  'priority': 'medium',
  'startDate': null,
  'dueDate': due,
  'progress': progress,
  'isMilestone': false,
  'isSubtask': false,
  'group': group,
  'status': {'name': status, 'color': '#0d9488', 'category': category},
  'project': {'key': 'CLIN', 'name': 'Riverside Clinic', 'color': '#0d9488'},
};

Json taskDetailJson({String id = 't1', bool canEdit = true, List<Json> comments = const []}) => {
  'task': {
    'id': id,
    'key': 'CLIN-1',
    'title': 'Pour foundation slab',
    'description': 'Grade C30 concrete, 25 m³.',
    'priority': 'high',
    'startDate': '2026-10-19',
    'dueDate': '2026-10-21',
    'progress': 40,
    'isMilestone': false,
    'statusId': 's2',
    'assignee': {'id': 'u1', 'name': 'Mona Ali'},
    'parent': null,
  },
  'project': {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic', 'color': '#0d9488', 'currency': 'IQD'},
  'statuses': [
    {'id': 's1', 'name': 'To do', 'color': '#64748b', 'category': 'todo'},
    {'id': 's2', 'name': 'In progress', 'color': '#2563eb', 'category': 'in_progress'},
    {'id': 's3', 'name': 'Done', 'color': '#16a34a', 'category': 'done'},
  ],
  'can': {'status': canEdit, 'progress': canEdit, 'comment': true},
  'blockedBy': <Json>[],
  'subtasks': [
    {'id': 'st1', 'key': 'CLIN-9', 'title': 'Rebar check', 'done': true},
  ],
  'comments': comments,
  'photos': <Json>[],
};

/// Answers for the member and manager screens' GETs.
Map<String, Json> memberFixtures() => {
  ...managerFixtures(),
  '/tasks': {
    'today': '2026-10-23',
    'done': 4,
    'tasks': [
      _task('t1', 'CLIN-1', 'Pour foundation slab', 'overdue', due: '2026-10-21', progress: 40, status: 'In progress', category: 'in_progress'),
      _task('t2', 'CLIN-2', 'Order rebar', 'today', due: '2026-10-23'),
      _task('t3', 'CLIN-3', 'Electrical rough-in', 'week', due: '2026-10-26'),
    ],
  },
  '/tasks/t1': taskDetailJson(),
  '/tasks/t2': taskDetailJson(id: 't2', canEdit: false),
  '/tasks/CLIN-1': taskDetailJson(),
  '/projects': {
    'projects': [
      {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic', 'color': '#0d9488', 'currency': 'IQD', 'manager': false},
    ],
  },
  '/projects/p1': {
    'project': {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic', 'color': '#0d9488', 'currency': 'IQD', 'manager': false},
    'tasks': [
      {'id': 't1', 'key': 'CLIN-1', 'title': 'Pour foundation slab', 'isSubtask': false, 'mine': true},
    ],
  },
  '/hours': {
    'from': '2026-10-17',
    'to': '2026-10-23',
    'today': '2026-10-23',
    'entries': [
      {
        'id': 'h1',
        'date': '2026-10-22',
        'hours': '7.50',
        'note': 'Formwork',
        'status': 'pending',
        'decisionNote': null,
        'decidedBy': null,
        'project': {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic'},
        'task': {'id': 't1', 'key': 'CLIN-1', 'title': 'Pour foundation slab'},
      },
    ],
  },
  '/inbox': {
    'unread': 1,
    'items': [
      {
        'id': 'n1',
        'type': 'comment',
        'title': 'Omar commented on CLIN-1 Pour foundation slab',
        'body': 'Is the slab ready?',
        'read': false,
        'createdAt': DateTime.now().subtract(const Duration(minutes: 5)).toUtc().toIso8601String(),
        'actor': {'name': 'Omar Hassan', 'image': null},
        'open': {'type': 'task', 'key': 'CLIN-1'},
      },
      {
        'id': 'n2',
        'type': 'billing',
        'title': 'Invoice ready',
        'body': null,
        'read': true,
        'createdAt': '2026-10-20T08:00:00Z',
        'actor': null,
        'open': null,
      },
    ],
  },
  '/projects/p1/site-log': {
    'date': '2026-10-23',
    'today': '2026-10-23',
    'log': null,
    'days': <Json>[],
    'weather': [
      {'value': 'sunny', 'label': 'Sunny'},
      {'value': 'hot', 'label': 'Very hot'},
      {'value': 'dust', 'label': 'Dust storm'},
    ],
  },
  '/projects/p1/photos': {'photos': <Json>[]},
  '/expenses': {
    'categories': [
      {'value': 'materials', 'label': 'Materials'},
      {'value': 'equipment', 'label': 'Equipment'},
    ],
    'advances': [
      {'id': 'l1', 'projectId': 'p1', 'projectName': 'Riverside Clinic', 'currency': 'IQD', 'amount': '1000000.00', 'open': '700000.00', 'reason': 'Site purchases'},
    ],
    'expenses': [
      {
        'id': 'e1',
        'date': '2026-10-22',
        'amount': '150000.00',
        'currency': 'IQD',
        'category': 'materials',
        'description': 'Cement bags',
        'payee': 'Al-Rafidain',
        'project': {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic'},
        'advance': false,
        'receiptUrl': null,
        'status': 'approved',
        'decidedBy': null,
        'decisionNote': null,
      },
    ],
  },
  '/loans': {
    'currencies': ['IQD', 'USD'],
    'loans': [
      {
        'id': 'l1',
        'amount': '1000000.00',
        'currency': 'IQD',
        'issuedOn': '2026-10-01',
        'reason': 'Site purchases',
        'project': {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic'},
        'returned': '0.00',
        'spent': '300000.00',
        'pending': '0.00',
        'balance': '700000.00',
        'paidPct': 30,
        'paidOff': false,
      },
    ],
    'requests': [
      {'id': 'r1', 'amount': '500.00', 'currency': 'USD', 'reason': 'New tools', 'status': 'pending', 'decisionNote': null, 'decidedBy': null, 'createdAt': '2026-10-22T09:00:00Z'},
    ],
  },
};

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

  await family('Manrope', [for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) 'assets/fonts/Manrope-$w.ttf']);
  await family('ReadexPro', [for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold']) 'assets/fonts/ReadexPro-$w.ttf']);
  for (final style in ['Regular', 'Fill']) {
    await family('packages/phosphor_flutter/Phosphor$style', ['packages/phosphor_flutter/lib/fonts/Phosphor${style == 'Regular' ? '' : '-$style'}.ttf']);
  }
  final flutterRoot = Platform.environment['FLUTTER_ROOT'] ?? '${Platform.environment['HOME']}/flutter';
  final icons = File('$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final loader = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())));
    await loader.load();
  }
}

Json _health({String id = 'p1', String name = 'Riverside Clinic'}) => {
  'id': id,
  'key': 'CLIN',
  'name': name,
  'color': '#0d9488',
  'currency': 'IQD',
  'endDate': '2026-12-31',
  'daysLeft': 69,
  'overdue': false,
  'actual': 42.5,
  'planned': 55.0,
  'schedule': 'behind',
  'budget': 250000000,
  'spent': 262000000,
  'usedPct': 104.8,
  'overBudget': true,
  'headingOver': false,
  'pendingApproval': 0,
  'forecast': {'final': 616470588, 'overBy': 366470588, 'overPct': 146.6, 'health': 'bad', 'early': false},
  'late': 2,
  'attention': 9,
};

/// Answers for the manager screens' GETs (approvals, health, attendance, risks, reports).
Map<String, Json> managerFixtures() => {
  '/approvals': {
    'canLoans': true,
    'expenses': [
      {'id': 'e1', 'date': '2026-10-22', 'amount': '1200000.00', 'currency': 'IQD', 'description': 'Scaffolding rental', 'payee': 'Al-Bina', 'requester': 'Mona Ali', 'project': {'key': 'CLIN', 'name': 'Riverside Clinic'}, 'advance': false, 'mine': false},
      {'id': 'e2', 'date': '2026-10-21', 'amount': '90000.00', 'currency': 'IQD', 'description': 'Fuel for the generator', 'payee': null, 'requester': 'Sara Kareem', 'project': {'key': 'CLIN', 'name': 'Riverside Clinic'}, 'advance': false, 'mine': true},
    ],
    'hours': [
      {'id': 'h9', 'date': '2026-10-22', 'hours': '9.00', 'note': 'Night pour', 'person': 'Mona Ali', 'project': {'id': 'p1', 'key': 'CLIN', 'name': 'Riverside Clinic'}, 'task': {'key': 'CLIN-1', 'title': 'Pour foundation slab'}},
    ],
    'loans': [
      {'id': 'r9', 'amount': '600.00', 'currency': 'USD', 'reason': 'Tools for site', 'person': 'Mona Ali', 'createdAt': '2026-10-22T09:00:00Z'},
    ],
  },
  '/health': {'projects': [_health(), _health(id: 'p2', name: 'Al-Mansour School')..['schedule'] = 'on_track'..['overBudget'] = false..['late'] = 0]},
  '/health/p1': {
    'project': _health(),
    'late': [
      {'id': 't1', 'key': 'CLIN-1', 'title': 'Pour foundation slab', 'dueDate': '2026-10-20', 'progress': 40, 'status': {'name': 'In progress', 'color': '#2563eb', 'category': 'in_progress'}},
    ],
    'upcoming': <Json>[],
    'risks': [
      {'id': 'rk1', 'key': 'R-1', 'title': 'Rain delays the pour', 'score': 16, 'level': 'high', 'owner': 'Omar Hassan'},
    ],
  },
  '/projects/p1/attendance': {
    'date': '2026-10-23',
    'today': '2026-10-23',
    'workers': [
      {'id': 'w1', 'name': 'Ahmed Mason', 'role': 'Mason', 'unit': 'day', 'unitLabel': 'day', 'defaultQuantity': 1, 'onProject': true},
      {'id': 'w2', 'name': 'Karim Electrician', 'role': 'Electrician', 'unit': 'hour', 'unitLabel': 'hour', 'defaultQuantity': 8, 'onProject': false},
    ],
    'recorded': <Json>[],
  },
  '/projects/p1/risks': {
    'manager': true,
    'categories': [
      {'value': 'schedule', 'label': 'Schedule'},
      {'value': 'weather', 'label': 'Weather & site'},
    ],
    'statuses': [
      {'value': 'open', 'label': 'Open'},
      {'value': 'watching', 'label': 'Watching'},
      {'value': 'closed', 'label': 'Closed'},
    ],
    'likelihood': [for (final (i, x) in ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'].indexed) {'value': i + 1, 'label': x}],
    'impact': [for (final (i, x) in ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'].indexed) {'value': i + 1, 'label': x}],
    'people': [
      {'id': 'u1', 'name': 'Mona Ali'},
      {'id': 'u2', 'name': 'Omar Hassan'},
    ],
    'risks': [
      {
        'id': 'rk1',
        'key': 'R-1',
        'title': 'Rain delays the pour',
        'description': null,
        'category': 'weather',
        'likelihood': 4,
        'impact': 4,
        'score': 16,
        'level': 'high',
        'mitigation': 'Cover the slab; move the pour to dry days.',
        'status': 'open',
        'owner': {'id': 'u2', 'name': 'Omar Hassan'},
        'task': null,
        'canEdit': true,
      },
    ],
  },
  '/reports': {
    'reports': [
      {'start': '2026-10-10', 'end': '2026-10-16', 'headline': {'projects': 2, 'behind': 1, 'overBudget': 1, 'headingOver': 0, 'late': 2, 'done': 3}},
    ],
  },
  '/reports/2026-10-10': {
    'start': '2026-10-10',
    'end': '2026-10-16',
    'headline': {'projects': 1, 'behind': 1, 'overBudget': 1, 'headingOver': 0, 'late': 2, 'done': 3},
    'projects': [
      {
        'id': 'p1',
        'key': 'CLIN',
        'name': 'Riverside Clinic',
        'leadId': 'u2',
        'currency': 'IQD',
        'actual': 42.5,
        'change': 6.5,
        'planned': 55,
        'schedule': 'behind',
        'budget': 250000000,
        'spent': 262000000,
        'spentThisWeek': 12000000,
        'overBudget': true,
        'forecast': null,
        'late': [
          {'number': 1, 'title': 'Pour foundation slab', 'dueDate': '2026-10-20'},
        ],
        'lateCount': 2,
        'done': [
          {'number': 4, 'title': 'Site survey'},
        ],
        'doneCount': 3,
        'risks': [
          {'number': 1, 'title': 'Rain delays the pour', 'likelihood': 4, 'impact': 4},
        ],
        'newRisks': 1,
      },
    ],
  },
};
