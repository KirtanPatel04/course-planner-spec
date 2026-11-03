# Architecture Process Notes (Project 3)

This file records how I used AI for Project 3: the nonfunctional requirements I added to spec.md, the design questions and my answers to them, and the architecture review along with the changes it led to. I'm the only team member, so there is a single architecture.md on `main`.

## Task 1: Nonfunctional requirements

**Prompt used:** "Review spec.md. Analyze the contents and identify 5-10 nonfunctional requirements needed to achieve its goals. For each, explain how you arrived at it, tracing back to the spec. Recommend a priority order."

**How I prioritized them.** I ranked them by how much damage a failure would cause, and how hard it would be to fix later:

1. **Privacy (NFR-001):** a leak of another student's records is a FERPA problem and can't be undone. FR-019 already had the rule, but nothing said it had to be enforced on the server.
2. **State integrity (NFR-002):** a double-click or a race between two requests could double-enroll a student or put a schedule in an impossible status. The status transition list and FR-020 implied this, but never said it for concurrent requests.
3. **Freshness (NFR-003):** the whole value of automatic checking (BG-1) depends on the data being current. FR-010 implied a 60-minute limit, and this NFR makes it explicit.
4. **Durable pending work (NFR-004):** FR-018's 24-hour retry is meaningless if a restart loses the queue.
5. **Availability (NFR-005):** registration windows are when the system matters. The 99.5% and 500-user figures are my own assumptions.
6. **Responsiveness (NFR-006):** AC-004 said "without refreshing" but gave no time limit.
7. **Auditability (NFR-007):** Advisor Decisions already had timestamps. Extending that to every transition supports BG-5 and resolves disputes.
8. **Accessibility (NFR-008):** a public university is held to WCAG 2.1 AA. A calendar grid is the screen most likely to fail.
9. **Notification timeliness (NFR-009):** BG-4 (no meetings for routine approvals) depends on students hearing back quickly.
10. **Replaceable integration (NFR-010):** I don't have real MavLINK access, so the system has to run against a simulator.

**What I changed from the AI suggestions.** I dropped a generic "scalability" NFR and folded the one number that mattered (500 concurrent users) into NFR-005. I dropped "maintainability: code coverage of 80%" because nothing in the spec traces to it. I marked every number I made up as *(assumed)*. I also added a **Non-goals** section to spec.md, since the architecture template copies its Out of scope section from it and the Project 2 spec didn't have one.

## Task 2.1: Design questions and my answers

**Prompt used:** "Let's start the architectural design process. Read spec.md. Implementation constraints: TypeScript, React + Node/Express, PostgreSQL; free hosting only; no real MavLINK API (use a simulator); solo developer, one semester; identity comes from UNO SSO. Before you write anything, list the questions where the spec leaves a design choice that I should make."

| # | Question the spec leaves open | My answer | Became |
|---|---|---|---|
| 1 | Is authentication needed, and where do roles come from? | No log-in of our own. Trust the SSO user ID and take roles and advisor scope from MavLINK data. | D1 |
| 2 | Where is authorization checked? | On the server, before any module runs. | D2 |
| 3 | One application or several services? | One server process and one database. | D3 |
| 4 | Query MavLINK live, or keep a local copy? | Keep a snapshot with a sync time. FR-015 and FR-018 can't work without one. | D4 |
| 5 | How often to sync outside registration windows? | Once a day. | D5 (and Spec issue 4) |
| 6 | Does MavLINK push changes, or do we poll? | Poll and compare with the snapshot. | D6 |
| 7 | Validate in the browser or on the server? | Server only. The browser just displays results. | D7 |
| 8 | How do we stop double approvals and double submissions? | Conditional status updates in a transaction, plus a unique index. | D8 |
| 9 | How are enrollment retries stored? | A job row created with the approval, unique per schedule. | D9, D10 |
| 10 | How are in-app notifications delivered? | Stored rows, loaded on page open and checked every 30 seconds. No WebSockets. | D11 |
| 11 | When is a schedule classified, and is it ever reclassified? | On submit, and again when revalidation finds a change. | D12 |
| 12 | What algorithm generates the plan? | Prerequisite order, earliest allowed term, within the credit limit. | D13 |
| 13 | What time zone? | Store UTC and display Central time. | D14 |
| 14 | What if the spec contradicts itself? | Don't guess. List it under Spec issues. | architecture.md "Spec issues" |

## Task 3: Architecture review

**Prompt used:** "Read spec.md and architecture.md. For every acceptance criterion, name the module that enforces it. List any criterion with no home, any module that no criterion needs, and any decision whose reason does not trace to the spec. Do not change either file."

### Acceptance criterion to enforcing module

| AC | Enforced by | AC | Enforced by |
|---|---|---|---|
| AC-001 | Catalog Search | AC-019 | Registration Sync (on-open refresh), Validator |
| AC-002 | Catalog Search, Web Client | AC-020 | Job Runner, Registration Sync |
| AC-003 | Schedule Manager, Web Client | AC-021 | Planner (triggered by Registration Sync) |
| AC-004 | Validator, Web Client (no reload) | AC-022 | Classifier |
| AC-005 | Validator | AC-023 | Classifier |
| AC-006 | Validator | AC-024 | Enrollment, Planner, Notifier |
| AC-007 | Validator | AC-025 | Enrollment, Registration Gateway (failure reason), Notifier |
| AC-008 | Validator, Registration Gateway (hold type) | AC-026 | Revalidator, Schedule Manager, Enrollment (cancels job) |
| AC-009 | Validator | AC-027 | Revalidator, Notifier |
| AC-010 | Planner | AC-028 | Schedule Manager, Classifier |
| AC-011 | Planner, Validator | AC-029 | Schedule Manager, Review Queue |
| AC-012 | Degree Audit | AC-030 | Schedule Manager |
| AC-013 | Schedule Manager, Notifier | AC-031 | Registration Sync (outage state), Schedule Manager, Web Client |
| AC-014 | Schedule Manager, Data Store (unique index) | AC-032 | Enrollment, Job Runner, Notifier |
| AC-015 | Review Queue, Classifier | AC-033 | Access Control |
| AC-016 | Schedule Manager | AC-034 | Access Control |
| AC-017 | Schedule Manager, Notifier | AC-035 | Schedule Manager, Data Store (unique job key) |
| AC-018 | Review Queue | | |

### Findings and what I did about them

| Finding | Action |
|---|---|
| **AC-034 had only a partial home.** Access Control decided "read or change" per student. But student S is allowed to change their own schedule and still must not approve it. | Changed Access Control to decide per action and made Approve and Return advisor-only. |
| **AC-026 conflicted with queued enrollment.** If an approval happens during an outage (AC-032) and a section is cancelled before the retry succeeds, the schedule moves to Returned but the queued job could still enroll it. | D9 and flow step 12 now check the status is still Approved before every attempt, and cancel the job otherwise. |
| **Dependency cycle.** Schedule Manager called Enrollment, and Enrollment called Schedule Manager. | Schedule Manager now only inserts the job row. API (not Schedule Manager) triggers the on-open refresh, which also removed a Sync → Revalidator → Schedule Manager → Sync loop. |
| **Registration Gateway is needed by no AC directly.** | Kept. It is required by NFR-010 and constraint C3, and every AC runs through it. |
| **Data Store is needed by no single AC.** | Kept as infrastructure. AC-014 and AC-035 rely on its constraints. |
| **Decisions without a spec reason:** D3, D6, D13 (method), D14 (time zone), and the daily rate in D5. | Already labeled **preference** in architecture.md. |
| **D11's 30-second poll traces only to NFR-009, an assumed number.** | Left as is, and noted that NFR-009's number is assumed. |
| **No criterion had no home** after the fixes above. | — |

The review also found nine places where the spec is ambiguous or incomplete. They are listed under "Spec issues" at the end of architecture.md instead of being resolved silently.
