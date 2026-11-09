# CSCI 8700 Projects: Specification, Architecture, Contracts, and Tests

**Project:** UNO Course Registration and Planning Application (Course Planner)
**Author:** Kirtan Patel
**Course:** CSCI 8700, University of Nebraska Omaha, Fall 2026

This repository holds the AI-friendly software specification for my semester project, converted from my Project 1 goal model and functional requirements, the architecture, and (test-first development) the contracts, test plan, server skeleton, and failing acceptance tests.

## Files

- [`spec.md`](spec.md): the specification (Description, Goals, Non-goals, Domain Model, Functional Requirements, Nonfunctional Requirements, Acceptance Criteria)
- [`architecture.md`](architecture.md): the architecture (Project 3): modules, request flows, design decisions, constraints, out of scope, and spec issues
- [`contracts.md`](contracts.md): every public module function and REST route, with success results, errors, spec rules, and injected dependencies (test-first, Task 1)
- [`test_plan.md`](test_plan.md): the acceptance criteria refined into concrete BDD tests, with inside/outside and control cases, extra cases, and spec gaps (test-first, Task 2)
- [`review-notes.md`](review-notes.md): Project 2 AI review findings for the spec
- [`architecture-notes.md`](architecture-notes.md): Project 3 process notes: how the NFRs were chosen, design questions and answers, and the architecture review

## Code

TypeScript, Node.js, Express (architecture.md, C1). Every module function throws `NotImplementedError`, and every route answers HTTP 501.

```
src/
  server.ts                 entry point
  container.ts              wires modules per architecture.md §2
  api/app.ts, api/routes.ts REST API (contracts.md §2)
  domain/types.ts, errors.ts
  shared/clock.ts           injected clock
  modules/                  one file per architecture module
    registrationGateway/    real (MavLINK) and simulated gateways
    dataStore/              DataStore interface and PostgreSQL skeleton
tests/
  helpers/world.ts          the test data from test_plan.md
  helpers/harness.ts        builds the app with a fake clock, fake mail, and the simulator
  *.test.ts                 one file per requirement area, tests named by test_plan.md ID
```

## Running

Requires Node.js 20 or later.

```bash
npm install
npm run dev                  # start the server on http://localhost:3000 (PORT to change)
# or
npm run build && npm start   # compile to dist/ and run

npm test                     # run the Vitest suite
npm run typecheck            # type-check src/ and tests/
```

Try a route (every route answers 501 until it is implemented):

```bash
curl -i -X POST http://localhost:3000/schedules -H 'X-User-Id: stu-a' -H 'Content-Type: application/json' -d '{"term":"FA27"}'
```

The `X-User-Id` header stands in for the UNO single sign-on session (architecture.md D1, C5).
