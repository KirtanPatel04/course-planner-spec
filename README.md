# CSCI 8700 Projects: Specification, Architecture, Contracts, Tests, and Implementation

**Project:** UNO Course Registration and Planning Application (Course Planner)
**Author:** Kirtan Patel
**Course:** CSCI 8700, University of Nebraska Omaha, Fall 2026

This repository holds the AI-friendly specification for my semester project (converted from my Project 1 goal model and functional requirements), the architecture, the test-first contracts, test plan and acceptance tests, and the server implementation built from them slice by slice.

## Files

- [`spec.md`](spec.md): the specification (Description, Goals, Non-goals, Domain Model, Functional Requirements, Nonfunctional Requirements, Acceptance Criteria)
- [`architecture.md`](architecture.md): the architecture: modules, request flows, design decisions, constraints, out of scope, and spec issues
- [`contracts.md`](contracts.md): every public module function and REST route, with success results, errors, spec rules, and injected dependencies
- [`test_plan.md`](test_plan.md): the acceptance criteria refined into concrete BDD tests, with inside/outside and control cases, extra cases, and spec gaps
- [`plan.md`](plan.md): the implementation plan: 25 slices in dependency order, each with its criteria, tests, and skeleton functions, plus the design questions and how they were answered
- [`review-notes.md`](review-notes.md): Project 2 AI review findings for the spec
- [`architecture-notes.md`](architecture-notes.md): Project 3 process notes: how the NFRs were chosen, design questions and answers, and the architecture review

## Status

All 25 slices in `plan.md` are implemented, each merged through its own pull request (#1 to #25). The suite passes: **122 of 122 tests** across AC-001 to AC-035 and the 28 extra tests. The only stubs left are the real MavLINK gateway, which cannot be built without University access (architecture.md C3).

## Code

TypeScript, Node.js, Express, PostgreSQL (architecture.md C1).

```
src/
  server.ts                 entry point: seeds the simulator, syncs, starts the API and the job runner
  container.ts              wires modules per architecture.md §2
  api/app.ts, api/routes.ts REST API (contracts.md §2)
  domain/types.ts, errors.ts
  shared/clock.ts           injected clock
  modules/                  one file per architecture module
    registrationGateway/    real (MavLINK) and simulated gateways, and the simulator's demo data
    dataStore/              DataStore interface and the PostgreSQL implementation
tests/
  helpers/world.ts          the test data from test_plan.md
  helpers/harness.ts        builds the app with a fake clock, fake mail, and the simulator
  setup/postgres.ts         creates the test database and removes per-test schemas
  *.test.ts                 one file per requirement area, tests named by test_plan.md ID
scripts/demo.sh             walks through the main scenarios against a running server
```

## Running

Requires Node.js 20 or later and a local PostgreSQL server (tested with PostgreSQL 17).

```bash
npm install
npm test                     # the Vitest suite; creates course_planner_test if missing
npm run typecheck            # type-check src/ and tests/
```

Tests use `TEST_DATABASE_URL` (default `postgres://localhost:5432/course_planner_test`). Each test gets its own PostgreSQL schema, so tests never see each other's data even when files run in parallel. The schemas are dropped after the run.

### The demo server

```bash
createdb course_planner      # once; drop and recreate it for a clean demo
npm run dev                  # http://localhost:3000 (PORT, DATABASE_URL to change)
scripts/demo.sh              # in a second terminal; needs curl and jq
```

On start, the server seeds the simulated MavLINK with the test-plan catalog and people (students `stu-a` to `stu-d`, advisors `adv-1` and `adv-2`), syncs it into PostgreSQL, and starts the job runner every 15 seconds. Emails are written to the server log, since no university mail service is available (C2). The demo script goes through:

- search
- building a draft that shows a time conflict
- the privacy checks
- the generated plan
- submit, the advisor dashboard, approval
- automatic enrollment
- degree progress

Run it against a fresh `course_planner` database (`dropdb course_planner && createdb course_planner`). A second run for the same student and term is correctly rejected with 409, because one active submission per term is allowed (AC-014).

A single request:

```bash
curl -s 'http://localhost:3000/sections?term=FA27&requirement=CORE&startsAtOrAfter=17:00' -H 'X-User-Id: stu-a'
```

The `X-User-Id` header stands in for the UNO single sign-on session (architecture.md D1, C5).
