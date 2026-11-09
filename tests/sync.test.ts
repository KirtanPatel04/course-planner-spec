// FR-010, FR-015, FR-018: keeping data current, revalidation, outages.
// test_plan.md: AC-019, AC-020, AC-026, AC-027, AC-031.

import { describe, expect, test } from 'vitest';
import { createHarness, eventsFor, expectStatus, flagCodes } from './helpers/harness';
import { T0 } from './helpers/world';

const cancel = (sectionId: string) => (d: { sections: { id: string; status: string }[] }) => {
  d.sections.find((s) => s.id === sectionId)!.status = 'CANCELLED';
};

describe('AC-019 Data refreshed when opening a schedule (FR-010)', () => {
  test('AT-019-1 [main] seats drop to 0 in MavLINK; opening the schedule flags SECTION_FULL', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    h.mavlink((d) => {
      const s = d.sections.find((x) => x.id === 'CSCI8000-001')!;
      s.seatsAvailable = 0;
      s.status = 'FULL';
    });

    const view = await h.schedule('stu-a', id); // no syncAll in between

    expect(flagCodes(view, 'CSCI8000-001')).toContain('SECTION_FULL');
  });

  test('AT-019-2 [control] before the change the section passes', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const view = await h.schedule('stu-a', id);

    expect(flagCodes(view, 'CSCI8000-001')).toEqual([]);
  });
});

describe('AC-020 Hourly refresh during registration (FR-010)', () => {
  const fullFetches = (h: ReturnType<typeof createHarness>) =>
    h.gateway.fetchCalls.filter((c) => c.delivered && !c.scope?.studentId).length;

  test('AT-020-1 [main][inside] 60 minutes after the last sync a new full sync runs', async () => {
    const h = createHarness();
    await h.sync();
    const before = fullFetches(h);

    await h.runJobs('2027-07-15T15:00:00.000Z');

    expect(fullFetches(h)).toBe(before + 1);
    const status = await h.as('stu-a').get('/sync-status');
    expectStatus(status, 200);
    expect(status.body.lastSuccessfulSyncAt).toBe('2027-07-15T15:00:00.000Z');
  });

  test('AT-020-2 [inside] on the last day of the window', async () => {
    const h = createHarness({ at: '2027-08-20T19:00:00.000Z' });
    await h.sync();
    const before = fullFetches(h);

    await h.runJobs('2027-08-20T20:00:00.000Z');

    expect(fullFetches(h)).toBe(before + 1);
  });
});

describe('AC-026 Approved schedule breaks before enrollment (FR-015)', () => {
  const approved = async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);
    return { h, a };
  };

  test('AT-026-1 [main] cancelled section returns the schedule, notifies both, never enrolls', async () => {
    const { h, a } = await approved();
    h.mavlink(cancel('CSCI8000-001'));

    await h.sync();

    const view = await h.schedule('stu-a', a);
    expect(view.status).toBe('RETURNED');
    expect(view.returnComment).toContain('CSCI8000-001');
    expect(view.history.at(-1)).toMatchObject({ from: 'APPROVED', to: 'RETURNED', actor: { kind: 'SYSTEM' } });
    expect(flagCodes(view, 'CSCI8000-001')).toContain('SECTION_CANCELLED');
    expect(eventsFor(await h.notifications('stu-a'), 'REVALIDATION_FAILURE', a)).toHaveLength(1);
    expect(eventsFor(await h.notifications('adv-1'), 'REVALIDATION_FAILURE', a)).toHaveLength(1);

    await h.runJobs(T0);
    expect(h.gateway.enrollCalls).toEqual([]);
  });

  test('AT-026-2 [control] a sync with no change keeps it Approved', async () => {
    const { h, a } = await approved();

    await h.sync();

    expect((await h.schedule('stu-a', a)).status).toBe('APPROVED');
    expect(eventsFor(await h.notifications('stu-a'), 'REVALIDATION_FAILURE')).toEqual([]);
    expect(eventsFor(await h.notifications('adv-1'), 'REVALIDATION_FAILURE')).toEqual([]);
  });
});

describe('AC-027 Enrolled schedule changes (FR-015)', () => {
  test('AT-027-1 [main] stays Enrolled; both notified naming the section', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);
    await h.runJobs(T0);
    h.mavlink(cancel('CSCI8000-001'));

    await h.sync();

    expect((await h.schedule('stu-a', a)).status).toBe('ENROLLED');
    for (const user of ['stu-a', 'adv-1']) {
      const notes = eventsFor(await h.notifications(user), 'REVALIDATION_FAILURE', a);
      expect(notes).toHaveLength(1);
      expect(notes[0].message).toContain('CSCI8000-001');
    }
  });
});

describe('AC-031 Registration system unavailable (FR-018)', () => {
  const outage = async () => {
    const h = createHarness({ at: '2027-07-15T19:00:00.000Z' }); // 2:00 PM CDT
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);
    h.gateway.setAvailable(false);
    h.clock.set('2027-07-15T19:30:00.000Z'); // 2:30 PM CDT
    return { h, a };
  };

  test('AT-031-1 [main] last sync shown, results Unverified, submit blocked; nothing sent', async () => {
    const { h, a } = await outage();

    const view = await h.schedule('stu-a', a);
    expect(view.lastSyncedAt).toBe('2027-07-15T19:00:00.000Z');
    expect(view.validationResults).toHaveLength(2);
    for (const r of view.validationResults) expect(r.verified).toBe(false);
    expect(view.canSubmit).toBe(false);

    const res = await h.as('stu-a').post(`/schedules/${a}/submit`);
    expectStatus(res, 503);
    expect(res.body.error).toBe('REGISTRATION_UNAVAILABLE');
    expect((await h.schedule('stu-a', a)).status).toBe('DRAFT');
    expect(await h.notifications('adv-1')).toEqual([]);
  });

  test('AT-031-2 [control] after MavLINK answers again, submit succeeds', async () => {
    const { h, a } = await outage();
    h.gateway.setAvailable(true);

    const res = await h.as('stu-a').post(`/schedules/${a}/submit`);

    expectStatus(res, 200);
    expect(res.body.status).toBe('SUBMITTED');
  });
});
