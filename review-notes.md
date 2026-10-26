# AI Review Notes for spec.md

These are the findings from running the four review prompts against the first draft of spec.md (the Project 1 goal model and requirements converted to the new outline, before FR-016 to FR-020 existed). Each finding lists what changed in the final spec.

## 1. Find the gaps (questions I would have to guess)

**Search and schedule building**
- Can a student keep several drafts for one term? → Domain model: several Drafts allowed, only one Submitted or later per term.
- Does an in-progress course satisfy a prerequisite for next term? → Course History rule added; AC-006.
- What is the credit-hour limit? → Made a per-Program value instead of a hard-coded number; AC-007.
- What counts as "the moment I add"? → AC-004 says the flag appears without leaving or refreshing the page.

**Submission and review**
- Can a student edit a schedule after submitting? → Submitted schedules are locked; FR-017 adds withdraw.
- Can a student submit a schedule that has flags? → Yes, through an Exception Request (FR-016); it becomes Needs Review.
- Is a comment required to return a schedule? → Yes; AC-017.
- How is the dashboard ordered within each group? → Oldest submission first; AC-015.
- What makes a schedule "match the plan of study"? → Defined in Submission Classification.

**Plan of study**
- When the plan regenerates, what happens to courses the student moved by hand? → FR-012 keeps them unless they become invalid; AC-021.

**Sync and enrollment**
- What happens when MavLINK is down? → FR-018; AC-031, AC-032.
- Who is told about a partial enrollment failure? → FR-014 now notifies the student, and the advisor on any failure; AC-025.
- What happens to an Approved schedule that breaks before enrollment? → Moves to Returned; AC-026. Enrolled schedules only trigger notifications; AC-027.
- Which schedules does revalidation cover? → Submitted, Approved, and Enrolled for the current and next term.

## 2. Break the rules (careless or malicious requests)

| # | Request | Resolution in spec |
|---|---------|--------------------|
| 1 | Student opens another student's schedule by ID | FR-019, AC-033 |
| 2 | Student approves their own schedule | FR-019, AC-034 |
| 3 | Advisor approves a student not assigned to them | FR-019, AC-034 |
| 4 | Approve clicked twice or request replayed | FR-020, AC-035 |
| 5 | Student submits two schedules for the same term | Domain rule, AC-014 |
| 6 | Student edits a schedule while it is Submitted | Locked; withdraw first (FR-017) |
| 7 | Student withdraws after approval | Rejected, AC-030 |
| 8 | Return with an empty comment | Rejected, AC-017 |
| 9 | Exception request with an empty justification | Rejected, AC-028 |
| 10 | Submitting while validation data is stale | Blocked, FR-018, AC-031 |
| 11 | Adding a cancelled or full section | Allowed but flagged (SECTION_CANCELLED, SECTION_FULL) |
| 12 | Moving a plan course ahead of its prerequisite | Saved but flagged, AC-011 |
| 13 | Search with filters that match nothing | Message shown, AC-002 |
| 14 | Student with a blocking hold builds a schedule | Every section flagged, AC-008 |
| 15 | Approval while MavLINK is down | Queued and retried, AC-032 |

## 3. Business relevance (FR to goal)

Every FR lists its goal in the spec. Coverage by goal:

- BG-1: FR-001, FR-002, FR-003, FR-011, FR-015, FR-016, FR-017
- BG-2: FR-004, FR-005, FR-012
- BG-3: FR-007, FR-008, FR-009, FR-013
- BG-4: FR-006, FR-008, FR-016
- BG-5: FR-010, FR-014, FR-015, FR-018, FR-019, FR-020

No requirements without a goal, and no goals without requirements.

## 4. Acceptance criteria coverage (FR to AC)

| FR | Acceptance criteria |
|----|---------------------|
| FR-001 | AC-001, AC-002 |
| FR-002 | AC-003 |
| FR-003 | AC-004, AC-005 |
| FR-004 | AC-010, AC-011 |
| FR-005 | AC-012 |
| FR-006 | AC-013, AC-014 |
| FR-007 | AC-015 |
| FR-008 | AC-016, AC-017 |
| FR-009 | AC-018 |
| FR-010 | AC-019, AC-020 |
| FR-011 | AC-004 to AC-009 |
| FR-012 | AC-010, AC-021 |
| FR-013 | AC-015, AC-022, AC-023 |
| FR-014 | AC-024, AC-025 |
| FR-015 | AC-026, AC-027 |
| FR-016 | AC-028 |
| FR-017 | AC-029, AC-030 |
| FR-018 | AC-031, AC-032 |
| FR-019 | AC-033, AC-034 |
| FR-020 | AC-035 |

Criteria that tested something the spec never stated, and the fix:
- AC-018 highlighted courses not in the plan → added that sentence to FR-009.
- AC-012 counted an in-progress course as done → changed the scenario to report complete and in progress separately.
