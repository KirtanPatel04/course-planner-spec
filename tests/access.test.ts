// FR-019, NFR-001: who may see and change what.
// test_plan.md: AC-033, AC-034, X-01 to X-04, X-17, X-18, X-29.

import { describe, expect, test } from 'vitest';
import { createHarness, eventsFor, expectStatus } from './helpers/harness';
import { T0 } from './helpers/world';

describe('AC-033 Student cannot access another student\'s data (FR-019)', () => {
  const withB = async () => {
    const h = createHarness();
    await h.sync();
    const b = await h.createDraft('stu-b', 'FA27', ['CSCI8000-001'], 'Ben fall plan');
    return { h, b };
  };

  test('AT-033-1 [main] reading stu-b\'s schedule is denied and reveals nothing', async () => {
    const { h, b } = await withB();

    const res = await h.as('stu-a').get(`/schedules/${b}`);

    expectStatus(res, 404);
    expect(res.body.error).toBe('NOT_FOUND');
    const text = JSON.stringify(res.body);
    for (const secret of ['stu-b', 'Ben fall plan', 'CSCI8000-001']) expect(text).not.toContain(secret);
    const missing = await h.as('stu-a').get('/schedules/does-not-exist');
    expect(res.status).toBe(missing.status);
    expect(res.body).toEqual(missing.body);
  });

  test('AT-033-2 [main] changing stu-b\'s schedule is denied; nothing added', async () => {
    const { h, b } = await withB();

    const res = await h.as('stu-a').post(`/schedules/${b}/sections`, { sectionId: 'CSCI8100-001' });

    expectStatus(res, 404);
    expect((await h.schedule('stu-b', b)).sectionIds).toEqual(['CSCI8000-001']);
  });

  test('AT-033-3 [control] stu-b reads their own schedule', async () => {
    const { h, b } = await withB();
    expectStatus(await h.as('stu-b').get(`/schedules/${b}`), 200);
  });
});

describe('AC-034 Advisor limited to assigned students (FR-019)', () => {
  const submittedC = async () => {
    const h = createHarness();
    await h.sync();
    const c = await h.createDraft('stu-c', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-c', c);
    return { h, c };
  };

  const expectStillSubmittedAndNotEnrolled = async (h: ReturnType<typeof createHarness>, c: string) => {
    expect((await h.schedule('stu-c', c)).status).toBe('SUBMITTED');
    await h.runJobs(T0);
    expect(h.gateway.enrollCalls).toEqual([]);
  };

  test('AT-034-1 [main] an unassigned advisor cannot approve', async () => {
    const { h, c } = await submittedC();

    const res = await h.as('adv-1').post(`/schedules/${c}/approve`);

    expectStatus(res, 404);
    expect(res.body.error).toBe('NOT_FOUND');
    await expectStillSubmittedAndNotEnrolled(h, c);
  });

  test('AT-034-2 [main] the student cannot approve their own schedule', async () => {
    const { h, c } = await submittedC();

    const res = await h.as('stu-c').post(`/schedules/${c}/approve`);

    expectStatus(res, 403);
    expect(res.body.error).toBe('FORBIDDEN');
    await expectStillSubmittedAndNotEnrolled(h, c);
  });

  test('AT-034-3 [control] the assigned advisor approves', async () => {
    const { h, c } = await submittedC();

    const res = await h.as('adv-2').post(`/schedules/${c}/approve`);

    expectStatus(res, 200);
    expect(res.body.status).toBe('APPROVED');
  });
});

describe('Extra tests for identity and precedence', () => {
  test('X-01 no identity is rejected (probes FR-019, NFR-001)', async () => {
    const h = createHarness();
    await h.sync();
    const res = await h.as().get('/schedules');
    expectStatus(res, 401);
    expect(res.body.error).toBe('UNAUTHENTICATED');
  });

  test('X-02 an identity unknown to MavLINK is rejected (probes FR-019, D1)', async () => {
    const h = createHarness();
    await h.sync();
    const res = await h.as('nobody').get('/schedules');
    expectStatus(res, 401);
    expect(res.body.error).toBe('UNAUTHENTICATED');
  });

  test('X-03 a student cannot open the advisor dashboard (probes FR-007, FR-019)', async () => {
    const h = createHarness();
    await h.sync();
    const res = await h.as('stu-a').get('/advisor/dashboard');
    expectStatus(res, 403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  test('X-04 a student sees only their own notifications (probes FR-006, NFR-001)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);
    expect(eventsFor(await h.notifications('stu-a'), 'SCHEDULE_APPROVED', a)).toHaveLength(1);

    expect(await h.notifications('stu-b')).toEqual([]);
  });

  test('X-17 wrong advisor and wrong state: visibility wins, 404 not 409 (probes FR-019, NFR-001)', async () => {
    const h = createHarness();
    await h.sync();
    const c = await h.createDraft('stu-c', 'FA27', ['CSCI8000-001']);

    const res = await h.as('adv-1').post(`/schedules/${c}/approve`);

    expectStatus(res, 404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect((await h.schedule('stu-c', c)).status).toBe('DRAFT');
  });

  test('X-18 student approving own Draft: permission wins, 403 not 409 (probes FR-019)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const res = await h.as('stu-a').post(`/schedules/${a}/approve`);

    expectStatus(res, 403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect((await h.schedule('stu-a', a)).status).toBe('DRAFT');
  });

  test('X-29 a student cannot use the advisor review view (probes FR-019, NFR-001)', async () => {
    const h = createHarness();
    await h.sync();
    const b = await h.createDraft('stu-b', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-b', b);

    const res = await h.as('stu-a').get(`/advisor/schedules/${b}/review`);

    expectStatus(res, 403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});
