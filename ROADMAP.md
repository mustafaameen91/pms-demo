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
- [x] Project details: start/end dates, budget, currency, client, manager, status
- [x] Project settings: edit, change key, archive / restore, delete

## Phase 3 — Tasks (weighted work items)
- [x] Basic tasks: title, description, status, priority, assignee, due date, activity history
- [x] Table view (default), Board (Kanban) with drag & drop, List view
- [x] Task weight (%) and % done
- [x] Start and end dates per task
- [x] Budget per task
- [x] Sub-tasks
- [x] Delete task (with Undo)

## Phase 4 — Accomplishment
- [x] Automatic project % from weighted tasks (Overview tab, header, project cards, table total)
- [x] Planned % for today's date + ahead / on track / behind indicator
- [x] Warning when task weights don't add up to 100%

## Phase 5 — Resources
Workers are names with a rate (they don't log in). No availability / double-booking checks.
- [x] Company resource library (materials, equipment, workers, suppliers) — Resources page in the sidebar
- [x] Assign resources to a project / task (quantity, price), or create one inline
- [x] Planned vs used quantities and costs, over-plan warning
- [x] Project Resources tab (+ resources listed in the task panel)

## Phase 6 — Expenses & budget
Spent = used resource costs (automatic) + other expenses. Payments linked to a resource reduce what is owed and are not counted twice.
- [x] Record expenses (amount, date, category, task, payee) and payments to resources
- [x] Receipt upload (PDF / images, stored on your server, members only)
- [x] Budget vs actual per project and per task (Expenses tab)
- [x] Over-budget warnings (project + task, header badge)

## Phase 7 — Dashboards & reports
- [x] Project overview dashboard (accomplishment, money, late & upcoming tasks)
- [x] Company dashboard (all projects; problems first; totals per currency)
- [x] Timeline / Gantt view (view only — dragging bars to reschedule is not built)
- [x] Export reports: Excel (.xlsx) and PDF (print page → browser "Save as PDF")

## Phase 8 — Team & collaboration
- [x] Invite members (copy invite link), accept page, change roles, remove — Members page
- [x] Email plumbing for invites, password reset and notifications — **printed to the server terminal until SMTP is configured** (see README)
- [x] Comments on tasks with @mentions
- [x] Notifications inbox: assigned, mentioned, comments, late task, over budget

## Phase 9 — Running it as a SaaS
One plan: **Pro** (unlimited, paid only). Customers pay you outside the app (cash, bank, ZainCash, FIB, Qi…);
you record the payment in the admin panel, which activates/extends the workspace.
- [x] Subscription per workspace: awaiting payment → active until date → warning 7 days before → locked when expired (data kept)
- [x] Billing page for customers (price, how to pay, payment history)
- [x] Platform admin panel (`/admin`): all workspaces, record payments, free access / cancel, price & payment instructions
- [x] Client access: private read-only link per project (optional budget), can be turned off or replaced
- [x] Audit log with filters and CSV download
- [ ] Online card/wallet payments (later, once a provider that works for you is chosen)

## Phase 10 — Going live on your Ubuntu servers
- [ ] **Turn on real email** (SMTP settings in `.env`) — chosen to postpone; currently printed to terminal
- [ ] Automated tests, production Docker setup
- [ ] Deploy with HTTPS
- [ ] Nightly backups, monitoring
