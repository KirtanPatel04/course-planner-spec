// Classifier (architecture.md §2; FR-013, D12): labels a submitted schedule Routine or Needs Review.

import type {
  ClassificationReason, ExceptionRequest, SectionId, StudentId, SubmissionClassification, TermCode, ValidationResult,
} from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

export interface ClassificationInput {
  studentId: StudentId;
  term: TermCode;
  sectionIds: SectionId[];
  validationResults: ValidationResult[];
  exceptionRequests: ExceptionRequest[];
}

export class Classifier {
  constructor(private readonly store: DataStore) {}

  /**
   * ROUTINE when every section passes, there are no Exception Requests, and every course is in the
   * student's Plan of Study for that Term (read from the store); otherwise NEEDS_REVIEW with one
   * reason per failed condition (SECTION_FLAGGED, EXCEPTION_REQUESTED, COURSE_NOT_IN_PLAN).
   */
  async classify(input: ClassificationInput): Promise<SubmissionClassification> {
    const data = await this.store.getRegistrationData();
    const plan = await this.store.getPlan(input.studentId);
    // A student without a stored plan has no course planned for the term (plan.md Design question 9).
    const planned = new Set(plan?.terms.find((t) => t.term === input.term)?.courses.map((c) => c.courseId) ?? []);
    const courseOf = new Map(data.sections.map((s) => [s.id, s.courseId]));

    const reasons: ClassificationReason[] = [
      ...input.validationResults.filter((r) => r.outcome === 'FLAG')
        .map((r): ClassificationReason => ({ code: 'SECTION_FLAGGED', sectionId: r.sectionId })),
      ...input.exceptionRequests
        .map((e): ClassificationReason => ({ code: 'EXCEPTION_REQUESTED', sectionId: e.sectionId })),
      ...input.sectionIds.filter((id) => !planned.has(courseOf.get(id) ?? ''))
        .map((id): ClassificationReason => ({ code: 'COURSE_NOT_IN_PLAN', sectionId: id, courseId: courseOf.get(id) })),
    ];
    return {
      label: reasons.length ? 'NEEDS_REVIEW' : 'ROUTINE',
      reasons,
      // Classifier has no clock of its own (contracts.md); callers that store the label stamp it with theirs.
      classifiedAt: new Date().toISOString(),
    };
  }
}
