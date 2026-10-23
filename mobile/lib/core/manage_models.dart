// Models for the manager screens (docs/mobile-api.md, 23d). Hand-written, immutable.
import 'models.dart';
import 'work_models.dart';

String _s(Object? v) => v is String ? v : (v == null ? '' : '$v');
String? _ns(Object? v) => v is String && v.isNotEmpty ? v : null;
int _i(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
double? _nd(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
bool _b(Object? v) => v == true;
Json _m(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};
List<Json> _l(Object? v) => [for (final e in (v is List ? v : const [])) _m(e)];
DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

// ── Approvals ─────────────────────────────────────────────────────────────

class ExpenseApproval {
  const ExpenseApproval({
    required this.id,
    required this.date,
    required this.amount,
    required this.currency,
    required this.description,
    this.payee,
    this.requester,
    required this.project,
    required this.advance,
    required this.mine,
  });
  factory ExpenseApproval.fromJson(Json j) => ExpenseApproval(
    id: _s(j['id']),
    date: _s(j['date']),
    amount: _d(j['amount']),
    currency: _s(j['currency']),
    description: _s(j['description']),
    payee: _ns(j['payee']),
    requester: _ns(j['requester']),
    project: ProjectRef.fromJson(_m(j['project'])),
    advance: _b(j['advance']),
    mine: _b(j['mine']),
  );
  final String id;
  final String date;
  final double amount;
  final String currency;
  final String description;
  final String? payee;
  final String? requester;
  final ProjectRef project;

  /// A receipt against a cash advance.
  final bool advance;

  /// My own request: someone else decides.
  final bool mine;
}

class HoursApproval {
  const HoursApproval({required this.id, required this.date, required this.hours, this.note, this.person, required this.project, this.task});
  factory HoursApproval.fromJson(Json j) => HoursApproval(
    id: _s(j['id']),
    date: _s(j['date']),
    hours: _d(j['hours']),
    note: _ns(j['note']),
    person: _ns(j['person']),
    project: ProjectRef.fromJson(_m(j['project'])),
    task: j['task'] is Map ? TaskLink.fromJson(_m(j['task'])) : null,
  );
  final String id;
  final String date;
  final double hours;
  final String? note;
  final String? person;
  final ProjectRef project;
  final TaskLink? task;
}

class LoanApproval {
  const LoanApproval({required this.id, required this.amount, required this.currency, required this.reason, this.person, this.createdAt});
  factory LoanApproval.fromJson(Json j) => LoanApproval(
    id: _s(j['id']),
    amount: _d(j['amount']),
    currency: _s(j['currency']),
    reason: _s(j['reason']),
    person: _ns(j['person']),
    createdAt: _t(j['createdAt']),
  );
  final String id;
  final double amount;
  final String currency;
  final String reason;
  final String? person;
  final DateTime? createdAt;
}

class ApprovalsPage {
  const ApprovalsPage({required this.canLoans, required this.expenses, required this.hours, required this.loans});
  factory ApprovalsPage.fromJson(Json j) => ApprovalsPage(
    canLoans: _b(j['canLoans']),
    expenses: [for (final e in _l(j['expenses'])) ExpenseApproval.fromJson(e)],
    hours: [for (final h in _l(j['hours'])) HoursApproval.fromJson(h)],
    loans: [for (final l in _l(j['loans'])) LoanApproval.fromJson(l)],
  );
  final bool canLoans;
  final List<ExpenseApproval> expenses;
  final List<HoursApproval> hours;
  final List<LoanApproval> loans;

  /// What I can actually decide (my own expenses wait for someone else).
  int get total => expenses.where((e) => !e.mine).length + hours.length + loans.length;

  ApprovalsPage without(String id) => ApprovalsPage(
    canLoans: canLoans,
    expenses: [for (final e in expenses) if (e.id != id) e],
    hours: [for (final h in hours) if (h.id != id) h],
    loans: [for (final l in loans) if (l.id != id) l],
  );
}

// ── Project health ────────────────────────────────────────────────────────

enum Schedule {
  ahead,
  onTrack,
  behind;

  static Schedule? parse(Object? v) => switch (v) {
    'ahead' => Schedule.ahead,
    'on_track' => Schedule.onTrack,
    'behind' => Schedule.behind,
    _ => null,
  };
}

class Forecast {
  const Forecast({required this.finalCost, this.overBy, this.overPct, this.health, required this.early});
  factory Forecast.fromJson(Json j) =>
      Forecast(finalCost: _d(j['final']), overBy: _nd(j['overBy']), overPct: _nd(j['overPct']), health: _ns(j['health']), early: _b(j['early']));
  final double finalCost;
  final double? overBy;
  final double? overPct;

  /// good · watch · bad
  final String? health;

  /// Too little work done for the guess to mean much.
  final bool early;
}

class ProjectHealthRow {
  const ProjectHealthRow({
    required this.id,
    required this.key,
    required this.name,
    this.color,
    required this.currency,
    this.endDate,
    this.daysLeft,
    required this.overdue,
    this.actual,
    this.planned,
    this.schedule,
    this.budget,
    required this.spent,
    this.usedPct,
    required this.overBudget,
    required this.headingOver,
    required this.pendingApproval,
    this.forecast,
    required this.late,
  });

  factory ProjectHealthRow.fromJson(Json j) => ProjectHealthRow(
    id: _s(j['id']),
    key: _s(j['key']),
    name: _s(j['name']),
    color: _ns(j['color']),
    currency: _s(j['currency']),
    endDate: _ns(j['endDate']),
    daysLeft: j['daysLeft'] is num ? (j['daysLeft'] as num).toInt() : null,
    overdue: _b(j['overdue']),
    actual: _nd(j['actual']),
    planned: _nd(j['planned']),
    schedule: Schedule.parse(j['schedule']),
    budget: _nd(j['budget']),
    spent: _d(j['spent']),
    usedPct: _nd(j['usedPct']),
    overBudget: _b(j['overBudget']),
    headingOver: _b(j['headingOver']),
    pendingApproval: _d(j['pendingApproval']),
    forecast: j['forecast'] is Map ? Forecast.fromJson(_m(j['forecast'])) : null,
    late: _i(j['late']),
  );

  final String id;
  final String key;
  final String name;
  final String? color;
  final String currency;
  final String? endDate;
  final int? daysLeft;
  final bool overdue;

  /// Accomplishment 0–100 (null: no tasks), and where it should be today.
  final double? actual;
  final double? planned;
  final Schedule? schedule;
  final double? budget;
  final double spent;
  final double? usedPct;
  final bool overBudget;
  final bool headingOver;
  final double pendingApproval;
  final Forecast? forecast;
  final int late;
}

class HealthTask {
  const HealthTask({required this.id, required this.key, required this.title, this.dueDate, required this.progress, required this.status});
  factory HealthTask.fromJson(Json j) => HealthTask(
    id: _s(j['id']),
    key: _s(j['key']),
    title: _s(j['title']),
    dueDate: _ns(j['dueDate']),
    progress: _i(j['progress']),
    status: StatusRef.fromJson({..._m(j['status']), 'id': ''}),
  );
  final String id;
  final String key;
  final String title;
  final String? dueDate;
  final int progress;
  final StatusRef status;
}

class RiskBrief {
  const RiskBrief({required this.id, required this.key, required this.title, required this.score, required this.level, this.owner});
  factory RiskBrief.fromJson(Json j) =>
      RiskBrief(id: _s(j['id']), key: _s(j['key']), title: _s(j['title']), score: _i(j['score']), level: _s(j['level']), owner: _ns(j['owner']));
  final String id;
  final String key;
  final String title;
  final int score;

  /// low · medium · high
  final String level;
  final String? owner;
}

class ProjectDetail {
  const ProjectDetail({required this.project, required this.late, required this.upcoming, required this.risks});
  factory ProjectDetail.fromJson(Json j) => ProjectDetail(
    project: ProjectHealthRow.fromJson(_m(j['project'])),
    late: [for (final t in _l(j['late'])) HealthTask.fromJson(t)],
    upcoming: [for (final t in _l(j['upcoming'])) HealthTask.fromJson(t)],
    risks: [for (final r in _l(j['risks'])) RiskBrief.fromJson(r)],
  );
  final ProjectHealthRow project;
  final List<HealthTask> late;
  final List<HealthTask> upcoming;
  final List<RiskBrief> risks;
}

// ── Attendance ────────────────────────────────────────────────────────────

class Worker {
  const Worker({required this.id, required this.name, this.role, required this.unitLabel, required this.defaultQuantity, required this.onProject});
  factory Worker.fromJson(Json j) => Worker(
    id: _s(j['id']),
    name: _s(j['name']),
    role: _ns(j['role']),
    unitLabel: _s(j['unitLabel']),
    defaultQuantity: _d(j['defaultQuantity']),
    onProject: _b(j['onProject']),
  );
  final String id;
  final String name;
  final String? role;
  final String unitLabel;
  final double defaultQuantity;
  final bool onProject;
}

class AttendanceDay {
  const AttendanceDay({required this.date, required this.today, required this.workers, required this.recorded});
  factory AttendanceDay.fromJson(Json j) => AttendanceDay(
    date: _s(j['date']),
    today: _s(j['today']),
    workers: [for (final w in _l(j['workers'])) Worker.fromJson(w)],
    recorded: [for (final r in _l(j['recorded'])) (workerId: _s(r['workerId']), name: _s(r['name']), quantity: _d(r['quantity']), unitLabel: _s(r['unitLabel']))],
  );
  final String date;
  final String today;
  final List<Worker> workers;
  final List<({String workerId, String name, double quantity, String unitLabel})> recorded;
}

// ── Risks ─────────────────────────────────────────────────────────────────

class Risk {
  const Risk({
    required this.id,
    required this.key,
    required this.title,
    this.description,
    required this.category,
    required this.likelihood,
    required this.impact,
    required this.score,
    required this.level,
    this.mitigation,
    required this.status,
    this.owner,
    this.task,
    required this.canEdit,
  });
  factory Risk.fromJson(Json j) => Risk(
    id: _s(j['id']),
    key: _s(j['key']),
    title: _s(j['title']),
    description: _ns(j['description']),
    category: _s(j['category']),
    likelihood: _i(j['likelihood']),
    impact: _i(j['impact']),
    score: _i(j['score']),
    level: _s(j['level']),
    mitigation: _ns(j['mitigation']),
    status: _s(j['status']),
    owner: j['owner'] is Map ? Person.fromJson(_m(j['owner'])) : null,
    task: j['task'] is Map ? TaskLink.fromJson(_m(j['task'])) : null,
    canEdit: _b(j['canEdit']),
  );
  final String id;
  final String key;
  final String title;
  final String? description;
  final String category;
  final int likelihood;
  final int impact;
  final int score;
  final String level;
  final String? mitigation;

  /// open · watching · closed
  final String status;
  final Person? owner;
  final TaskLink? task;
  final bool canEdit;
}

class ScaleChoice {
  const ScaleChoice(this.value, this.label);
  factory ScaleChoice.fromJson(Json j) => ScaleChoice(_i(j['value']), _s(j['label']));
  final int value;
  final String label;
}

class RisksPage {
  const RisksPage({
    required this.manager,
    required this.categories,
    required this.statuses,
    required this.likelihood,
    required this.impact,
    required this.people,
    required this.risks,
  });
  factory RisksPage.fromJson(Json j) => RisksPage(
    manager: _b(j['manager']),
    categories: [for (final c in _l(j['categories'])) Choice.fromJson(c)],
    statuses: [for (final s in _l(j['statuses'])) Choice.fromJson(s)],
    likelihood: [for (final s in _l(j['likelihood'])) ScaleChoice.fromJson(s)],
    impact: [for (final s in _l(j['impact'])) ScaleChoice.fromJson(s)],
    people: [for (final p in _l(j['people'])) Person.fromJson(p)],
    risks: [for (final r in _l(j['risks'])) Risk.fromJson(r)],
  );
  final bool manager;
  final List<Choice> categories;
  final List<Choice> statuses;
  final List<ScaleChoice> likelihood;
  final List<ScaleChoice> impact;

  /// Who can own a risk (only sent to the manager).
  final List<Person> people;
  final List<Risk> risks;

  String label(List<Choice> list, String value) {
    for (final c in list) {
      if (c.value == value) return c.label;
    }
    return value;
  }
}

// ── Weekly reports ────────────────────────────────────────────────────────

class ReportHeadline {
  const ReportHeadline({required this.projects, required this.behind, required this.overBudget, required this.headingOver, required this.late, required this.done});
  factory ReportHeadline.fromJson(Json j) => ReportHeadline(
    projects: _i(j['projects']),
    behind: _i(j['behind']),
    overBudget: _i(j['overBudget']),
    headingOver: _i(j['headingOver']),
    late: _i(j['late']),
    done: _i(j['done']),
  );
  final int projects;
  final int behind;
  final int overBudget;
  final int headingOver;
  final int late;
  final int done;
}

class ReportWeek {
  const ReportWeek({required this.start, required this.end, required this.headline});
  factory ReportWeek.fromJson(Json j) => ReportWeek(start: _s(j['start']), end: _s(j['end']), headline: ReportHeadline.fromJson(_m(j['headline'])));
  final String start;
  final String end;
  final ReportHeadline headline;
}

class ReportProject {
  const ReportProject({
    required this.id,
    required this.key,
    required this.name,
    required this.currency,
    this.actual,
    this.change,
    this.planned,
    this.schedule,
    this.budget,
    required this.spent,
    required this.spentThisWeek,
    required this.overBudget,
    this.forecast,
    required this.late,
    required this.lateCount,
    required this.done,
    required this.doneCount,
    required this.risks,
    required this.newRisks,
  });

  factory ReportProject.fromJson(Json j) {
    List<({int number, String title})> items(Object? v) => [for (final x in _l(v)) (number: _i(x['number']), title: _s(x['title']))];
    return ReportProject(
      id: _s(j['id']),
      key: _s(j['key']),
      name: _s(j['name']),
      currency: _s(j['currency']),
      actual: _nd(j['actual']),
      change: _nd(j['change']),
      planned: _nd(j['planned']),
      schedule: Schedule.parse(j['schedule']),
      budget: _nd(j['budget']),
      spent: _d(j['spent']),
      spentThisWeek: _d(j['spentThisWeek']),
      overBudget: _b(j['overBudget']),
      forecast: j['forecast'] is Map ? Forecast.fromJson(_m(j['forecast'])) : null,
      late: items(j['late']),
      lateCount: _i(j['lateCount']),
      done: items(j['done']),
      doneCount: _i(j['doneCount']),
      risks: [for (final r in _l(j['risks'])) (number: _i(r['number']), title: _s(r['title']), score: _i(r['likelihood']) * _i(r['impact']))],
      newRisks: _i(j['newRisks']),
    );
  }

  final String id;
  final String key;
  final String name;
  final String currency;
  final double? actual;
  final double? change;
  final double? planned;
  final Schedule? schedule;
  final double? budget;
  final double spent;
  final double spentThisWeek;
  final bool overBudget;
  final Forecast? forecast;
  final List<({int number, String title})> late;
  final int lateCount;
  final List<({int number, String title})> done;
  final int doneCount;
  final List<({int number, String title, int score})> risks;
  final int newRisks;
}

class WeeklyReport {
  const WeeklyReport({required this.start, required this.end, required this.headline, required this.projects});
  factory WeeklyReport.fromJson(Json j) => WeeklyReport(
    start: _s(j['start']),
    end: _s(j['end']),
    headline: ReportHeadline.fromJson(_m(j['headline'])),
    projects: [for (final p in _l(j['projects'])) ReportProject.fromJson(p)],
  );
  final String start;
  final String end;
  final ReportHeadline headline;
  final List<ReportProject> projects;
}
