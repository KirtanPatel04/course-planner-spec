// Validator (architecture.md §2; FR-003, FR-011, FR-012/AC-011).
// Produces Pass or Flag with reason codes per section, from snapshot data. No side effects.

import { NotImplementedError } from '../domain/errors';
import type { PlanOfStudy, SectionId, StudentId, TermCode, ValidationResult } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

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
  async validateSchedule(_input: ScheduleValidationInput): Promise<ValidationResult[]> {
    throw new NotImplementedError('Validator.validateSchedule');
  }

  /**
   * Returns a copy of the plan with flags on each planned course (prerequisite order,
   * offering pattern, credit limit per term). Used by Planner (AC-011).
   */
  async validatePlan(_plan: PlanOfStudy): Promise<PlanOfStudy> {
    throw new NotImplementedError('Validator.validatePlan');
  }
}
