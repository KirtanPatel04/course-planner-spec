// FR-002, FR-003, FR-011: building and validating a draft schedule.
// test_plan.md: AC-003 to AC-009, X-12, X-13, X-14, X-16, X-21, X-23 to X-27.

import { describe, expect, test } from 'vitest';
import type { ScheduleView } from '../src/domain/types';
import { createHarness, expectStatus, flagCodes, resultFor } from './helpers/harness';
import { history, T0 } from './helpers/world';

const SP28_WINDOW = '2027-11-15T15:00:00.000Z';

describe('AC-003 Add a section to the calendar (FR-002)', () => {
  test('AT-003-1 [main] adding CSCI8000-001 to an empty draft', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27');

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8000-001' });

    expectStatus(res, 200);
    expect(res.body.sectionIds).toEqual(['CSCI8000-001']);
    expect(res.body.totalCreditHours).toBe(3);
  });

  test('AT-003-2 [main] credit hours go from 3 to 6', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8100-001']);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8000-001' });

    expectStatus(res, 200);
    expect(res.body.totalCreditHours).toBe(6);
  });
});

describe('AC-004 Time conflict flagged on add (FR-003, FR-011)', () => {
  const addTo8100 = async (sectionId: string): Promise<ScheduleView> => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8100-001']);
    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId });
    expectStatus(res, 200);
    return res.body;
  };

  test('AT-004-1 [main] Tue 17:30–18:45 vs Tue 18:00–20:40: both flagged', async () => {
    const view = await addTo8100('CSCI8200-001');
    expect(view.validationResults).toHaveLength(2);
    const a = resultFor(view, 'CSCI8100-001').flags.find((f) => f.code === 'TIME_CONFLICT');
    const b = resultFor(view, 'CSCI8200-001').flags.find((f) => f.code === 'TIME_CONFLICT');
    expect(a?.relatedSectionIds).toContain('CSCI8200-001');
    expect(b?.relatedSectionIds).toContain('CSCI8100-001');
  });

  test('AT-004-2 [inside] one minute of overlap (18:44) flags both', async () => {
    const view = await addTo8100('CSCI8300-001');
    expect(flagCodes(view, 'CSCI8100-001')).toContain('TIME_CONFLICT');
    expect(flagCodes(view, 'CSCI8300-001')).toContain('TIME_CONFLICT');
  });

  test('AT-004-3 [outside][control] one minute apart (18:46) flags neither', async () => {
    const view = await addTo8100('CSCI8300-002');
    expect(flagCodes(view, 'CSCI8100-001')).not.toContain('TIME_CONFLICT');
    expect(flagCodes(view, 'CSCI8300-002')).not.toContain('TIME_CONFLICT');
  });
});

describe('AC-005 Missing prerequisite flagged on add (FR-003, FR-011)', () => {
  test('AT-005-1 [main] CSCI 8500 without CSCI 8000', async () => {
    const h = createHarness({ at: SP28_WINDOW });
    await h.sync();
    const id = await h.createDraft('stu-a', 'SP28');

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8500-001' });

    expectStatus(res, 200);
    const flag = resultFor(res.body, 'CSCI8500-001').flags.find((f) => f.code === 'MISSING_PREREQUISITE');
    expect(flag?.relatedCourseIds).toEqual(['CSCI 8000']);
  });
});

describe('AC-006 In-progress prerequisite counts (FR-011)', () => {
  const add8500WithHistory = async (term: string, status: 'COMPLETED' | 'IN_PROGRESS') => {
    const h = createHarness({ at: SP28_WINDOW, data: (d) => d.courseHistory.push(history('stu-a', 'CSCI 8000', term, status)) });
    await h.sync();
    const id = await h.createDraft('stu-a', 'SP28');
    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8500-001' });
    expectStatus(res, 200);
    return flagCodes(res.body, 'CSCI8500-001');
  };

  test('AT-006-1 [main][inside] CSCI 8000 in progress in FA27 (ends before SP28 starts)', async () => {
    expect(await add8500WithHistory('FA27', 'IN_PROGRESS')).not.toContain('MISSING_PREREQUISITE');
  });

  test('AT-006-2 [outside] CSCI 8000 in progress in SP28 itself', async () => {
    expect(await add8500WithHistory('SP28', 'IN_PROGRESS')).toContain('MISSING_PREREQUISITE');
  });

  test('AT-006-3 [control] CSCI 8000 completed in FA27', async () => {
    expect(await add8500WithHistory('FA27', 'COMPLETED')).not.toContain('MISSING_PREREQUISITE');
  });
});

describe('AC-007 Credit-hour limit exceeded (FR-011)', () => {
  const TWELVE = ['CSCI8000-001', 'CSCI8100-001', 'CSCI8400-001', 'CSCI8800-001'];

  test('AT-007-1 [main] 12 + 3 = 15 flags the new section', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', TWELVE);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8300-002' });

    expectStatus(res, 200);
    expect(res.body.totalCreditHours).toBe(15);
    expect(flagCodes(res.body, 'CSCI8300-002')).toContain('CREDIT_LIMIT_EXCEEDED');
  });

  test('AT-007-2 [inside][control] 9 + 3 = 12 passes', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001', 'CSCI8800-001']);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8300-002' });

    expectStatus(res, 200);
    expect(res.body.totalCreditHours).toBe(12);
    for (const r of res.body.validationResults) expect(r.outcome).toBe('PASS');
  });

  test('AT-007-3 [outside] 12 + 1 = 13 flags the new section', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', TWELVE);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8410-001' });

    expectStatus(res, 200);
    expect(res.body.totalCreditHours).toBe(13);
    expect(flagCodes(res.body, 'CSCI8410-001')).toContain('CREDIT_LIMIT_EXCEEDED');
  });
});

describe('AC-008 Blocking hold (FR-011)', () => {
  test('AT-008-1 [main] Bursar hold flags every section with its type', async () => {
    const h = createHarness({ data: (d) => d.holds.push({ studentId: 'stu-a', type: 'Bursar', blocking: true }) });
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);

    const view = await h.schedule('stu-a', id);

    for (const sectionId of ['CSCI8000-001', 'CSCI8100-001']) {
      const flag = resultFor(view, sectionId).flags.find((f) => f.code === 'BLOCKING_HOLD');
      expect(flag?.holdType).toBe('Bursar');
    }
  });

  test('AT-008-2 [control] a non-blocking hold flags nothing', async () => {
    const h = createHarness({ data: (d) => d.holds.push({ studentId: 'stu-a', type: 'Advising Reminder', blocking: false }) });
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);

    const view = await h.schedule('stu-a', id);

    for (const r of view.validationResults) expect(r.outcome).toBe('PASS');
  });
});

describe('AC-009 Clean schedule passes (FR-011)', () => {
  test('AT-009-1 [main] three non-conflicting open sections, 9 credits', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001', 'CSCI8800-001']);

    const view = await h.schedule('stu-a', id);

    expect(view.validationResults).toHaveLength(3);
    for (const r of view.validationResults) {
      expect(r.outcome).toBe('PASS');
      expect(r.flags).toEqual([]);
      expect(r.verified).toBe(true);
    }
  });
});

describe('Extra tests for building and validating drafts', () => {
  test('X-12 unknown section is rejected; draft unchanged (probes FR-002)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'NOPE-999' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('INVALID_INPUT');
    expect((await h.schedule('stu-a', id)).sectionIds).toEqual(['CSCI8000-001']);
  });

  test('X-13 SP28 section in an FA27 draft is rejected; draft unchanged (probes FR-002, Draft Schedule)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27');

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8500-001' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('SECTION_TERM_MISMATCH');
    expect((await h.schedule('stu-a', id)).sectionIds).toEqual([]);
  });

  test('X-13 [control] an FA27 section in the same draft is accepted', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27');
    expectStatus(await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8000-001' }), 200);
  });

  test('X-14 draft for unknown term FA99 is rejected; nothing created (probes FR-002)', async () => {
    const h = createHarness();
    await h.sync();
    const before = await h.as('stu-a').get('/schedules');
    expectStatus(before, 200);

    const res = await h.as('stu-a').post('/schedules', { term: 'FA99' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('INVALID_INPUT');
    const after = await h.as('stu-a').get('/schedules');
    expect(after.body).toEqual(before.body);
  });

  test('X-14 [control] draft for FA27 is created', async () => {
    const h = createHarness();
    await h.sync();
    const res = await h.as('stu-a').post('/schedules', { term: 'FA27' });
    expectStatus(res, 201);
    expect(res.body).toMatchObject({ status: 'DRAFT', term: 'FA27', sectionIds: [] });
  });

  test('X-16 adding the same section twice is rejected; still one entry (probes FR-002)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8000-001' });

    expectStatus(res, 400);
    expect(res.body.error).toBe('INVALID_INPUT');
    const view = await h.schedule('stu-a', id);
    expect(view.sectionIds).toEqual(['CSCI8000-001']);
    expect(view.totalCreditHours).toBe(3);
  });

  test('X-21 listing filters by term (probes FR-002)', async () => {
    const h = createHarness();
    await h.sync();
    await h.createDraft('stu-a', 'FA27');
    const sp28 = await h.createDraft('stu-a', 'SP28');

    const res = await h.as('stu-a').get('/schedules?term=SP28');

    expectStatus(res, 200);
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([sp28]);
  });

  test('X-23 every result records the time of the data it used (probes NFR-003, Validation Result)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);

    const view = await h.schedule('stu-a', id);

    expect(view.validationResults).toHaveLength(2);
    for (const r of view.validationResults) {
      expect(r.dataAsOf).toBe(T0);
      expect(r.verified).toBe(true);
    }
  });

  test('X-24 lab without its co-requisite is flagged (probes FR-011)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27');

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8410-001' });

    expectStatus(res, 200);
    const flag = resultFor(res.body, 'CSCI8410-001').flags.find((f) => f.code === 'MISSING_COREQUISITE');
    expect(flag?.relatedCourseIds).toEqual(['CSCI 8400']);
  });

  test('X-25 [control] lab with its co-requisite in the same draft is not flagged', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27', ['CSCI8400-001']);

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8410-001' });

    expectStatus(res, 200);
    expect(flagCodes(res.body, 'CSCI8410-001')).not.toContain('MISSING_COREQUISITE');
  });

  test('X-26 a cancelled section is added and flagged SECTION_CANCELLED (probes FR-011)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27');

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8700-001' });

    expectStatus(res, 200);
    expect(res.body.sectionIds).toEqual(['CSCI8700-001']);
    expect(flagCodes(res.body, 'CSCI8700-001')).toContain('SECTION_CANCELLED');
  });

  test('X-27 a full section is added and flagged SECTION_FULL (probes FR-011)', async () => {
    const h = createHarness();
    await h.sync();
    const id = await h.createDraft('stu-a', 'FA27');

    const res = await h.as('stu-a').post(`/schedules/${id}/sections`, { sectionId: 'CSCI8600-001' });

    expectStatus(res, 200);
    expect(res.body.sectionIds).toEqual(['CSCI8600-001']);
    expect(flagCodes(res.body, 'CSCI8600-001')).toContain('SECTION_FULL');
  });
});
