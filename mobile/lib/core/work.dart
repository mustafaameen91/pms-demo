import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'providers.dart';
import 'work_models.dart';

// The member screens' data. Each screen watches one provider; they're
// auto-disposed when nobody shows them, and a change only reloads the
// providers it affects (see [WorkActions]).

typedef SlugId = ({String slug, String id});

final myTasksProvider = FutureProvider.autoDispose.family<MyTasks, String>(
  (ref, slug) async => MyTasks.fromJson(await ref.read(apiProvider).get(slug, '/tasks')),
);

final taskProvider = FutureProvider.autoDispose.family<TaskDetail, SlugId>(
  (ref, a) async => TaskDetail.fromJson(await ref.read(apiProvider).get(a.slug, '/tasks/${Uri.encodeComponent(a.id)}')),
);

final inboxProvider = AsyncNotifierProvider.autoDispose.family<InboxController, Inbox, String>(InboxController.new);

class InboxController extends AsyncNotifier<Inbox> {
  InboxController(this.slug);
  final String slug;

  @override
  Future<Inbox> build() async => Inbox.fromJson(await ref.read(apiProvider).get(slug, '/inbox'));

  /// Shown as read at once; the server is told in the background.
  Future<void> markRead(Notice n) async {
    final inbox = state.value;
    if (n.read || inbox == null) return;
    state = AsyncData(Inbox(unread: (inbox.unread - 1).clamp(0, 1 << 30), items: [for (final i in inbox.items) i.id == n.id ? i.markRead() : i]));
    try {
      await ref.read(apiProvider).send('POST', slug, '/inbox/${n.id}/read');
    } finally {
      ref.invalidate(homeProvider(slug));
    }
  }

  Future<void> markAllRead() async {
    final inbox = state.value;
    if (inbox == null || inbox.unread == 0) return;
    state = AsyncData(Inbox(unread: 0, items: [for (final i in inbox.items) i.markRead()]));
    try {
      await ref.read(apiProvider).send('POST', slug, '/inbox/read');
    } finally {
      ref.invalidate(homeProvider(slug));
    }
  }
}

/// My projects in this company. Kept for a few minutes: pickers open instantly.
final projectsProvider = FutureProvider.autoDispose.family<List<ProjectRef>, String>((ref, slug) async {
  final link = ref.keepAlive();
  final timer = Timer(const Duration(minutes: 5), link.close);
  ref.onDispose(timer.cancel);
  final j = await ref.read(apiProvider).get(slug, '/projects');
  return [for (final p in (j['projects'] as List? ?? const [])) ProjectRef.fromJson((p as Map).cast<String, dynamic>())];
});

final projectTasksProvider = FutureProvider.autoDispose.family<ProjectTasks, SlugId>(
  (ref, a) async => ProjectTasks.fromJson(await ref.read(apiProvider).get(a.slug, '/projects/${a.id}')),
);

final hoursProvider = FutureProvider.autoDispose.family<HoursWeek, ({String slug, String week})>(
  (ref, a) async => HoursWeek.fromJson(await ref.read(apiProvider).get(a.slug, '/hours', query: {'week': a.week})),
);

final siteLogProvider = FutureProvider.autoDispose.family<SiteLogDay, ({String slug, String projectId, String date})>(
  (ref, a) async => SiteLogDay.fromJson(await ref.read(apiProvider).get(a.slug, '/projects/${a.projectId}/site-log', query: {'date': a.date})),
);

final photosProvider = FutureProvider.autoDispose.family<List<Photo>, SlugId>((ref, a) async {
  final j = await ref.read(apiProvider).get(a.slug, '/projects/${a.id}/photos');
  return [for (final p in (j['photos'] as List? ?? const [])) Photo.fromJson((p as Map).cast<String, dynamic>())];
});

final expensesProvider = FutureProvider.autoDispose.family<ExpensesPage, String>(
  (ref, slug) async => ExpensesPage.fromJson(await ref.read(apiProvider).get(slug, '/expenses')),
);

final loansProvider = FutureProvider.autoDispose.family<LoansPage, String>(
  (ref, slug) async => LoansPage.fromJson(await ref.read(apiProvider).get(slug, '/loans')),
);

/// Every change the member screens make. Each one calls the server (which runs
/// the website's own rules) and then reloads only what it affects.
class WorkActions {
  WorkActions(this.ref);
  final Ref ref;
  ApiClient get _api => ref.read(apiProvider);

  void _tasksChanged(String slug, String taskId) {
    ref.invalidate(taskProvider((slug: slug, id: taskId)));
    ref.invalidate(myTasksProvider(slug));
    ref.invalidate(homeProvider(slug));
  }

  Future<ApiResult> updateTask(String slug, String taskId, {String? statusId, int? progress}) async {
    final r = await _api.send('PATCH', slug, '/tasks/$taskId', {'statusId': ?statusId, 'progress': ?progress});
    _tasksChanged(slug, taskId);
    return r;
  }

  Future<ApiResult> comment(String slug, String taskId, String body) async {
    final r = await _api.send('POST', slug, '/tasks/$taskId/comments', {'body': body});
    ref.invalidate(taskProvider((slug: slug, id: taskId)));
    return r;
  }

  Future<ApiResult> logHours(String slug, {required String projectId, required String date, required String hours, String? taskId, String? note, String? entryId}) async {
    final r = await _api.send('POST', slug, '/hours', {
      'projectId': projectId,
      'date': date,
      'hours': hours,
      'taskId': ?taskId,
      'note': ?note,
      'entryId': ?entryId,
    });
    ref.invalidate(hoursProvider);
    return r;
  }

  Future<ApiResult> deleteHours(String slug, String entryId) async {
    final r = await _api.send('DELETE', slug, '/hours/$entryId');
    ref.invalidate(hoursProvider);
    return r;
  }

  Future<ApiResult> saveSiteLog(String slug, String projectId, Map<String, String?> values) async {
    final r = await _api.send('PUT', slug, '/projects/$projectId/site-log', values);
    ref.invalidate(siteLogProvider);
    return r;
  }

  Future<ApiResult> addPhotos(String slug, String projectId, List<String> files, {String? taskId}) async {
    final r = await _api.upload(slug, '/projects/$projectId/photos', {'taskId': ?taskId}, files: {'file': files});
    ref.invalidate(photosProvider((slug: slug, id: projectId)));
    if (taskId != null) ref.invalidate(taskProvider((slug: slug, id: taskId)));
    return r;
  }

  Future<ApiResult> addExpense(String slug, Map<String, String> fields, {String? receipt}) async {
    final r = await _api.upload(slug, '/expenses', fields, files: {if (receipt != null) 'receipt': [receipt]});
    ref.invalidate(expensesProvider(slug));
    ref.invalidate(loansProvider(slug));
    ref.invalidate(homeProvider(slug));
    return r;
  }

  Future<ApiResult> requestLoan(String slug, {required String amount, required String currency, required String reason}) async {
    final r = await _api.send('POST', slug, '/loans/requests', {'amount': amount, 'currency': currency, 'reason': reason});
    ref.invalidate(loansProvider(slug));
    return r;
  }

  Future<ApiResult> withdrawLoanRequest(String slug, String id) async {
    final r = await _api.send('DELETE', slug, '/loans/requests/$id');
    ref.invalidate(loansProvider(slug));
    return r;
  }
}

final workProvider = Provider<WorkActions>(WorkActions.new);
