# Mobile API (v1)

JSON API for the Flutter app in `mobile/`. Every rule is enforced on the server with the same
permission checks as the website; the app only hides what a person can't do.

Base URL: `{server}/api/mobile/v1`

## Authentication

1. `POST /session` with `{ "email": "...", "password": "..." }`
   → `200 { "token": "...", "me": { ... } }`
2. Keep `token` in the phone's secure storage (Keychain / Keystore).
3. Send it on every request: `Authorization: Bearer <token>`.
4. `DELETE /session` signs out (that token stops working; other devices stay signed in).

Send `Accept-Language: ar` or `en` (the app's language): every message and label comes back
in it. Without the header, the account's language is used.

## Errors

```json
{ "error": { "code": "unauthorized", "message": "Please sign in again." } }
```

| Status | `code` | What the app does |
|---|---|---|
| 400 | `invalid` | Show `message` next to the form |
| 401 | `unauthorized`, `invalid_credentials` | Go to the login screen (clear the token) |
| 402 | `locked` | The company's subscription isn't active: show `message`, offer to switch company |
| 404 | `not_found` | Not found, or not allowed to see it (the API never says which) |

`message` is always ready to show.

## Endpoints

### `GET /me`

```json
{
  "apiVersion": 1,
  "user": { "id": "...", "name": "Mona", "email": "...", "image": null, "locale": "ar" },
  "workspaces": [
    {
      "id": "...", "slug": "al-noor", "name": "Al-Noor Construction",
      "role": "member",
      "view": "member",
      "managesProjects": 0,
      "access": { "allowed": true, "kind": "active" },
      "unread": 3
    }
  ]
}
```

`view` decides which home the app opens: `"manager"` for owners, admins and anyone who manages
a project in that company; `"member"` otherwise. A person can have a different view in each company.

### `GET /w/{slug}/home`

```json
{
  "workspace": { "slug": "al-noor", "name": "Al-Noor Construction", "role": "member" },
  "view": "member",
  "today": "2026-10-23",
  "unread": 3,
  "myTasks": { "overdue": 1, "today": 1, "week": 4, "later": 2, "none": 0 },
  "manage": null
}
```

For the manager view, `manage` is:

```json
{
  "projects": 6, "behind": 1, "overBudget": 0, "headingOver": 2, "lateTasks": 5,
  "approvals": { "expenses": 2, "hours": 4, "loans": 1 }
}
```

## Member endpoints (23c)

Every write calls **the website's own action** (same validation, permissions, notifications,
automations, budget alerts), so the app can never do something the website wouldn't allow.

A change answers `200/201 { "ok": true, "warning"?, "info"?, "pending"? }`:
`warning` = saved, but worth knowing (e.g. started while blocked); `pending` = saved and waiting
for approval. A refused change answers
`400 { "error": { "code": "invalid", "message": "...", "fields": { "hours": "..." } } }`;
show `fields[name]` under that field.

All paths below are under `/w/{slug}`.

| Method & path | What |
|---|---|
| `GET /tasks` | My open tasks: `{ today, done, tasks: [{ id, key, title, priority, startDate, dueDate, progress, isMilestone, isSubtask, group, status{name,color,category}, project{key,name,color} }] }`. `group`: `overdue · today · week · later · none` |
| `GET /tasks/{id or key}` | One task (key like `CLIN-3`, as in notification links): `task`, `project`, `statuses`, `can{status,progress,comment}`, `blockedBy`, `subtasks`, `comments[{…, mine}]`, `photos[{url}]` |
| `PATCH /tasks/{id}` | `{ statusId?, progress? }` |
| `POST /tasks/{id}/comments` | `{ body }` |
| `GET /inbox` | `{ unread, items: [{ id, type, title, body, read, createdAt, actor, open }] }`; `open: { type: "task", key }` when the app can show it |
| `POST /inbox/{id}/read` · `POST /inbox/read` | Mark one / all read |
| `GET /projects` | The active projects I can see: `{ projects: [{ id, key, name, color, currency, manager }] }` |
| `GET /projects/{id}` | `{ project, tasks: [{ id, key, title, isSubtask, mine }] }` (open tasks, for pickers) |
| `GET /hours?week=YYYY-MM-DD` | My hours that week (Saturday–Friday): `{ from, to, today, entries: [{ id, date, hours, note, status, decisionNote, project, task }] }` |
| `POST /hours` | `{ projectId, date, hours, taskId?, note?, entryId? }`: team members' hours wait for the manager |
| `DELETE /hours/{id}` | My entry, while not approved |
| `GET /projects/{id}/site-log?date=` | `{ date, today, log, days, weather: [{ value, label }] }` |
| `PUT /projects/{id}/site-log` | `{ date, weather?, temperature?, deliveries?, problems?, notes? }` |
| `GET /projects/{id}/photos` | The project's photos (file library, "Photos"), newest first |
| `POST /projects/{id}/photos` | multipart: `file` (one or more images), `taskId?`, `note?` |
| `GET /expenses` | `{ categories, advances (my open cash advances), expenses (mine, with status and receiptUrl) }` |
| `POST /expenses` | multipart: `projectId, date, amount, category, description, payee?, taskId?, loanId?, receipt?` |
| `GET /loans` | `{ currencies, loans (mine, with returned/spent/pending/balance), requests (mine) }` |
| `POST /loans/requests` · `DELETE /loans/requests/{id}` | Ask for a loan `{ amount, currency, reason }` / withdraw it |

Photos and receipts (`url`, `receiptUrl`) are server paths: load them from `{server}{url}` with
the same `Authorization: Bearer` header.

Manager screens (approvals, project health, attendance…) arrive with roadmap 23d.
