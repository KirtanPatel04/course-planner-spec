// Catalog Search (architecture.md §2; FR-001): finds course sections in the snapshot.

import { NotImplementedError } from '../domain/errors';
import type { SectionQuery, SectionSearchResult, StudentId } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

export class CatalogSearch {
  constructor(private readonly store: DataStore) {}

  /**
   * Returns sections of `query.term` whose course satisfies `query.requirementId` in the student's Program,
   * whose first meeting starts at or after `startsAtOrAfter`, and that meet on `day`.
   * Omitted filters do not restrict. An empty list is a success (AC-002).
   * @throws DomainError INVALID_INPUT for an unknown term or requirement, or a malformed time or day.
   */
  async searchSections(_studentId: StudentId, _query: SectionQuery): Promise<SectionSearchResult[]> {
    throw new NotImplementedError('CatalogSearch.searchSections');
  }
}
