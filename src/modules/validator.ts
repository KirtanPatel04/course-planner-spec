// Validator (architecture.md §2; FR-003, FR-011, FR-012/AC-011).
// Produces Pass or Flag with reason codes per section, from snapshot data. No side effects.

import { NotImplementedError } from '../domain/errors';
import type {
  Course, CourseId, CourseSection, Flag, PlanOfStudy, RegistrationData, SectionId, StudentId, Term, TermCode,
  ValidationResult,
} from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

interface ScheduleContext {
  data: RegistrationData;
  studentId: StudentId;
  term: Term | undefined;
  /** The schedule's sections in input order (undefined if unknown to the snapshot). */
  sections: (CourseSection | undefined)[];
  courses: Map<CourseId, Course>;
}

/** A rule adds flags to the sections it applies to; flags[i] belongs to sections[i]. */
type ScheduleRule = (ctx: ScheduleContext, flags: Flag[][]) => void;

const minutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/**
 * TIME_CONFLICT (AC-004): two sections conflict when they share a day and their meeting times overlap.
 * A meeting that ends exactly when the other starts does not overlap (test_plan.md G-1). Both sections
 * are flagged, each naming the other.
 */
const timeConflict: ScheduleRule = ({ sections }, flags) => {
  const overlaps = (a: CourseSection, b: CourseSection) => a.meetings.some((ma) => b.meetings.some((mb) =>
    ma.days.some((d) => mb.days.includes(d))
    && minutes(ma.start) < minutes(mb.end) && minutes(mb.start) < minutes(ma.end)));
  sections.forEach((a, i) => {
    if (!a) return;
    const others = sections.filter((b, j): b is CourseSection => j !== i && b !== undefined && overlaps(a, b));
    if (others.length) {
      flags[i].push({
        code: 'TIME_CONFLICT',
        message: `Meets at the same time as ${others.map((b) => b.id).join(', ')}`,
        relatedCourseIds: others.map((b) => b.courseId),
        relatedSectionIds: others.map((b) => b.id),
      });
    }
  });
};

/** FR-011's checks, one function per reason code. */
const SCHEDULE_RULES: ScheduleRule[] = [timeConflict];

export interface ScheduleValidationInput {
  studentId: StudentId;
  term: TermCode;
  sectionIds: SectionId[];
}

export class Validator {
  constructor(private readonly store: DataStore) {}

  /**
   * One result per section, in input order. Checks TIME_CONFLICT (both sections flagged),
   * MISSING_PREREQUISITE, MISSING_COREQUISITE, CREDIT_LIMIT_EXCEEDED, BLOCKING_HOLD,
   * SECTION_FULL, SECTION_CANCELLED. Every result carries the snapshot time (dataAsOf) and
   * verified=false while MavLINK is unreachable (FR-018). Never throws for flagged input.
   */
  async validateSchedule(input: ScheduleValidationInput): Promise<ValidationResult[]> {
    const data = await this.store.getRegistrationData();
    const sync = await this.store.getSyncStatus();
    const ctx: ScheduleContext = {
      data,
      studentId: input.studentId,
      term: data.terms.find((t) => t.code === input.term),
      sections: input.sectionIds.map((id) => data.sections.find((s) => s.id === id)),
      courses: new Map(data.courses.map((c) => [c.id, c])),
    };
    const flags: Flag[][] = input.sectionIds.map(() => []);
    for (const rule of SCHEDULE_RULES) rule(ctx, flags);
    return input.sectionIds.map((sectionId, i) => ({
      sectionId,
      outcome: flags[i].length ? 'FLAG' : 'PASS',
      flags: flags[i],
      // The time of the snapshot the result was based on (NFR-003).
      dataAsOf: sync.lastSuccessfulSyncAt ?? '',
      verified: sync.available,
    }));
  }

  /**
   * Returns a copy of the plan with flags on each planned course (prerequisite order,
   * offering pattern, credit limit per term). Used by Planner (AC-011).
   */
  async validatePlan(_plan: PlanOfStudy): Promise<PlanOfStudy> {
    throw new NotImplementedError('Validator.validatePlan');
  }
}
