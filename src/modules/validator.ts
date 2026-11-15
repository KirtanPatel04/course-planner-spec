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

/**
 * Course History rule: a course counts as taken before `target` if it is completed, or in progress
 * in a term that ends before `target` begins.
 */
const takenBefore = (data: RegistrationData, studentId: StudentId, courseId: CourseId, target: Term | undefined): boolean =>
  data.courseHistory.some((e) => e.studentId === studentId && e.courseId === courseId && (
    e.status === 'COMPLETED'
    || (target !== undefined && (data.terms.find((t) => t.code === e.term)?.endDate ?? '9999-12-31') < target.startDate)));

/** MISSING_PREREQUISITE (AC-005, AC-006): names every prerequisite not taken before the schedule's term. */
const missingPrerequisite: ScheduleRule = ({ data, studentId, term, sections, courses }, flags) => {
  sections.forEach((s, i) => {
    const missing = (s ? courses.get(s.courseId)?.prerequisites ?? [] : [])
      .filter((p) => !takenBefore(data, studentId, p, term));
    if (missing.length) {
      flags[i].push({ code: 'MISSING_PREREQUISITE', message: `Requires ${missing.join(', ')}`, relatedCourseIds: missing, relatedSectionIds: [] });
    }
  });
};

/**
 * CREDIT_LIMIT_EXCEEDED (AC-007): adds credit hours in schedule order and flags every section that
 * takes the total above the Program's per-term limit. Exactly at the limit passes (plan.md Design question 5).
 */
const creditLimit: ScheduleRule = ({ data, studentId, sections, courses }, flags) => {
  const programId = data.students.find((s) => s.id === studentId)?.programId;
  const limit = data.programs.find((p) => p.id === programId)?.maxCreditHoursPerTerm;
  if (limit === undefined) return;
  let total = 0;
  sections.forEach((s, i) => {
    total += s ? courses.get(s.courseId)?.creditHours ?? 0 : 0;
    if (total > limit) {
      flags[i].push({ code: 'CREDIT_LIMIT_EXCEEDED', message: `Brings the schedule to ${total} credit hours; the limit is ${limit}`, relatedCourseIds: [], relatedSectionIds: [] });
    }
  });
};

/**
 * MISSING_COREQUISITE (X-24): a co-requisite is satisfied by a section of that course in the same
 * schedule, or by the course being taken before the term, as for prerequisites (test_plan.md G-3).
 */
const missingCorequisite: ScheduleRule = ({ data, studentId, term, sections, courses }, flags) => {
  const inSchedule = new Set(sections.map((s) => s?.courseId));
  sections.forEach((s, i) => {
    const missing = (s ? courses.get(s.courseId)?.corequisites ?? [] : [])
      .filter((c) => !inSchedule.has(c) && !takenBefore(data, studentId, c, term));
    if (missing.length) {
      flags[i].push({ code: 'MISSING_COREQUISITE', message: `Must be taken with ${missing.join(', ')}`, relatedCourseIds: missing, relatedSectionIds: [] });
    }
  });
};

/** BLOCKING_HOLD (AC-008): every section is flagged once per blocking hold, with the hold type MavLINK reports. */
const blockingHold: ScheduleRule = ({ data, studentId, sections }, flags) => {
  const holds = data.holds.filter((h) => h.studentId === studentId && h.blocking);
  sections.forEach((_s, i) => {
    for (const hold of holds) {
      flags[i].push({ code: 'BLOCKING_HOLD', message: `${hold.type} hold blocks registration`, relatedCourseIds: [], relatedSectionIds: [], holdType: hold.type });
    }
  });
};

/**
 * SECTION_FULL and SECTION_CANCELLED (X-26, X-27, AC-019): taken from the status MavLINK reports,
 * the system of record (plan.md Design question 6).
 */
const sectionStatus: ScheduleRule = ({ sections }, flags) => {
  sections.forEach((s, i) => {
    if (s?.status === 'FULL') {
      flags[i].push({ code: 'SECTION_FULL', message: `${s.id} is full`, relatedCourseIds: [], relatedSectionIds: [] });
    } else if (s?.status === 'CANCELLED') {
      flags[i].push({ code: 'SECTION_CANCELLED', message: `${s.id} was cancelled`, relatedCourseIds: [], relatedSectionIds: [] });
    }
  });
};

/** FR-011's checks, one function per reason code. */
const SCHEDULE_RULES: ScheduleRule[] = [timeConflict, missingPrerequisite, missingCorequisite, creditLimit, blockingHold, sectionStatus];

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
