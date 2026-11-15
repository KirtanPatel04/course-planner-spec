// Planner (architecture.md §2; FR-004, FR-012, FR-014 plan update, D13).

import { DomainError, NotImplementedError } from '../domain/errors';
import type {
  Course, CourseId, PlannedCourse, PlannedTerm, PlanOfStudy, RegistrationData, StudentId, Term, TermCode,
} from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';
import type { DegreeAudit } from './degreeAudit';
import type { Validator } from './validator';

export class Planner {
  constructor(
    private readonly degreeAudit: DegreeAudit,
    private readonly validator: Validator,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Returns the stored plan, generating and saving one first if the student has none (FR-004).
   * A generated plan covers every remaining requirement, respects offering patterns and
   * prerequisite order, and stays within the Program credit limit per term (AC-010).
   */
  async getPlan(studentId: StudentId): Promise<PlanOfStudy> {
    const stored = await this.store.getPlan(studentId);
    if (stored) return stored;
    return this.save(await this.generate(studentId, []));
  }

  /**
   * Moves a planned course to another future term and marks it MANUAL. The move is always saved,
   * even when it breaks prerequisite order; the course is flagged instead (AC-011).
   * @throws DomainError INVALID_INPUT if the course is not in the plan or the term is unknown.
   */
  async moveCourse(studentId: StudentId, courseId: CourseId, toTerm: TermCode): Promise<PlanOfStudy> {
    const plan = await this.getPlan(studentId);
    const from = plan.terms.find((t) => t.courses.some((c) => c.courseId === courseId));
    if (!from) throw new DomainError('INVALID_INPUT', 'The course is not in your plan');
    const data = await this.store.getRegistrationData();
    if (typeof toTerm !== 'string' || !this.futureTerms(data).some((t) => t.code === toTerm)) {
      throw new DomainError('INVALID_INPUT', 'Unknown term, or the term has already started');
    }

    const moved: PlannedCourse = { courseId, placement: 'MANUAL', flags: [] };
    const terms = plan.terms.map((t) => ({ ...t, courses: t.courses.filter((c) => c.courseId !== courseId) }));
    let target = terms.find((t) => t.term === toTerm);
    if (!target) {
      target = { term: toTerm, courses: [] };
      terms.push(target);
      const startOf = (code: TermCode) => data.terms.find((t) => t.code === code)?.startDate ?? '';
      terms.sort((a, b) => startOf(a.term).localeCompare(startOf(b.term)));
    }
    target.courses.push(moved);
    return this.save({ ...plan, terms, updatedAt: this.clock.now().toISOString() });
  }

  /** Flags the plan (AC-011) and saves it. The plan is always saved, flagged or not. */
  private async save(plan: PlanOfStudy): Promise<PlanOfStudy> {
    const validated = await this.validator.validatePlan(plan);
    await this.store.savePlan(validated);
    return validated;
  }

  /**
   * Regenerates the not-yet-started terms after Course History changes, keeping MANUAL courses
   * unless they became invalid (FR-012, AC-021). Called by Registration Sync.
   */
  async regenerate(_studentId: StudentId): Promise<PlanOfStudy> {
    throw new NotImplementedError('Planner.regenerate');
  }

  /** Makes the plan for `term` match the enrolled courses (FR-014, AC-024). Called by Enrollment. */
  async applyEnrollment(studentId: StudentId, term: TermCode, enrolledCourseIds: CourseId[]): Promise<PlanOfStudy> {
    const plan = await this.getPlan(studentId);
    const enrolled = new Set(enrolledCourseIds);
    // The enrolled courses leave every other term; the term holds exactly what was enrolled.
    const terms = plan.terms.map((t) => ({ ...t, courses: t.courses.filter((c) => !enrolled.has(c.courseId)) }));
    const courses: PlannedCourse[] = enrolledCourseIds.map((courseId) => ({ courseId, placement: 'MANUAL', flags: [] }));
    const target = terms.find((t) => t.term === term);
    if (target) target.courses = courses;
    else terms.unshift({ term, courses });
    return this.save({ ...plan, terms, updatedAt: this.clock.now().toISOString() });
  }

  /** Terms in the snapshot that have not started yet, in date order (plan.md Design question 7). */
  private futureTerms(data: RegistrationData): Term[] {
    const today = this.clock.now().toISOString().slice(0, 10);
    return data.terms.filter((t) => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  /**
   * D13: places every course still needed for the Program in prerequisite order (a topological sort
   * that takes the longest prerequisite chains first), each in the earliest future term that matches
   * its offering pattern, follows its prerequisites, and stays within the credit limit.
   * `fixed` holds the courses that must stay where they are (MANUAL placements, FR-012); they count
   * toward requirements and credit limits. A course that fits nowhere is left out (architecture.md
   * Spec issue 8).
   */
  private async generate(studentId: StudentId, fixed: PlannedTerm[]): Promise<PlanOfStudy> {
    const data = await this.store.getRegistrationData();
    const progress = await this.degreeAudit.getDegreeProgress(studentId);
    const program = data.programs.find((p) => p.id === progress.programId)!;
    const courses = new Map(data.courses.map((c) => [c.id, c]));
    const history = data.courseHistory.filter((e) => e.studentId === studentId);
    const taken = new Set(history.map((e) => e.courseId));
    const terms = this.futureTerms(data);

    // Where each course sits: index into `terms` for fixed courses.
    const position = new Map<CourseId, number>();
    const credits = terms.map(() => 0);
    const placed: PlannedCourse[][] = terms.map(() => []);
    for (const f of fixed) {
      const i = terms.findIndex((t) => t.code === f.term);
      if (i < 0) continue;
      for (const c of f.courses) {
        position.set(c.courseId, i);
        credits[i] += courses.get(c.courseId)?.creditHours ?? 0;
        placed[i].push(c);
      }
    }

    // Courses still needed, requirement by requirement, in catalog order.
    const needed: Course[] = [];
    for (const r of progress.requirements) {
      if (r.status === 'COMPLETE') continue;
      const req = program.requirements.find((x) => x.id === r.requirementId)!;
      let remaining = r.creditHoursRequired - r.creditHoursCompleted - r.creditHoursInProgress
        - req.courses.filter((c) => position.has(c)).reduce((sum, c) => sum + (courses.get(c)?.creditHours ?? 0), 0);
      for (const id of req.courses) {
        if (remaining <= 0) break;
        const course = courses.get(id);
        if (!course || taken.has(id) || position.has(id) || needed.includes(course)) continue;
        needed.push(course);
        remaining -= course.creditHours;
      }
    }

    // Longest chain of needed courses that depend on each course; longer chains go first.
    const neededIds = new Set(needed.map((c) => c.id));
    const height = new Map<CourseId, number>();
    const heightOf = (id: CourseId): number => {
      if (!height.has(id)) {
        const dependents = needed.filter((d) => d.prerequisites.includes(id));
        height.set(id, dependents.length ? 1 + Math.max(...dependents.map((d) => heightOf(d.id))) : 0);
      }
      return height.get(id)!;
    };

    const takenBefore = (p: CourseId, term: Term) => history.some((e) => e.courseId === p && (e.status === 'COMPLETED'
      || (data.terms.find((t) => t.code === e.term)?.endDate ?? '9999-12-31') < term.startDate));

    const pending = [...needed];
    while (pending.length) {
      // Ready: no prerequisite is still waiting to be placed. Ties keep requirement order.
      const ready = pending.filter((c) => c.prerequisites.every((p) => !pending.some((x) => x.id === p)));
      const next = (ready.length ? ready : pending).reduce((best, c) => (heightOf(c.id) > heightOf(best.id) ? c : best));
      pending.splice(pending.indexOf(next), 1);

      const prerequisiteMet = (p: CourseId, idx: number) =>
        position.has(p) ? position.get(p)! < idx
          : taken.has(p) ? takenBefore(p, terms[idx])
            : !neededIds.has(p); // a needed prerequisite that fit nowhere keeps this course out too
      const i = terms.findIndex((t, idx) =>
        next.offeredIn.includes(t.season)
        && credits[idx] + next.creditHours <= program.maxCreditHoursPerTerm
        && next.prerequisites.every((p) => prerequisiteMet(p, idx)));
      if (i < 0) continue;
      position.set(next.id, i);
      credits[i] += next.creditHours;
      placed[i].push({ courseId: next.id, placement: 'GENERATED', flags: [] });
    }

    return {
      studentId,
      programId: program.id,
      terms: terms.map((t, i) => ({ term: t.code, courses: placed[i] })),
      updatedAt: this.clock.now().toISOString(),
    };
  }
}
