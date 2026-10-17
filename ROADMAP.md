# PMS — Roadmap

Self-hosted, multi-tenant project management SaaS for any kind of business project:
weighted tasks, automatic accomplishment %, resources (materials, equipment, workers,
suppliers) and budget vs actual expenses.

Stack: Next.js 16 · TypeScript · Tailwind v4 + shadcn/ui · PostgreSQL 17 · Drizzle · Better Auth.
Design system: [design-system/pms/MASTER.md](design-system/pms/MASTER.md).

## How the app is organized

```
Company (workspace)
 ├── Members (owner / admin / member)
 ├── Resource library: materials, equipment, workers, suppliers
 └── Projects
      └── Project
           ├── Overview   → accomplishment %, budget vs spent, dates, alerts
           ├── Tasks      → weighted work items (table, board, timeline)
           ├── Resources  → what the project needs and uses
           ├── Expenses   → every payment, linked to a task / resource
           └── Activity   → history of every change
```

- **Accomplishment %** = Σ (task weight × task % done). Compared with the planned % for today's date.
- **Budget** = planned per project and per task; **actual** = recorded expenses.

Legend: `[x]` done · `[ ]` not done yet

---

## Phase 0 — Foundation
- [x] Project setup, PostgreSQL (Docker), Drizzle migrations
- [x] Login system (Better Auth), workspaces, members, roles

## Phase 1 — Login & app layout
- [x] Sign up / log in, protected pages
- [x] Create workspace (onboarding)
- [x] Sidebar, workspace switcher, user menu, light/dark theme

## Phase 2 — Projects
- [x] Project list, create project
- [ ] Project details: start/end dates, budget, currency, client, manager, status
- [ ] Project settings: edit, archive / restore, delete

## Phase 3 — Tasks (weighted work items)
- [x] Basic tasks: title, description, status, priority, assignee, due date, activity history
- [x] Board (Kanban) view with drag & drop, list view
- [ ] Task weight (%) and % done
- [ ] Start and end dates per task
- [ ] Budget per task
- [ ] Sub-tasks
- [ ] Delete task

## Phase 4 — Accomplishment
- [ ] Automatic project % from weighted tasks
- [ ] Planned % for today's date + ahead / on track / behind indicator
- [ ] Warning when task weights don't add up to 100%

## Phase 5 — Resources
- [ ] Company resource library (materials, equipment, workers, suppliers)
- [ ] Assign resources to a project / task (quantity, rate)
- [ ] Planned vs used quantities
- [ ] Project resources page

## Phase 6 — Expenses & budget
- [ ] Record expenses (amount, date, category, task, resource / supplier)
- [ ] Receipt upload
- [ ] Budget vs actual per project and per task
- [ ] Over-budget warnings

## Phase 7 — Dashboards & reports
- [ ] Project overview dashboard
- [ ] Company dashboard (all projects)
- [ ] Timeline / Gantt view
- [ ] Export reports (PDF / Excel)

## Phase 8 — Team & collaboration
- [ ] Invite members by email, manage roles
- [ ] Email sending (invites, password reset)
- [ ] Comments on tasks
- [ ] Notifications (assigned, late task, over budget)

## Phase 9 — Running it as a SaaS
- [ ] Plans & limits, billing
- [ ] Client / guest access (clients view their project's progress)
- [ ] Admin panel, audit log

## Phase 10 — Going live on your Ubuntu servers
- [ ] Automated tests, production Docker setup
- [ ] Deploy with HTTPS
- [ ] Nightly backups, monitoring
