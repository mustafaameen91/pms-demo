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

## Phase 10 — Project templates *(fit every field)*
- [x] Built-in industry templates: construction, renovation / fit-out, marketing campaign, IT rollout, event, client consulting, product launch, production run
- [x] Each template: workflow statuses + weighted tasks + sub-tasks + planned durations
- [x] "New project" starts from a template (dates placed from the project start date; end date derived)
- [x] "Save as template" from any project, and a Templates page to manage them

## Phase 11 — Milestones & dependencies *(construction, PMO, product)*
- [x] Milestones (key dates) shown on the timeline and Overview; not counted in the %
- [x] Task dependencies: "B can't start before A is finished" (loops refused; Blocked badge; built-in templates come with dependency chains)
- [x] Warning when a task starts before what it depends on is done, or is scheduled to start before it ends
- [x] Dependency arrows on the timeline (red = date conflict)

## Phase 12 — Approvals *(finance, construction)*
- [x] Approval rule per project: expenses above an amount (project currency) need approval; approvers = owners, admins, project manager (their own expenses are auto-approved)
- [x] Pending / approved / rejected expenses; only approved ones count as spent; editing a rejected one resubmits it
- [x] Approve / reject (reason required) on the Expenses tab and a workspace Approvals page; notifications to approvers and requester

## Phase 13 — Request forms *(IT, operations, marketing)*
- [x] Public request form per project (no login) → creates a task in the chosen column, optionally assigned
- [x] Choose which fields to ask + your own questions; spam protection (hidden trap field, too-fast check, 5 requests / 10 min per connection)
- [x] Requester gets a reference number (and a confirmation email when SMTP is on); team gets notified; form can be closed or its link replaced

## Phase 14 — Everyday productivity
- [x] "My tasks" across all projects
- [x] Global search (⌘K / Ctrl+K)
- [x] Workload view: tasks per person per week, who is overloaded
- [x] Calendar view
- [x] Recurring tasks
- [x] Custom fields per project

## Phase 15 — Automations
- [x] Rules: "when status becomes Done → notify the manager", "when an expense is added → …", "when a task is late → …"
- [x] Simple rule builder (when … then …), on/off per rule, run history

## Phase 16 — Arabic & English
- [x] Language switch (English / العربية) on every page incl. login; each person's choice is remembered
- [x] Right-to-left layout for Arabic (sidebar, panels, tables, board, icons) + Arabic font
- [x] All screens translated: sign-in, workspace, projects, tasks, resources, expenses, approvals, automations, settings, billing, admin, public forms and client page
- [x] Notifications, emails, activity history and audit log in each person's language
- [x] Dates, money and numbers formatted per language; Excel export in your language
- [x] Tests: everything still passes in English, plus an Arabic check

## Phase 17 — AI assistant & integrations *(needs a decision: free AI services vs paid vs own server — discussed, to decide later)*
- [ ] AI: turn a project brief into weighted tasks
- [ ] AI: weekly status summary and risk list per project
- [ ] "Continue with Google" sign-in
- [ ] Outgoing webhooks / API for other systems

## Phase 18 — Going live on your Ubuntu servers
- [ ] **Turn on real email** (SMTP settings in `.env`) — chosen to postpone; currently printed to terminal
- [ ] Automated tests, production Docker setup
- [ ] Deploy with HTTPS
- [ ] Nightly backups, monitoring
