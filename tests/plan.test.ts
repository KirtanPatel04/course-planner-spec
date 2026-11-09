// FR-004, FR-005, FR-012: plan of study and degree progress.
// test_plan.md: AC-010, AC-011, AC-012, AC-021.

import { describe, expect, test } from 'vitest';
import type { PlanOfStudy } from '../src/domain/types';
import { coursesInTerm, createHarness, expectStatus, termOf } from './helpers/harness';
import { history, world } from './helpers/world';

const TERM_ORDER = ['FA27', 'SP28', 'FA28', 'SP29', 'FA29', 'SP30', 'FA30', 'SP31'];
const order = (term: string | undefined): number => (term ? TERM_ORDER.indexOf(term) : -1);
const ELECTIVES = ['CSCI 8200', 'CSCI 8300', 'CSCI 8400', 'CSCI 8600', 'CSCI 8700', 'CSCI 8800'];
const allPlanned = (plan: PlanOfStudy): string[] => plan.terms.flatMap((t) => t.courses.map((c) => c.courseId));

describe('AC-010 Suggested plan for an incoming graduate student (FR-004, FR-012)', () => {
  test('AT-010-1 [main] generated plan covers every requirement in a valid order', async () => {
    const h = createHarness();
    await h.sync();

    const res = await h.as('stu-a').get('/plan');

    expectStatus(res, 200);
    const plan: PlanOfStudy = res.body;
    const planned = allPlanned(plan);
    expect(planned).toEqual(expect.arrayContaining(['CSCI 8000', 'CSCI 8100', 'CSCI 8500', 'CSCI 8990']));
    expect(new Set(planned.filter((c) => ELECTIVES.includes(c))).size).toBe(4);

    const data = world();
    const courseById = new Map(data.courses.map((c) => [c.id, c]));
    const seasonOf = new Map(data.terms.map((t) => [t.code, t.season]));
    for (const t of plan.terms) {
      expect(order(t.term), `term ${t.term} is FA27 or later`).toBeGreaterThanOrEqual(0);
      let credits = 0;
      for (const c of t.courses) {
        const course = courseById.get(c.courseId)!;
        credits += course.creditHours;
        const season = seasonOf.get(t.term) ?? (t.term.startsWith('FA') ? 'FALL' : 'SPRING');
        expect(course.offeredIn, `${c.courseId} offered in ${t.term}`).toContain(season);
      }
      expect(credits, `credit hours in ${t.term}`).toBeLessThanOrEqual(12);
    }
    expect(order(termOf(plan, 'CSCI 8000'))).toBeLessThan(order(termOf(plan, 'CSCI 8500')));
    expect(order(termOf(plan, 'CSCI 8500'))).toBeLessThan(order(termOf(plan, 'CSCI 8990')));
    expect(order(termOf(plan, 'CSCI 8990'))).toBeGreaterThanOrEqual(order('SP29'));
  });
});

describe('AC-011 Moving a course breaks prerequisite order (FR-004)', () => {
  test('AT-011-1 [main] CSCI 8500 moved into the same term as CSCI 8000 is saved and flagged', async () => {
    const h = createHarness();
    await h.sync();
    await h.pinPlan('stu-a', { 'CSCI 8000': 'FA27', 'CSCI 8500': 'SP28' });

    const res = await h.as('stu-a').put('/plan/courses/CSCI%208500', { term: 'FA27' });

    expectStatus(res, 200);
    const moved = res.body.terms.find((t: { term: string }) => t.term === 'FA27')
      ?.courses.find((c: { courseId: string }) => c.courseId === 'CSCI 8500');
    expect(moved?.placement).toBe('MANUAL');
    const flag = moved?.flags.find((f: { code: string }) => f.code === 'MISSING_PREREQUISITE');
    expect(flag?.relatedCourseIds).toEqual(['CSCI 8000']);
    expect(termOf(await h.plan('stu-a'), 'CSCI 8500')).toBe('FA27');
  });

  test('AT-011-2 [control] CSCI 8500 moved after CSCI 8000 is not flagged', async () => {
    const h = createHarness();
    await h.sync();
    await h.pinPlan('stu-a', { 'CSCI 8000': 'FA27', 'CSCI 8500': 'SP28' });

    const res = await h.as('stu-a').put('/plan/courses/CSCI%208500', { term: 'SP29' });

    expectStatus(res, 200);
    const moved = res.body.terms.find((t: { term: string }) => t.term === 'SP29')
      ?.courses.find((c: { courseId: string }) => c.courseId === 'CSCI 8500');
    expect(moved).toBeDefined();
    expect(moved.flags.map((f: { code: string }) => f.code)).not.toContain('MISSING_PREREQUISITE');
  });
});

describe('AC-021 Plan regenerates after course history changes (FR-012)', () => {
  test('AT-021-1 [main] completed CSCI 8100 leaves the plan; manual CSCI 8200 stays', async () => {
    const h = createHarness({
      at: '2027-12-20T15:00:00.000Z',
      data: (d) => d.courseHistory.push(history('stu-a', 'CSCI 8000', 'FA27', 'COMPLETED')),
    });
    await h.sync();
    await h.pinPlan('stu-a', { 'CSCI 8100': 'SP28', 'CSCI 8200': 'FA28' });

    h.mavlink((d) => d.courseHistory.push(history('stu-a', 'CSCI 8100', 'FA27', 'COMPLETED')));
    await h.sync();

    const plan = await h.plan('stu-a');
    expect(termOf(plan, 'CSCI 8100')).toBeUndefined();
    const c8200 = plan.terms.find((t) => t.term === 'FA28')?.courses.find((c) => c.courseId === 'CSCI 8200');
    expect(c8200?.placement).toBe('MANUAL');
    const planned = allPlanned(plan);
    expect(planned).toEqual(expect.arrayContaining(['CSCI 8500', 'CSCI 8990']));
    expect(new Set(planned.filter((c) => ELECTIVES.includes(c))).size).toBe(4);
  });
});

describe('AC-012 Degree progress view (FR-005)', () => {
  const AT = '2028-09-15T15:00:00.000Z';
  const BASE = [
    history('stu-b', 'CSCI 8000', 'FA27', 'COMPLETED'),
    history('stu-b', 'CSCI 8100', 'FA27', 'COMPLETED'),
    history('stu-b', 'CSCI 8500', 'SP28', 'COMPLETED'),
    history('stu-b', 'CSCI 8200', 'SP28', 'COMPLETED'),
    history('stu-b', 'CSCI 8300', 'FA28', 'IN_PROGRESS'),
  ];
  const progress = async (entries: ReturnType<typeof history>[]) => {
    const h = createHarness({ at: AT, data: (d) => d.courseHistory.push(...entries) });
    await h.sync();
    const res = await h.as('stu-b').get('/degree-progress');
    expectStatus(res, 200);
    return (id: string) => res.body.requirements.find((r: { requirementId: string }) => r.requirementId === id);
  };

  test('AT-012-1 [main] Core complete; Electives 1 complete and 1 in progress; Project remaining', async () => {
    const req = await progress(BASE);
    expect(req('CORE')).toMatchObject({ status: 'COMPLETE', creditHoursCompleted: 9, creditHoursRequired: 9 });
    expect(req('ELEC')).toMatchObject({
      status: 'IN_PROGRESS',
      completedCourseIds: ['CSCI 8200'],
      inProgressCourseIds: ['CSCI 8300'],
      creditHoursCompleted: 3,
      creditHoursInProgress: 3,
      creditHoursRequired: 12,
    });
    expect(req('PROJ')).toMatchObject({ status: 'REMAINING', creditHoursCompleted: 0 });
  });

  test('AT-012-2 [inside] four Electives completed makes Electives COMPLETE', async () => {
    const req = await progress([
      ...BASE,
      history('stu-b', 'CSCI 8400', 'SP28', 'COMPLETED'),
      history('stu-b', 'CSCI 8600', 'SP28', 'COMPLETED'),
      history('stu-b', 'CSCI 8800', 'FA27', 'COMPLETED'),
    ]);
    expect(req('ELEC')).toMatchObject({ status: 'COMPLETE', creditHoursCompleted: 12 });
  });

  test('AT-012-3 [outside] Core with one course still in progress is not COMPLETE', async () => {
    const req = await progress([
      history('stu-b', 'CSCI 8000', 'FA27', 'COMPLETED'),
      history('stu-b', 'CSCI 8100', 'FA27', 'COMPLETED'),
      history('stu-b', 'CSCI 8500', 'FA28', 'IN_PROGRESS'),
    ]);
    expect(req('CORE')).toMatchObject({ status: 'IN_PROGRESS', creditHoursCompleted: 6, creditHoursInProgress: 3 });
  });
});
