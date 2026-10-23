import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'manage_models.dart';
import 'providers.dart';
import 'work.dart';

// The manager screens' data, like work.dart: one provider per screen,
// auto-disposed, and each change reloads only what it affects.

final approvalsProvider = AsyncNotifierProvider.autoDispose.family<ApprovalsController, ApprovalsPage, String>(ApprovalsController.new);

class ApprovalsController extends AsyncNotifier<ApprovalsPage> {
  ApprovalsController(this.slug);
  final String slug;

  @override
  Future<ApprovalsPage> build() async => ApprovalsPage.fromJson(await ref.read(apiProvider).get(slug, '/approvals'));

  /// [kind]: expenses · hours · loans. The item leaves the list at once and
  /// comes back if the server refuses.
  Future<ApiResult> decide(String kind, String id, {required bool approve, String? note, String? amount}) async {
    final before = state.value;
    if (before != null) state = AsyncData(before.without(id));
    try {
      final r = await ref.read(apiProvider).send('POST', slug, '/approvals/$kind/$id', {
        'decision': approve ? 'approved' : 'rejected',
        'note': ?note,
        'amount': ?amount,
      });
      ref.invalidate(homeProvider(slug));
      ref.invalidate(healthProvider(slug));
      return r;
    } catch (_) {
      if (before != null && ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }
}

final healthProvider = FutureProvider.autoDispose.family<List<ProjectHealthRow>, String>((ref, slug) async {
  final j = await ref.read(apiProvider).get(slug, '/health');
  return [for (final p in (j['projects'] as List? ?? const [])) ProjectHealthRow.fromJson((p as Map).cast<String, dynamic>())];
});

final projectDetailProvider = FutureProvider.autoDispose.family<ProjectDetail, SlugId>(
  (ref, a) async => ProjectDetail.fromJson(await ref.read(apiProvider).get(a.slug, '/health/${a.id}')),
);

final attendanceProvider = FutureProvider.autoDispose.family<AttendanceDay, ({String slug, String projectId, String date})>(
  (ref, a) async => AttendanceDay.fromJson(await ref.read(apiProvider).get(a.slug, '/projects/${a.projectId}/attendance', query: {'date': a.date})),
);

final risksProvider = FutureProvider.autoDispose.family<RisksPage, SlugId>(
  (ref, a) async => RisksPage.fromJson(await ref.read(apiProvider).get(a.slug, '/projects/${a.id}/risks')),
);

final reportsProvider = FutureProvider.autoDispose.family<List<ReportWeek>, String>((ref, slug) async {
  final j = await ref.read(apiProvider).get(slug, '/reports');
  return [for (final r in (j['reports'] as List? ?? const [])) ReportWeek.fromJson((r as Map).cast<String, dynamic>())];
});

final reportProvider = FutureProvider.autoDispose.family<WeeklyReport, ({String slug, String week})>(
  (ref, a) async => WeeklyReport.fromJson(await ref.read(apiProvider).get(a.slug, '/reports/${a.week}')),
);

class ManageActions {
  ManageActions(this.ref);
  final Ref ref;
  ApiClient get _api => ref.read(apiProvider);

  Future<ApiResult> recordAttendance(
    String slug,
    String projectId, {
    required String date,
    required Map<String, String> workers,
    String? taskId,
    String? note,
  }) async {
    final r = await _api.send('POST', slug, '/projects/$projectId/attendance', {
      'date': date,
      'taskId': ?taskId,
      'note': ?note,
      'workers': [for (final e in workers.entries) {'resourceId': e.key, 'quantity': e.value}],
    });
    ref.invalidate(attendanceProvider);
    ref.invalidate(healthProvider(slug));
    ref.invalidate(projectDetailProvider((slug: slug, id: projectId)));
    return r;
  }

  /// New risk when [riskId] is null.
  Future<ApiResult> saveRisk(String slug, String projectId, String? riskId, Map<String, Object?> values) async {
    final r = riskId == null
        ? await _api.send('POST', slug, '/projects/$projectId/risks', values)
        : await _api.send('PUT', slug, '/projects/$projectId/risks/$riskId', values);
    ref.invalidate(risksProvider((slug: slug, id: projectId)));
    ref.invalidate(projectDetailProvider((slug: slug, id: projectId)));
    return r;
  }
}

final manageProvider = Provider<ManageActions>(ManageActions.new);
