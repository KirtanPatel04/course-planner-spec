// Degree Audit (architecture.md §2; FR-005, input to FR-012).

import { NotImplementedError } from '../domain/errors';
import type { DegreeProgress, StudentId } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

export class DegreeAudit {
  constructor(private readonly store: DataStore) {}

  /**
   * Complete / In Progress / Remaining for each Degree Requirement of the student's Program,
   * from Course History, with completed and in-progress courses listed separately.
   * @throws DomainError NOT_FOUND if the student is unknown.
   */
  async getDegreeProgress(_studentId: StudentId): Promise<DegreeProgress> {
    throw new NotImplementedError('DegreeAudit.getDegreeProgress');
  }
}
