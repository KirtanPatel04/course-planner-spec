// FR-007, FR-009, FR-013: advisor dashboard and side-by-side review.
// test_plan.md: AC-015, AC-018, X-19, X-20.

import { describe, expect, test } from 'vitest';
import { createHarness, expectStatus } from './helpers/harness';
import { history } from './helpers/world';

describe('AC-015 Dashboard ordering (FR-007, FR-013)', () => {
  test('AT-015-1 [main] Needs Review oldest first, then Routine', async () => {
    const h = createHarness({ at: '2027-07-11T15:00:00.000Z' });
    await h.sync();

    // Sunday: stu-b, Routine (both courses pinned into FA27)
    await h.pinPlan('stu-b', { 'CSCI 8000': 'FA27', 'CSCI 8100': 'FA27' });
    const r = await h.createDraft('stu-b', 'FA27', ['CSCI8000-001', 'CSCI8100-001']);
    await h.submit('stu-b', r);

    // Monday and Tuesday: stu-a and stu-d, Needs Review (full section with an Exception Request)
    const needsReview = async (student: string, at: string) => {
      h.clock.set(at);
      const id = await h.createDraft(student, 'FA27', ['CSCI8600-001']);
      expectStatus(await h.as(student).post(`/schedules/${id}/exceptions`, {
        sectionId: 'CSCI8600-001', reasonCode: 'SECTION_FULL', justification: 'Instructor gave permission',
      }), 201);
      await h.submit(student, id);
      return id;
    };
    const n1 = await needsReview('stu-a', '2027-07-12T15:00:00.000Z');
    const n2 = await needsReview('stu-d', '2027-07-13T15:00:00.000Z');

    const res = await h.as('adv-1').get('/advisor/dashboard');

    expectStatus(res, 200);
    expect(res.body.map((e: { scheduleId: string }) => e.scheduleId)).toEqual([n1, n2, r]);
    for (const entry of res.body.slice(0, 2)) {
      expect(entry.classification.label).toBe('NEEDS_REVIEW');
      expect(entry.classification.reasons.map((x: { code: string }) => x.code)).toContain('EXCEPTION_REQUESTED');
    }
    expect(res.body[2].classification).toMatchObject({ label: 'ROUTINE', reasons: [] });
  });

  test('X-19 the dashboard lists only assigned students (extra, probes FR-007, FR-019)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    const c = await h.createDraft('stu-c', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    await h.submit('stu-c', c);

    const res = await h.as('adv-1').get('/advisor/dashboard');

    expectStatus(res, 200);
    expect(res.body.map((e: { scheduleId: string }) => e.scheduleId)).toEqual([a]);
  });

  test('X-20 an approved schedule leaves the dashboard (extra, probes FR-007)', async () => {
    const h = createHarness();
    await h.sync();
    const a = await h.createDraft('stu-a', 'FA27', ['CSCI8000-001']);
    await h.submit('stu-a', a);
    await h.approve('adv-1', a);

    const res = await h.as('adv-1').get('/advisor/dashboard');

    expectStatus(res, 200);
    expect(res.body).toEqual([]);
  });
});

describe('AC-018 Side-by-side review (FR-009)', () => {
  test('AT-018-1 [main] schedule, plan for the term, and history together; CSCI 8100 highlighted', async () => {
    const h = createHarness({
      at: '2027-11-15T15:00:00.000Z',
      data: (d) => d.courseHistory.push(history('stu-b', 'CSCI 8000', 'FA27', 'IN_PROGRESS')),
    });
    await h.sync();
    await h.pinPlan('stu-b', { 'CSCI 8500': 'SP28', 'CSCI 8100': 'FA28' });
    const s = await h.createDraft('stu-b', 'SP28', ['CSCI8500-001', 'CSCI8100-101']);
    await h.submit('stu-b', s);

    const res = await h.as('adv-1').get(`/advisor/schedules/${s}/review`);

    expectStatus(res, 200);
    expect(res.body.schedule.sectionIds).toEqual(['CSCI8500-001', 'CSCI8100-101']);
    const planned = res.body.planForTerm.map((c: { courseId: string }) => c.courseId);
    expect(planned).toContain('CSCI 8500');
    expect(planned).not.toContain('CSCI 8100');
    expect(res.body.courseHistory).toEqual([history('stu-b', 'CSCI 8000', 'FA27', 'IN_PROGRESS')]);
    expect(res.body.highlightedCourseIds).toEqual(['CSCI 8100']);
  });
});
