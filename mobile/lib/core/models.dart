// Plain, immutable models for the mobile API (docs/mobile-api.md).
// Hand-written fromJson: no code generation, nothing extra to build.

typedef Json = Map<String, dynamic>;

int _int(Object? v) => v is num ? v.toInt() : 0;
String _str(Object? v) => v is String ? v : '';

enum Role {
  owner,
  admin,
  member;

  static Role parse(Object? v) => switch (v) {
    'owner' => Role.owner,
    'admin' => Role.admin,
    _ => Role.member,
  };

  bool get isAdmin => this != Role.member;
}

enum HomeView {
  manager,
  member;

  static HomeView parse(Object? v) => v == 'manager' ? HomeView.manager : HomeView.member;
}

class User {
  const User({required this.id, required this.name, required this.email, this.image, required this.locale});

  factory User.fromJson(Json j) => User(
    id: _str(j['id']),
    name: _str(j['name']),
    email: _str(j['email']),
    image: j['image'] as String?,
    locale: _str(j['locale']),
  );

  final String id;
  final String name;
  final String email;
  final String? image;
  final String locale;

  String get firstName {
    final n = name.trim();
    if (n.isEmpty) return email.split('@').first;
    return n.split(RegExp(r'\s+')).first;
  }
}

class Workspace {
  const Workspace({
    required this.id,
    required this.slug,
    required this.name,
    required this.role,
    required this.view,
    required this.managesProjects,
    required this.allowed,
    required this.unread,
  });

  factory Workspace.fromJson(Json j) {
    final access = (j['access'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Workspace(
      id: _str(j['id']),
      slug: _str(j['slug']),
      name: _str(j['name']),
      role: Role.parse(j['role']),
      view: HomeView.parse(j['view']),
      managesProjects: _int(j['managesProjects']),
      allowed: access['allowed'] == true,
      unread: _int(j['unread']),
    );
  }

  final String id;
  final String slug;
  final String name;
  final Role role;
  final HomeView view;
  final int managesProjects;

  /// false when the company's subscription isn't active.
  final bool allowed;
  final int unread;
}

class Me {
  const Me({required this.user, required this.workspaces});

  factory Me.fromJson(Json j) => Me(
    user: User.fromJson((j['user'] as Map).cast<String, dynamic>()),
    workspaces: [
      for (final w in (j['workspaces'] as List? ?? const []))
        Workspace.fromJson((w as Map).cast<String, dynamic>()),
    ],
  );

  final User user;
  final List<Workspace> workspaces;

  Workspace? workspace(String? slug) {
    for (final w in workspaces) {
      if (w.slug == slug) return w;
    }
    return null;
  }
}

class TaskCounts {
  const TaskCounts({this.overdue = 0, this.today = 0, this.week = 0, this.later = 0, this.none = 0});

  factory TaskCounts.fromJson(Json j) => TaskCounts(
    overdue: _int(j['overdue']),
    today: _int(j['today']),
    week: _int(j['week']),
    later: _int(j['later']),
    none: _int(j['none']),
  );

  final int overdue;
  final int today;
  final int week;
  final int later;
  final int none;

  int get needsYouToday => overdue + today;
  int get open => overdue + today + week + later + none;
}

class Approvals {
  const Approvals({this.expenses = 0, this.hours = 0, this.loans = 0});

  factory Approvals.fromJson(Json j) =>
      Approvals(expenses: _int(j['expenses']), hours: _int(j['hours']), loans: _int(j['loans']));

  final int expenses;
  final int hours;
  final int loans;

  int get total => expenses + hours + loans;
}

class Manage {
  const Manage({
    required this.projects,
    required this.behind,
    required this.overBudget,
    required this.headingOver,
    required this.lateTasks,
    required this.approvals,
  });

  factory Manage.fromJson(Json j) => Manage(
    projects: _int(j['projects']),
    behind: _int(j['behind']),
    overBudget: _int(j['overBudget']),
    headingOver: _int(j['headingOver']),
    lateTasks: _int(j['lateTasks']),
    approvals: Approvals.fromJson((j['approvals'] as Map?)?.cast<String, dynamic>() ?? const {}),
  );

  final int projects;
  final int behind;
  final int overBudget;
  final int headingOver;
  final int lateTasks;
  final Approvals approvals;
}

class Home {
  const Home({
    required this.workspaceName,
    required this.role,
    required this.view,
    required this.unread,
    required this.myTasks,
    this.manage,
  });

  factory Home.fromJson(Json j) {
    final ws = (j['workspace'] as Map?)?.cast<String, dynamic>() ?? const {};
    final manage = j['manage'];
    return Home(
      workspaceName: _str(ws['name']),
      role: Role.parse(ws['role']),
      view: HomeView.parse(j['view']),
      unread: _int(j['unread']),
      myTasks: TaskCounts.fromJson((j['myTasks'] as Map?)?.cast<String, dynamic>() ?? const {}),
      manage: manage is Map ? Manage.fromJson(manage.cast<String, dynamic>()) : null,
    );
  }

  final String workspaceName;
  final Role role;
  final HomeView view;
  final int unread;
  final TaskCounts myTasks;

  /// Only for owners, admins and project managers.
  final Manage? manage;
}
