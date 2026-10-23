// Models for the member screens (docs/mobile-api.md). Hand-written, immutable.
import 'models.dart';

String _s(Object? v) => v is String ? v : (v == null ? '' : '$v');
String? _ns(Object? v) => v is String && v.isNotEmpty ? v : null;
int _i(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
bool _b(Object? v) => v == true;
Json _m(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};
List<Json> _l(Object? v) => [for (final e in (v is List ? v : const [])) _m(e)];
DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

enum DueGroup {
  overdue,
  today,
  week,
  later,
  none;

  static DueGroup parse(Object? v) => DueGroup.values.firstWhere((g) => g.name == v, orElse: () => DueGroup.none);
}

/// A colour sent by the server as "#0d9488" (or a name we don't know → null).
int? parseHex(String? hex) {
  if (hex == null) return null;
  final h = hex.replaceFirst('#', '');
  if (h.length != 6) return null;
  final v = int.tryParse(h, radix: 16);
  return v == null ? null : 0xFF000000 | v;
}

class StatusRef {
  const StatusRef({required this.id, required this.name, this.color, required this.category});
  factory StatusRef.fromJson(Json j) => StatusRef(id: _s(j['id']), name: _s(j['name']), color: _ns(j['color']), category: _s(j['category']));
  final String id;
  final String name;
  final String? color;

  /// backlog · todo · in_progress · done · canceled
  final String category;
  bool get finished => category == 'done' || category == 'canceled';
}

class ProjectRef {
  const ProjectRef({required this.id, required this.key, required this.name, this.color, this.currency = '', this.manager = false});
  factory ProjectRef.fromJson(Json j) => ProjectRef(
    id: _s(j['id']),
    key: _s(j['key']),
    name: _s(j['name']),
    color: _ns(j['color']),
    currency: _s(j['currency']),
    manager: _b(j['manager']),
  );
  final String id;
  final String key;
  final String name;
  final String? color;
  final String currency;
  final bool manager;
}

class MyTask {
  const MyTask({
    required this.id,
    required this.key,
    required this.title,
    required this.priority,
    this.startDate,
    this.dueDate,
    required this.progress,
    required this.isMilestone,
    required this.isSubtask,
    required this.group,
    required this.status,
    required this.project,
  });

  factory MyTask.fromJson(Json j) => MyTask(
    id: _s(j['id']),
    key: _s(j['key']),
    title: _s(j['title']),
    priority: _s(j['priority']),
    startDate: _ns(j['startDate']),
    dueDate: _ns(j['dueDate']),
    progress: _i(j['progress']),
    isMilestone: _b(j['isMilestone']),
    isSubtask: _b(j['isSubtask']),
    group: DueGroup.parse(j['group']),
    status: StatusRef.fromJson({..._m(j['status']), 'id': ''}),
    project: ProjectRef.fromJson({..._m(j['project']), 'id': ''}),
  );

  final String id;
  final String key;
  final String title;
  final String priority;
  final String? startDate;
  final String? dueDate;
  final int progress;
  final bool isMilestone;
  final bool isSubtask;
  final DueGroup group;
  final StatusRef status;
  final ProjectRef project;
}

class MyTasks {
  const MyTasks({required this.today, required this.done, required this.tasks});
  factory MyTasks.fromJson(Json j) =>
      MyTasks(today: _s(j['today']), done: _i(j['done']), tasks: [for (final t in _l(j['tasks'])) MyTask.fromJson(t)]);
  final String today;
  final int done;
  final List<MyTask> tasks;
}

class Person {
  const Person({required this.id, required this.name, this.image});
  factory Person.fromJson(Json j) => Person(id: _s(j['id']), name: _s(j['name']), image: _ns(j['image']));
  final String id;
  final String name;
  final String? image;
}

class Comment {
  const Comment({required this.id, required this.body, this.createdAt, this.author, required this.mine});
  factory Comment.fromJson(Json j) => Comment(
    id: _s(j['id']),
    body: _s(j['body']),
    createdAt: _t(j['createdAt']),
    author: j['author'] is Map ? Person.fromJson(_m(j['author'])) : null,
    mine: _b(j['mine']),
  );
  final String id;
  final String body;
  final DateTime? createdAt;
  final Person? author;
  final bool mine;
}

class Photo {
  const Photo({required this.id, required this.name, required this.url, this.taskKey, this.taskTitle, this.uploadedAt, this.uploadedBy});
  factory Photo.fromJson(Json j) {
    final task = _m(j['task']);
    return Photo(
      id: _s(j['id']),
      name: _s(j['name']),
      url: _s(j['url']),
      taskKey: _ns(task['key']),
      taskTitle: _ns(task['title']),
      uploadedAt: _t(j['uploadedAt']),
      uploadedBy: _ns(j['uploadedBy']),
    );
  }
  final String id;
  final String name;
  final String url;
  final String? taskKey;
  final String? taskTitle;
  final DateTime? uploadedAt;
  final String? uploadedBy;
}

class TaskLink {
  const TaskLink({required this.key, required this.title, this.id = '', this.done = false});
  factory TaskLink.fromJson(Json j) => TaskLink(id: _s(j['id']), key: _s(j['key']), title: _s(j['title']), done: _b(j['done']));
  final String id;
  final String key;
  final String title;
  final bool done;
}

class TaskDetail {
  const TaskDetail({
    required this.id,
    required this.key,
    required this.title,
    this.description,
    required this.priority,
    this.startDate,
    this.dueDate,
    required this.progress,
    required this.isMilestone,
    required this.statusId,
    this.assignee,
    this.parent,
    required this.project,
    required this.statuses,
    required this.canStatus,
    required this.canProgress,
    required this.blockedBy,
    required this.subtasks,
    required this.comments,
    required this.photos,
  });

  factory TaskDetail.fromJson(Json j) {
    final t = _m(j['task']);
    final can = _m(j['can']);
    return TaskDetail(
      id: _s(t['id']),
      key: _s(t['key']),
      title: _s(t['title']),
      description: _ns(t['description']),
      priority: _s(t['priority']),
      startDate: _ns(t['startDate']),
      dueDate: _ns(t['dueDate']),
      progress: _i(t['progress']),
      isMilestone: _b(t['isMilestone']),
      statusId: _s(t['statusId']),
      assignee: t['assignee'] is Map ? Person.fromJson(_m(t['assignee'])) : null,
      parent: t['parent'] is Map ? TaskLink.fromJson(_m(t['parent'])) : null,
      project: ProjectRef.fromJson(_m(j['project'])),
      statuses: [for (final s in _l(j['statuses'])) StatusRef.fromJson(s)],
      canStatus: _b(can['status']),
      canProgress: _b(can['progress']),
      blockedBy: [for (final b in _l(j['blockedBy'])) TaskLink.fromJson(b)],
      subtasks: [for (final s in _l(j['subtasks'])) TaskLink.fromJson(s)],
      comments: [for (final c in _l(j['comments'])) Comment.fromJson(c)],
      photos: [for (final p in _l(j['photos'])) Photo.fromJson(p)],
    );
  }

  final String id;
  final String key;
  final String title;
  final String? description;
  final String priority;
  final String? startDate;
  final String? dueDate;
  final int progress;
  final bool isMilestone;
  final String statusId;
  final Person? assignee;
  final TaskLink? parent;
  final ProjectRef project;
  final List<StatusRef> statuses;
  final bool canStatus;
  final bool canProgress;
  final List<TaskLink> blockedBy;
  final List<TaskLink> subtasks;
  final List<Comment> comments;
  final List<Photo> photos;

  StatusRef? get status {
    for (final s in statuses) {
      if (s.id == statusId) return s;
    }
    return null;
  }

  bool get readOnly => !canStatus && !canProgress;
}

class Notice {
  const Notice({required this.id, required this.type, required this.title, this.body, required this.read, this.createdAt, this.actorName, this.taskKey});
  factory Notice.fromJson(Json j) {
    final open = _m(j['open']);
    return Notice(
      id: _s(j['id']),
      type: _s(j['type']),
      title: _s(j['title']),
      body: _ns(j['body']),
      read: _b(j['read']),
      createdAt: _t(j['createdAt']),
      actorName: _ns(_m(j['actor'])['name']),
      taskKey: open['type'] == 'task' ? _ns(open['key']) : null,
    );
  }
  final String id;
  final String type;
  final String title;
  final String? body;
  final bool read;
  final DateTime? createdAt;
  final String? actorName;

  /// The task the notification is about, when the app can open it.
  final String? taskKey;

  Notice markRead() => Notice(id: id, type: type, title: title, body: body, read: true, createdAt: createdAt, actorName: actorName, taskKey: taskKey);
}

class Inbox {
  const Inbox({required this.unread, required this.items});
  factory Inbox.fromJson(Json j) => Inbox(unread: _i(j['unread']), items: [for (final n in _l(j['items'])) Notice.fromJson(n)]);
  final int unread;
  final List<Notice> items;
}

class ProjectTasks {
  const ProjectTasks({required this.project, required this.tasks});
  factory ProjectTasks.fromJson(Json j) => ProjectTasks(
    project: ProjectRef.fromJson(_m(j['project'])),
    tasks: [for (final t in _l(j['tasks'])) TaskLink.fromJson(t)],
  );
  final ProjectRef project;
  final List<TaskLink> tasks;
}

enum Approval {
  pending,
  approved,
  rejected;

  static Approval parse(Object? v) => Approval.values.firstWhere((a) => a.name == v, orElse: () => Approval.pending);
}

class TimeEntry {
  const TimeEntry({
    required this.id,
    required this.date,
    required this.hours,
    this.note,
    required this.status,
    this.decisionNote,
    this.decidedBy,
    required this.project,
    this.task,
  });
  factory TimeEntry.fromJson(Json j) => TimeEntry(
    id: _s(j['id']),
    date: _s(j['date']),
    hours: _d(j['hours']),
    note: _ns(j['note']),
    status: Approval.parse(j['status']),
    decisionNote: _ns(j['decisionNote']),
    decidedBy: _ns(j['decidedBy']),
    project: ProjectRef.fromJson(_m(j['project'])),
    task: j['task'] is Map ? TaskLink.fromJson(_m(j['task'])) : null,
  );
  final String id;
  final String date;
  final double hours;
  final String? note;
  final Approval status;
  final String? decisionNote;
  final String? decidedBy;
  final ProjectRef project;
  final TaskLink? task;
}

class HoursWeek {
  const HoursWeek({required this.from, required this.to, required this.today, required this.entries});
  factory HoursWeek.fromJson(Json j) => HoursWeek(
    from: _s(j['from']),
    to: _s(j['to']),
    today: _s(j['today']),
    entries: [for (final e in _l(j['entries'])) TimeEntry.fromJson(e)],
  );
  final String from;
  final String to;
  final String today;
  final List<TimeEntry> entries;
  double get total => entries.fold(0, (s, e) => s + e.hours);
}

class Choice {
  const Choice(this.value, this.label);
  factory Choice.fromJson(Json j) => Choice(_s(j['value']), _s(j['label']));
  final String value;
  final String label;
}

class SiteLog {
  const SiteLog({this.weather, this.temperature, this.deliveries, this.problems, this.notes, this.updatedBy, this.updatedAt});
  factory SiteLog.fromJson(Json j) => SiteLog(
    weather: _ns(j['weather']),
    temperature: j['temperature'] is num ? (j['temperature'] as num).toInt() : null,
    deliveries: _ns(j['deliveries']),
    problems: _ns(j['problems']),
    notes: _ns(j['notes']),
    updatedBy: _ns(j['updatedByName']),
    updatedAt: _t(j['updatedAt']),
  );
  final String? weather;
  final int? temperature;
  final String? deliveries;
  final String? problems;
  final String? notes;
  final String? updatedBy;
  final DateTime? updatedAt;
}

class SiteLogDay {
  const SiteLogDay({required this.date, required this.log, required this.today, required this.days, required this.weather});
  factory SiteLogDay.fromJson(Json j) => SiteLogDay(
    date: _s(j['date']),
    today: _s(j['today']),
    log: j['log'] is Map ? SiteLog.fromJson(_m(j['log'])) : null,
    days: [for (final d in _l(j['days'])) (date: _s(d['date']), weather: _ns(d['weather']), problems: _b(d['hasProblems']))],
    weather: [for (final w in _l(j['weather'])) Choice.fromJson(w)],
  );
  final String date;
  final String today;
  final SiteLog? log;
  final List<({String date, String? weather, bool problems})> days;
  final List<Choice> weather;
}

class Expense {
  const Expense({
    required this.id,
    required this.date,
    required this.amount,
    required this.currency,
    required this.category,
    required this.description,
    this.payee,
    required this.project,
    required this.advance,
    this.receiptUrl,
    required this.status,
    this.decidedBy,
    this.decisionNote,
  });
  factory Expense.fromJson(Json j) => Expense(
    id: _s(j['id']),
    date: _s(j['date']),
    amount: _d(j['amount']),
    currency: _s(j['currency']),
    category: _s(j['category']),
    description: _s(j['description']),
    payee: _ns(j['payee']),
    project: ProjectRef.fromJson(_m(j['project'])),
    advance: _b(j['advance']),
    receiptUrl: _ns(j['receiptUrl']),
    status: Approval.parse(j['status']),
    decidedBy: _ns(j['decidedBy']),
    decisionNote: _ns(j['decisionNote']),
  );
  final String id;
  final String date;
  final double amount;
  final String currency;
  final String category;
  final String description;
  final String? payee;
  final ProjectRef project;
  final bool advance;
  final String? receiptUrl;
  final Approval status;
  final String? decidedBy;
  final String? decisionNote;
}

class Advance {
  const Advance({required this.id, required this.projectId, required this.projectName, required this.currency, required this.amount, required this.open, this.reason});
  factory Advance.fromJson(Json j) => Advance(
    id: _s(j['id']),
    projectId: _s(j['projectId']),
    projectName: _s(j['projectName']),
    currency: _s(j['currency']),
    amount: _d(j['amount']),
    open: _d(j['open']),
    reason: _ns(j['reason']),
  );
  final String id;
  final String projectId;
  final String projectName;
  final String currency;
  final double amount;

  /// What's left to spend or return.
  final double open;
  final String? reason;
}

class ExpensesPage {
  const ExpensesPage({required this.categories, required this.advances, required this.expenses});
  factory ExpensesPage.fromJson(Json j) => ExpensesPage(
    categories: [for (final c in _l(j['categories'])) Choice.fromJson(c)],
    advances: [for (final a in _l(j['advances'])) Advance.fromJson(a)],
    expenses: [for (final e in _l(j['expenses'])) Expense.fromJson(e)],
  );
  final List<Choice> categories;
  final List<Advance> advances;
  final List<Expense> expenses;

  String categoryLabel(String value) {
    for (final c in categories) {
      if (c.value == value) return c.label;
    }
    return value;
  }
}

class Loan {
  const Loan({
    required this.id,
    required this.amount,
    required this.currency,
    required this.issuedOn,
    this.reason,
    this.project,
    required this.returned,
    required this.spent,
    required this.pending,
    required this.balance,
    required this.paidPct,
    required this.paidOff,
  });
  factory Loan.fromJson(Json j) => Loan(
    id: _s(j['id']),
    amount: _d(j['amount']),
    currency: _s(j['currency']),
    issuedOn: _s(j['issuedOn']),
    reason: _ns(j['reason']),
    project: j['project'] is Map ? ProjectRef.fromJson(_m(j['project'])) : null,
    returned: _d(j['returned']),
    spent: _d(j['spent']),
    pending: _d(j['pending']),
    balance: _d(j['balance']),
    paidPct: _i(j['paidPct']),
    paidOff: _b(j['paidOff']),
  );
  final String id;
  final double amount;
  final String currency;
  final String issuedOn;
  final String? reason;

  /// Set for a cash advance taken from a project's budget.
  final ProjectRef? project;
  final double returned;
  final double spent;
  final double pending;
  final double balance;
  final int paidPct;
  final bool paidOff;
}

class LoanRequest {
  const LoanRequest({required this.id, required this.amount, required this.currency, required this.reason, required this.status, this.decisionNote, this.decidedBy, this.createdAt});
  factory LoanRequest.fromJson(Json j) => LoanRequest(
    id: _s(j['id']),
    amount: _d(j['amount']),
    currency: _s(j['currency']),
    reason: _s(j['reason']),
    status: Approval.parse(j['status']),
    decisionNote: _ns(j['decisionNote']),
    decidedBy: _ns(j['decidedBy']),
    createdAt: _t(j['createdAt']),
  );
  final String id;
  final double amount;
  final String currency;
  final String reason;
  final Approval status;
  final String? decisionNote;
  final String? decidedBy;
  final DateTime? createdAt;
}

class LoansPage {
  const LoansPage({required this.currencies, required this.loans, required this.requests});
  factory LoansPage.fromJson(Json j) => LoansPage(
    currencies: [for (final c in (j['currencies'] is List ? j['currencies'] as List : const [])) '$c'],
    loans: [for (final l in _l(j['loans'])) Loan.fromJson(l)],
    requests: [for (final r in _l(j['requests'])) LoanRequest.fromJson(r)],
  );
  final List<String> currencies;
  final List<Loan> loans;
  final List<LoanRequest> requests;
}
