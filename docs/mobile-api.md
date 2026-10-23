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

Send `Accept-Language: ar` or `en` so error messages come back in the person's language
(the account's language wins once signed in).

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

More endpoints (tasks, timesheets, site log, files, approvals…) arrive with the app's member
and manager screens (roadmap 23c / 23d).
