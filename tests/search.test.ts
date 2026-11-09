// FR-001: course search. test_plan.md: AC-001, AC-002, X-15.

import { describe, expect, test } from 'vitest';
import { createHarness, expectStatus } from './helpers/harness';

describe('AC-001 Search with combined filters (FR-001)', () => {
  test('AT-001-1 [main][inside][outside] Core, FA27, starting at or after 17:00', async () => {
    const h = createHarness();
    await h.sync();

    const res = await h.as('stu-a').get('/sections?term=FA27&requirement=CORE&startsAtOrAfter=17:00');

    expectStatus(res, 200);
    const ids = res.body.map((r: { sectionId: string }) => r.sectionId).sort();
    expect(ids).toEqual(['CSCI8000-001', 'CSCI8000-002', 'CSCI8100-001']); // 8000-002 at 17:00 in; 8100-002 at 16:59 out
    expect(res.body.find((r: { sectionId: string }) => r.sectionId === 'CSCI8000-001')).toMatchObject({
      courseId: 'CSCI 8000',
      meetings: [{ days: ['MON', 'WED'], start: '18:00', end: '19:15' }],
      seatsAvailable: 5,
    });
  });
});

describe('AC-002 Search with no results (FR-001)', () => {
  test('AT-002-1 [main] no Core section meets on Saturday; draft unchanged', async () => {
    const h = createHarness();
    await h.sync();
    const draft = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const res = await h.as('stu-a').get('/sections?term=FA27&requirement=CORE&day=SAT');

    expectStatus(res, 200);
    expect(res.body).toEqual([]);
    const after = await h.schedule('stu-a', draft);
    expect(after.sectionIds).toEqual(['CSCI8000-001']);
    expect(after.totalCreditHours).toBe(3);
  });

  test('AT-002-2 [control] Electives on Saturday returns CSCI8800-001', async () => {
    const h = createHarness();
    await h.sync();

    const res = await h.as('stu-a').get('/sections?term=FA27&requirement=ELEC&day=SAT');

    expectStatus(res, 200);
    expect(res.body.map((r: { sectionId: string }) => r.sectionId)).toEqual(['CSCI8800-001']);
  });
});

describe('X-15 Malformed search time (extra, probes FR-001)', () => {
  test('X-15 "5pm" is rejected', async () => {
    const h = createHarness();
    await h.sync();
    const res = await h.as('stu-a').get('/sections?term=FA27&startsAtOrAfter=5pm');
    expectStatus(res, 400);
    expect(res.body.error).toBe('INVALID_INPUT');
  });

  test('X-15 [control] "17:00" is accepted', async () => {
    const h = createHarness();
    await h.sync();
    expectStatus(await h.as('stu-a').get('/sections?term=FA27&startsAtOrAfter=17:00'), 200);
  });
});
