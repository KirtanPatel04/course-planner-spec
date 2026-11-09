// FR-006, FR-008, FR-013, FR-016, FR-017: submit, decide, classify, exceptions, withdraw.
// test_plan.md: AC-013, AC-014, AC-016, AC-017, AC-022, AC-023, AC-028, AC-029, AC-030,
// X-05 to X-09, X-11, X-22, X-28.

import { describe, expect, test } from 'vitest';
import type { ValidationResult } from '../src/domain/types';
import { attempt, createHarness, eventsFor, expectStatus } from './helpers/harness';
import { T0 } from './helpers/world';

describe('AC-013 Submit and get notified of approval (FR-006)', () => {
  test('AT-013-1 [main] submit notifies the assigned advisor; approval notifies the student', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);

    const submitted = await h.as('stu-a').post(`/schedules/${a}/submit`);
    expectStatus(submitted, 200);
    expect(submitted.body.status).toBe('SUBMITTED');
    expect(eventsFor(await h.notifications('adv-1'), 'SCHEDULE_SUBMITTED', a)).toHaveLength(1);
    expect(await h.notifications('adv-2')).toEqual([]);

    const approved = await h.as('adv-1').post(`/schedules/${a}/approve`);
    expectStatus(approved, 200);
    expect(approved.body.status).toBe('APPROVED');
    expect(eventsFor(await h.notifications('stu-a'), 'SCHEDULE_APPROVED', a)).toHaveLength(1);
  });

  test('AT-013-2 [main] a Submitted schedule is locked from editing; nothing added', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);
    await h.submit('stu-a', a);

    const res = await h.as('stu-a').post(`/schedules/${a}/sections`, { sectionId: 'CSCI8800-001' });

    expectStatus(res, 409);
    expect(res.body.error).toBe('INVALID_STATE');
    expect((await h.schedule('stu-a', a)).sectionIds).toEqual(['CSCI8000-001', 'CSCI8100-001']);
  });

  test('AT-013-3 [control] the same add on a Draft is accepted', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);

    const res = await h.as('stu-a').post(`/schedules/${a}/sections`, { sectionId: 'CSCI8800-001' });

    expectStatus(res, 200);
    expect(res.body.sectionIds).toHaveLength(3);
  });
});

describe('AC-014 Only one active submission per term (FR-006)', () => {
  const setup = async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    const b = await h.createDraft('stu-a', 'FA27', ['CSCI8100-001']);
    await h.submit('stu-a', a);
    return { h, a, b };
  };

  test('AT-014-1 [main] second FA27 submission is rejected; nothing changes', async () => {
    const { h, a, b } = await setup();

    const res = await h.as('stu-a').post(`/schedules/${b}/submit`);

    expectStatus(res, 409);
    expect(res.body.error).toBe('ACTIVE_SUBMISSION_EXISTS');
    expect(res.body.message).toMatch(/withdraw/i);
    expect((await h.schedule('stu-a', b)).status).toBe('DRAFT');
    expect((await h.schedule('stu-a', a)).status).toBe('SUBMITTED');
    expect(eventsFor(await h.notifications('adv-1'), 'SCHEDULE_SUBMITTED')).toHaveLength(1);
  });

  test('AT-014-2 [control] after withdrawing the first, the second submits', async () => {
    const { h, a, b } = await setup();
    expectStatus(await h.as('stu-a').post(`/schedules/${a}/withdraw`), 200);

    const res = await h.as('stu-a').post(`/schedules/${b}/submit`);

    expectStatus(res, 200);
    expect(res.body.status).toBe('SUBMITTED');
  });

  test('AT-014-3 [control] a submission for another term is accepted', async () => {
    const { h } = await setup();
    const c = await h.createDraft('stu-a', 'SP28', ['CSCI8100-101']);

    const res = await h.as('stu-a').post(`/schedules/${c}/submit`);

    expectStatus(res, 200);
  });

  test('AT-014-4 [main] an Approved schedule also blocks a second submission', async () => {
    const { h, a, b } = await setup();
    await h.approve('adv-1', a);

    const res = await h.as('stu-a').post(`/schedules/${b}/submit`);

    expectStatus(res, 409);
    expect(res.body.error).toBe('ACTIVE_SUBMISSION_EXISTS');
    expect((await h.schedule('stu-a', b)).status).toBe('DRAFT');
  });
});

describe('AC-016 Approve in one step (FR-008)', () => {
  test('AT-016-1 [main] approve with no body', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);

    const res = await h.as('adv-1').post(`/schedules/${a}/approve`);

    expectStatus(res, 200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.history.at(-1)).toMatchObject({ from: 'SUBMITTED', to: 'APPROVED', actor: { kind: 'ADVISOR', id: 'adv-1' } });
  });
});

describe('AC-017 Return requires a comment (FR-008)', () => {
  const submitted = async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    return { h, a };
  };

  test('AT-017-1 [main] return with no comment is rejected; nothing changes', async () => {
    const { h, a } = await submitted();

    const res = await h.as('adv-1').post(`/schedules/${a}/return`, {});

    expectStatus(res, 400);
    expect(res.body.error).toBe('COMMENT_REQUIRED');
    expect((await h.schedule('stu-a', a)).status).toBe('SUBMITTED');
    expect(eventsFor(await h.notifications('stu-a'), 'SCHEDULE_RETURNED')).toEqual([]);
  });

  test('AT-017-2 [outside] an empty comment is rejected', async () => {
    const { h, a } = await submitted();

    const res = await h.as('adv-1').post(`/schedules/${a}/return`, { comment: '' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('COMMENT_REQUIRED');
    expect((await h.schedule('stu-a', a)).status).toBe('SUBMITTED');
  });

  test('AT-017-3 [control] return with a comment notifies the student with it', async () => {
    const { h, a } = await submitted();
    const comment = 'Take CSCI 8100 in spring instead';

    const res = await h.as('adv-1').post(`/schedules/${a}/return`, { comment });

    expectStatus(res, 200);
    expect(res.body).toMatchObject({ status: 'RETURNED', returnComment: comment });
    const returned = eventsFor(await h.notifications('stu-a'), 'SCHEDULE_RETURNED', a);
    expect(returned).toHaveLength(1);
    expect(returned[0].message).toContain(comment);
  });

  test('X-28 a non-text comment is rejected (extra, probes FR-008)', async () => {
    const { h, a } = await submitted();

    const res = await h.as('adv-1').post(`/schedules/${a}/return`, { comment: 42 });

    expectStatus(res, 400);
    expect(res.body.error).toBe('COMMENT_REQUIRED');
    expect((await h.schedule('stu-a', a)).status).toBe('SUBMITTED');
  });
});

describe('AC-022 Routine classification (FR-013)', () => {
  test('AT-022-1 [main] passing sections, no exceptions, all in plan → ROUTINE', async () => {
    const h = createHarness();
    await h.sync();
    await h.pinPlan('stu-b', { 'CSCI 8000': 'FA27', 'CSCI 8100': 'FA27' });
    const s = await h.createDraft('stu-b', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);

    const view = await h.submit('stu-b', s);

    expect(view.classification).toMatchObject({ label: 'ROUTINE', reasons: [] });
  });
});

describe('AC-023 Needs Review classification (FR-013) — Classifier.classify', () => {
  const pass = (sectionId: string): ValidationResult =>
    ({ sectionId, outcome: 'PASS', flags: [], dataAsOf: T0, verified: true });

  const classify = async (change: (input: {
    studentId: string; term: string; sectionIds: string[]; validationResults: ValidationResult[];
    exceptionRequests: { id: string; scheduleId: string; sectionId: string; reasonCode: 'SECTION_FULL'; justification: string; createdAt: string }[];
  }) => void, extraPins: Record<string, string> = {}) => {
    const h = createHarness();
    await h.sync();
    await h.pinPlan('stu-b', { 'CSCI 8000': 'FA27', 'CSCI 8100': 'FA27', ...extraPins });
    const input = {
      studentId: 'stu-b', term: 'FA27', sectionIds: ['CSCI8000-001', 'CSCI8100-001'],
      validationResults: [pass('CSCI8000-001'), pass('CSCI8100-001')],
      exceptionRequests: [] as { id: string; scheduleId: string; sectionId: string; reasonCode: 'SECTION_FULL'; justification: string; createdAt: string }[],
    };
    change(input);
    return attempt(() => h.services.classifier.classify(input));
  };

  test('AT-023-0 [control] base input is ROUTINE', async () => {
    expect(await classify(() => {})).toMatchObject({ label: 'ROUTINE', reasons: [] });
  });

  test('AT-023-1 [main] a flagged section → NEEDS_REVIEW (SECTION_FLAGGED)', async () => {
    const result = await classify((i) => {
      i.validationResults[1] = {
        ...i.validationResults[1], outcome: 'FLAG',
        flags: [{ code: 'SECTION_FULL', message: 'full', relatedCourseIds: [], relatedSectionIds: [] }],
      };
    });
    expect(result).toMatchObject({ label: 'NEEDS_REVIEW' });
    expect((result as { reasons: { code: string }[] }).reasons.map((r) => r.code)).toEqual(['SECTION_FLAGGED']);
  });

  test('AT-023-2 [main] an Exception Request → NEEDS_REVIEW (EXCEPTION_REQUESTED)', async () => {
    const result = await classify((i) => {
      i.exceptionRequests.push({ id: 'ex-1', scheduleId: 's-1', sectionId: 'CSCI8000-001', reasonCode: 'SECTION_FULL', justification: 'Instructor gave permission', createdAt: T0 });
    });
    expect(result).toMatchObject({ label: 'NEEDS_REVIEW' });
    expect((result as { reasons: { code: string }[] }).reasons.map((r) => r.code)).toEqual(['EXCEPTION_REQUESTED']);
  });

  test('AT-023-3 [main] a course not in the plan for the term → NEEDS_REVIEW (COURSE_NOT_IN_PLAN)', async () => {
    const result = await classify((i) => {
      i.sectionIds = ['CSCI8000-001', 'CSCI8200-001'];
      i.validationResults = [pass('CSCI8000-001'), pass('CSCI8200-001')];
    }, { 'CSCI 8200': 'SP28' });
    expect(result).toMatchObject({ label: 'NEEDS_REVIEW', reasons: [{ code: 'COURSE_NOT_IN_PLAN', courseId: 'CSCI 8200' }] });
  });
});

describe('AC-028 Exception request needs a justification (FR-016)', () => {
  const flaggedDraft = async () => {
    const h = createHarness({ at: '2027-11-15T15:00:00.000Z' });
    await h.sync();
    const s = await h.createDraft('stu-a', 'SP28', ['CSCI8500-001']); // MISSING_PREREQUISITE
    return { h, s };
  };

  test('AT-028-1 [main] missing justification is rejected; nothing attached', async () => {
    const { h, s } = await flaggedDraft();

    const res = await h.as('stu-a').post(`/schedules/${s}/exceptions`, { sectionId: 'CSCI8500-001', reasonCode: 'MISSING_PREREQUISITE' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('JUSTIFICATION_REQUIRED');
    expect((await h.schedule('stu-a', s)).exceptionRequests).toEqual([]);
  });

  test('AT-028-2 [outside] empty justification is rejected; nothing attached', async () => {
    const { h, s } = await flaggedDraft();

    const res = await h.as('stu-a').post(`/schedules/${s}/exceptions`, { sectionId: 'CSCI8500-001', reasonCode: 'MISSING_PREREQUISITE', justification: '' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('JUSTIFICATION_REQUIRED');
    expect((await h.schedule('stu-a', s)).exceptionRequests).toEqual([]);
  });

  test('AT-028-3 [control] with a justification it is attached and the submission is Needs Review', async () => {
    const { h, s } = await flaggedDraft();
    const justification = 'Completed equivalent course at Creighton';

    const res = await h.as('stu-a').post(`/schedules/${s}/exceptions`, { sectionId: 'CSCI8500-001', reasonCode: 'MISSING_PREREQUISITE', justification });

    expectStatus(res, 201);
    expect(res.body.exceptionRequests).toHaveLength(1);
    expect(res.body.exceptionRequests[0]).toMatchObject({ sectionId: 'CSCI8500-001', reasonCode: 'MISSING_PREREQUISITE', justification });
    const view = await h.submit('stu-a', s);
    expect(view.classification?.label).toBe('NEEDS_REVIEW');
    expect(view.classification?.reasons.map((r) => r.code)).toContain('EXCEPTION_REQUESTED');
  });
});

describe('AC-029 Withdraw before a decision (FR-017)', () => {
  test('AT-029-1 [main] withdraw returns to Draft, editable, off the dashboard', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);

    const res = await h.as('stu-a').post(`/schedules/${a}/withdraw`);

    expectStatus(res, 200);
    expect(res.body.status).toBe('DRAFT');
    expectStatus(await h.as('stu-a').post(`/schedules/${a}/sections`, { sectionId: 'CSCI8800-001' }), 200);
    const dashboard = await h.as('adv-1').get('/advisor/dashboard');
    expectStatus(dashboard, 200);
    expect(dashboard.body.map((e: { scheduleId: string }) => e.scheduleId)).not.toContain(a);
  });
});

describe('AC-030 Cannot withdraw after a decision (FR-017)', () => {
  test('AT-030-1 [main] withdrawing an Approved schedule is rejected; still Approved', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);

    const res = await h.as('stu-a').post(`/schedules/${a}/withdraw`);

    expectStatus(res, 409);
    expect(res.body.error).toBe('INVALID_STATE');
    const view = await h.schedule('stu-a', a);
    expect(view.status).toBe('APPROVED');
    expect(view.history.some((c) => c.from === 'APPROVED' && c.to === 'DRAFT')).toBe(false);
  });
});

describe('Extra tests for status transitions', () => {
  test('X-05 approving a Draft is rejected; no enrollment (probes Draft Schedule transitions)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const res = await h.as('adv-1').post(`/schedules/${a}/approve`);

    expectStatus(res, 409);
    expect(res.body.error).toBe('INVALID_STATE');
    expect((await h.schedule('stu-a', a)).status).toBe('DRAFT');
    await h.runJobs(T0);
    expect(h.gateway.enrollCalls).toEqual([]);
  });

  test('X-06 withdrawing a Draft is rejected (probes Draft Schedule transitions)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const res = await h.as('stu-a').post(`/schedules/${a}/withdraw`);

    expectStatus(res, 409);
    expect(res.body.error).toBe('INVALID_STATE');
    expect((await h.schedule('stu-a', a)).status).toBe('DRAFT');
  });

  test('X-07 returning an Approved schedule is rejected (probes Draft Schedule transitions)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);

    const res = await h.as('adv-1').post(`/schedules/${a}/return`, { comment: 'Changed my mind' });

    expectStatus(res, 409);
    expect(res.body.error).toBe('INVALID_STATE');
    expect((await h.schedule('stu-a', a)).status).toBe('APPROVED');
  });

  test('X-08 a Returned schedule can be edited and resubmitted (probes Draft Schedule transitions)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    expectStatus(await h.as('adv-1').post(`/schedules/${a}/return`, { comment: 'Add an elective' }), 200);

    expectStatus(await h.as('stu-a').post(`/schedules/${a}/sections`, { sectionId: 'CSCI8800-001' }), 200);
    const view = await h.submit('stu-a', a);

    expect(view.status).toBe('SUBMITTED');
    expect(view.sectionIds).toEqual(['CSCI8000-001', 'CSCI8800-001']);
  });

  test('X-09 an Enrolled schedule blocks another FA27 submission (probes Draft Schedule "or later")', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    const b = await h.createDraft('stu-a', 'FA27', ['CSCI8100-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);
    await h.runJobs(T0);
    expect((await h.schedule('stu-a', a)).status).toBe('ENROLLED');

    const res = await h.as('stu-a').post(`/schedules/${b}/submit`);

    expectStatus(res, 409);
    expect(res.body.error).toBe('ACTIVE_SUBMISSION_EXISTS');
    expect((await h.schedule('stu-a', b)).status).toBe('DRAFT');
  });

  test('X-11 two drafts submitted at the same time: exactly one wins (probes NFR-002, AC-014)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    const b = await h.createDraft('stu-a', 'FA27', ['CSCI8100-001']);

    const [ra, rb] = await Promise.all([
      h.as('stu-a').post(`/schedules/${a}/submit`),
      h.as('stu-a').post(`/schedules/${b}/submit`),
    ]);

    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.error).toBe('ACTIVE_SUBMISSION_EXISTS');
    const statuses = [(await h.schedule('stu-a', a)).status, (await h.schedule('stu-a', b)).status].sort();
    expect(statuses).toEqual(['DRAFT', 'SUBMITTED']);
  });

  test('X-22 history records every transition with who and when (probes NFR-007)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);

    const view = await h.schedule('stu-a', a);

    expect(view.history.map((c) => [c.from, c.to, c.actor])).toEqual([
      [null, 'DRAFT', { kind: 'STUDENT', id: 'stu-a' }],
      ['DRAFT', 'SUBMITTED', { kind: 'STUDENT', id: 'stu-a' }],
      ['SUBMITTED', 'APPROVED', { kind: 'ADVISOR', id: 'adv-1' }],
    ]);
    for (const c of view.history) expect(c.at).toBe(T0);
  });
});
