// Classifier (architecture.md §2; FR-013, D12): labels a submitted schedule Routine or Needs Review.

import { NotImplementedError } from '../domain/errors';
import type {
  ExceptionRequest, SectionId, StudentId, SubmissionClassification, TermCode, ValidationResult,
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
  async classify(_input: ClassificationInput): Promise<SubmissionClassification> {
    throw new NotImplementedError('Classifier.classify');
  }
}
