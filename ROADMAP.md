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

## Phase 17 — Blocked tasks, member permissions & loans
- [x] Blocked tasks are locked until what they wait on is finished: nobody can start them, change progress or finish them; members can only comment; admins / project manager can still plan them (dates, assignee, weight, priority) and fix dependencies
- [x] Project team: each project has a list of members (manager adds/removes them); existing projects get their manager and current assignees
- [x] Strict member role: sees only their projects; updates only tasks assigned to them (status, progress, sub-tasks), comments, adds expenses; cannot create projects, create/delete tasks, change weights/budgets/dates, or edit the resource library — enforced on the server, and the screens hide what they can't do
- [x] Loans: owners/admins lend money to a member or a worker; free repayments of any amount until the balance is zero; "Paid off" when finished; full history
- [x] Loan requests: a member asks for a loan (amount, reason) → admins approve (it becomes a loan) or reject with a reason; notifications both ways
- [x] Members see their own loans and balance; Loans page for admins (who owes what, totals); audit log; Arabic & English
- [x] Project cash advances: a loan can come from a project's budget (counted as spent right away); the borrower adds receipts as project expenses linked to the advance (owners/admins approve them); cash brought back returns to the budget; settled when receipts + cash = the amount

## Phase 18 — Risk register *(construction, engineering, PMO)*
- [x] Each project has a list of risks: title, description, category, likelihood (1–5) × impact (1–5) = score, owner, plan to reduce it, status (open / watching / closed)
- [x] Score shown as low / medium / high with text, not colour alone; sort and filter by score and status
- [x] Risk matrix (likelihood × impact grid) showing where the open risks sit
- [x] Top open risks on the project overview; a risk can be linked to a task
- [x] Permissions: manager / admins edit; team members can raise a risk; owner notified when assigned
- [x] Audit log, Arabic & English, included in the project report (Excel / PDF)

## Phase 19 — Cost forecast *(where will the money end up?)*
- [x] Forecast final cost from spending vs accomplishment % (earned value): expected total at the end, expected over/under budget
- [x] Cost and schedule health: "spending faster than progress" / "behind schedule" indicators, explained in plain words
- [x] Shown on the project overview and expenses page, the dashboard, and the report

## Phase 20 — Daily timesheets / site log
- [x] Record per day who worked (members and workers), how many days or hours, on which task
- [x] Labour resources' used quantity fills in automatically from timesheets (no double entry)
- [x] Daily site log page per project: who was there, notes (weather, deliveries, problems)
- [x] Members log their own time; managers log for workers and approve
- [x] Timesheet report per person / per task / per week

## Phase 21 — Branded documents & files *(sold to many companies: each one's own letterhead)*

### 21a — Company profile (Settings)
- [x] Each company enters its own logo, name (Arabic & English), address, phone, email, website, registration / tax number, footer line, stamp or signature image
- [x] Brand colour, default paper style and default document language
- [x] Only owners / admins can edit; every document prints with the buying company's details, never another's

### 21b — Documents (8 types × 3 paper styles)
- [x] Types: contract / agreement, purchase order, goods received / store note, payment voucher, permit / official letter, handover / completion certificate, work order / site instruction, quotation, invoice (quotation and invoice numbered separately)
- [x] 3 paper styles: Classic (formal letterhead), Modern (colour band), Minimal — each in the company's brand colour
- [x] Created from a project; pre-filled from it (client, project, materials, amounts); line items with totals; amount in words
- [x] Automatic numbering per type (e.g. PO-0001); status: draft → issued → signed / cancelled
- [x] Print or save as PDF (A4), in Arabic or English, with signature boxes and stamp
- [x] Documents list per project; audit log

### 21c — Each company customizes its forms
- [x] Per document type: rename labels, hide fields it doesn't use, add its own extra fields
- [x] Default wording / terms per type; number prefix; turn types on or off

### 21d — Project file library
- [x] Files tab per project: drawings (PDF, DWG, DXF), contracts (signed scans), permits, photos, Office files — stored on your server, up to 25 MB each, type checked from the file's contents
- [x] Versions: a new upload keeps the old ones; categories; link a file to a task
- [x] Permissions follow the project team

## Phase 22 — Portfolios
- [ ] Group projects into portfolios (e.g. "Baghdad branch", "Government contracts")
- [ ] Portfolio page: budget, spent, forecast, accomplishment and risks totalled across its projects

## Phase 23 — Install as a phone app
- [ ] Installable app (PWA): home-screen icon, full screen, app name in Arabic & English
- [ ] Friendly "you're offline" screen

## Phase 24 — Calendar link
- [ ] Private calendar link (iCal) per person: their tasks and milestones appear in Google / Outlook / phone calendar
- [ ] Reset the link if it leaks

## Phase 25 — Automatic weekly report
- [ ] Every week, managers get a summary per project: progress vs plan, spending and forecast, late tasks, top risks
- [ ] Delivered to the inbox (and by email once real email is on)

## Phase 26 — AI assistant & integrations *(needs a decision: free AI services vs paid vs own server — discussed, to decide later)*
- [ ] AI: turn a project brief into weighted tasks
- [ ] AI: weekly status summary and risk list per project
- [ ] "Continue with Google" sign-in
- [ ] Outgoing webhooks / API for other systems

## Phase 27 — Going live on your Ubuntu servers
- [ ] **Turn on real email** (SMTP settings in `.env`) — chosen to postpone; currently printed to terminal
- [ ] Automated tests, production Docker setup
- [ ] Deploy with HTTPS
- [ ] Nightly backups, monitoring
