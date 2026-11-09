// FR-014, FR-018, FR-020, NFR-002: enrollment, outage retries, enrolling at most once.
// test_plan.md: AC-024, AC-025, AC-032, AC-035, X-10.

import { describe, expect, test } from 'vitest';
import { coursesInTerm, createHarness, eventsFor, expectStatus, plusMinutes } from './helpers/harness';
import { T0 } from './helpers/world';

const approvedSchedule = async (sectionIds: string[], before?: (h: ReturnType<typeof createHarness>) => void) => {
  const h = createHarness();
  await h.sync();
  const a = await h.createDraft('stu-a', 'FA27', sectionIds);
  await h.submit('stu-a', a);
  before?.(h);
  await h.approve('adv-1', a);
  return { h, a };
};

describe('AC-024 Successful enrollment (FR-014)', () => {
  test('AT-024-1 [main] every section enrolls; plan and notifications updated', async () => {
    const { h, a } = await approvedSchedule(['CSCI8000-001', 'CSCI8100-001']);

    await h.runJobs(T0);

    expect(h.enrollCallsFor('CSCI8000-001')).toBe(1);
    expect(h.enrollCallsFor('CSCI8100-001')).toBe(1);
    const view = await h.schedule('stu-a', a);
    expect(view.status).toBe('ENROLLED');
    expect(view.enrollmentRecords.map((r) => [r.sectionId, r.outcome]).sort()).toEqual([
      ['CSCI8000-001', 'ENROLLED'],
      ['CSCI8100-001', 'ENROLLED'],
    ]);
    expect(coursesInTerm(await h.plan('stu-a'), 'FA27').sort()).toEqual(['CSCI 8000', 'CSCI 8100']);
    expect(eventsFor(await h.notifications('stu-a'), 'ENROLLMENT_RESULT', a)).toHaveLength(1);
    expect(eventsFor(await h.notifications('adv-1'), 'ENROLLMENT_RESULT', a)).toEqual([]);
  });
});

describe('AC-025 Partial enrollment failure (FR-014)', () => {
  test('AT-025-1 [main] one section rejected as full', async () => {
    const { h, a } = await approvedSchedule(['CSCI8000-001', 'CSCI8100-001', 'CSCI8800-001'], (x) =>
      x.gateway.setEnrollmentOutcome('CSCI8100-001', { ok: false, reason: 'full' }));

    await h.runJobs(T0);

    const view = await h.schedule('stu-a', a);
    expect(view.status).toBe('PARTIALLY_ENROLLED');
    const record = (id: string) => view.enrollmentRecords.find((r) => r.sectionId === id);
    expect(record('CSCI8100-001')).toMatchObject({ outcome: 'FAILED', reason: 'full' });
    expect(record('CSCI8000-001')).toMatchObject({ outcome: 'ENROLLED' });
    expect(record('CSCI8800-001')).toMatchObject({ outcome: 'ENROLLED' });
    for (const user of ['stu-a', 'adv-1']) {
      const notes = eventsFor(await h.notifications(user), 'ENROLLMENT_RESULT', a);
      expect(notes).toHaveLength(1);
      expect(notes[0].message).toContain('CSCI8100-001');
    }
  });
});

describe('AC-032 Enrollment queued during an outage (FR-018)', () => {
  const approvedDuringOutage = async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    h.gateway.setAvailable(false);
    const approved = await h.as('adv-1').post(`/schedules/${a}/approve`);
    expectStatus(approved, 200);
    expect(approved.body.status).toBe('APPROVED');
    return { h, a };
  };

  test('AT-032-1 [main][inside] retried every 15 minutes; both notified at 24 hours; then retries stop', async () => {
    const { h, a } = await approvedDuringOutage();

    for (let k = 0; k < 96; k++) { // T0 … T0 + 23h45m
      const before = h.gateway.enrollCalls.length;
      await h.runJobs(plusMinutes(T0, k * 15));
      expect(h.gateway.enrollCalls.length, `attempt at +${k * 15} min`).toBeGreaterThan(before);
    }
    expect(h.gateway.enrollCalls.filter((c) => c.delivered)).toEqual([]);
    expect(eventsFor(await h.notifications('stu-a'), 'ENROLLMENT_RESULT', a)).toEqual([]);
    expect(eventsFor(await h.notifications('adv-1'), 'ENROLLMENT_RESULT', a)).toEqual([]);

    await h.runJobs(plusMinutes(T0, 24 * 60));
    expect(eventsFor(await h.notifications('stu-a'), 'ENROLLMENT_RESULT', a)).toHaveLength(1);
    expect(eventsFor(await h.notifications('adv-1'), 'ENROLLMENT_RESULT', a)).toHaveLength(1);

    const afterGiveUp = h.gateway.enrollCalls.length;
    await h.runJobs(plusMinutes(T0, 24 * 60 + 15));
    expect(h.gateway.enrollCalls.length).toBe(afterGiveUp);
  });

  test('AT-032-2 [outside] no new attempt 14 minutes after the first', async () => {
    const { h } = await approvedDuringOutage();
    await h.runJobs(T0);
    const afterFirst = h.gateway.enrollCalls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await h.runJobs(plusMinutes(T0, 14));

    expect(h.gateway.enrollCalls.length).toBe(afterFirst);
  });

  test('AT-032-3 [control] MavLINK back after an hour: enrolled, no failure notice', async () => {
    const { h, a } = await approvedDuringOutage();
    await h.runJobs(T0);
    h.gateway.setAvailable(true);

    await h.runJobs(plusMinutes(T0, 60));

    expect(h.enrollCallsFor('CSCI8000-001')).toBe(1);
    expect((await h.schedule('stu-a', a)).status).toBe('ENROLLED');
    expect(eventsFor(await h.notifications('adv-1'), 'ENROLLMENT_RESULT', a)).toEqual([]);
  });
});

describe('AC-035 Duplicate approval does not double-enroll (FR-020)', () => {
  const submitted = async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);
    await h.submit('stu-a', a);
    return { h, a };
  };

  test('AT-035-1 [main] two approvals at once enroll each section exactly once', async () => {
    const { h, a } = await submitted();

    const [r1, r2] = await Promise.all([
      h.as('adv-1').post(`/schedules/${a}/approve`),
      h.as('adv-1').post(`/schedules/${a}/approve`),
    ]);

    expectStatus(r1, 200);
    expectStatus(r2, 200);
    expect(r1.body.status).toBe('APPROVED');
    expect(r2.body.status).toBe('APPROVED');
    const view = await h.schedule('stu-a', a);
    expect(view.history.filter((c) => c.from === 'SUBMITTED' && c.to === 'APPROVED')).toHaveLength(1);

    await h.runJobs(T0);
    await h.runJobs(plusMinutes(T0, 15));
    expect(h.enrollCallsFor('CSCI8000-001')).toBe(1);
    expect(h.enrollCallsFor('CSCI8100-001')).toBe(1);
  });

  test('AT-035-2 [main] approving again after enrollment changes nothing', async () => {
    const { h, a } = await submitted();
    await h.approve('adv-1', a);
    await h.runJobs(T0);
    const calls = h.gateway.enrollCalls.length;

    const res = await h.as('adv-1').post(`/schedules/${a}/approve`);

    expectStatus(res, 200);
    expect(res.body.status).toBe('ENROLLED');
    await h.runJobs(plusMinutes(T0, 15));
    expect(h.gateway.enrollCalls.length).toBe(calls);
  });
});

describe('X-10 Withdraw and approve at the same time (extra, probes NFR-002, FR-017)', () => {
  test('X-10 exactly one wins and the state matches the winner', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);

    const [withdraw, approve] = await Promise.all([
      h.as('stu-a').post(`/schedules/${a}/withdraw`),
      h.as('adv-1').post(`/schedules/${a}/approve`),
    ]);

    expect([withdraw.status, approve.status].sort()).toEqual([200, 409]);
    const status = (await h.schedule('stu-a', a)).status;
    await h.runJobs(T0);
    if (approve.status === 200) {
      expect(status).toBe('APPROVED');
      expect(withdraw.body.error).toBe('INVALID_STATE');
    } else {
      expect(status).toBe('DRAFT');
      expect(approve.body.error).toBe('INVALID_STATE');
      expect(h.gateway.enrollCalls).toEqual([]);
    }
  });
});
