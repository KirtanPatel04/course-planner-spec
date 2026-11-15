// Catalog Search (architecture.md §2; FR-001): finds course sections in the snapshot.

import { DomainError } from '../domain/errors';
import type { SectionQuery, SectionSearchResult, StudentId, Weekday } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CatalogSearch {
  constructor(private readonly store: DataStore) {}

  /**
   * Returns sections of `query.term` whose course satisfies `query.requirementId` in the student's Program,
   * whose first meeting starts at or after `startsAtOrAfter`, and that meet on `day`.
   * Omitted filters do not restrict. An empty list is a success (AC-002).
   * @throws DomainError INVALID_INPUT for an unknown term or requirement, or a malformed time or day.
   */
  async searchSections(studentId: StudentId, query: SectionQuery): Promise<SectionSearchResult[]> {
    const data = await this.store.getRegistrationData();

    if (!data.terms.some((t) => t.code === query.term)) {
      throw new DomainError('INVALID_INPUT', 'Unknown term');
    }
    let requirementCourses: string[] | undefined;
    if (query.requirementId !== undefined) {
      const student = data.students.find((s) => s.id === studentId);
      const program = data.programs.find((p) => p.id === student?.programId);
      const requirement = program?.requirements.find((r) => r.id === query.requirementId);
      if (!requirement) throw new DomainError('INVALID_INPUT', 'Unknown requirement category for your program');
      requirementCourses = requirement.courses;
    }
    if (query.startsAtOrAfter !== undefined && !CLOCK_TIME.test(query.startsAtOrAfter)) {
      throw new DomainError('INVALID_INPUT', 'Meeting time must be HH:MM (24-hour)');
    }
    if (query.day !== undefined && !WEEKDAYS.includes(query.day)) {
      throw new DomainError('INVALID_INPUT', 'Meeting day must be one of MON, TUE, WED, THU, FRI, SAT, SUN');
    }

    const courses = new Map(data.courses.map((c) => [c.id, c]));
    return data.sections
      .filter((s) => s.term === query.term)
      .filter((s) => !requirementCourses || requirementCourses.includes(s.courseId))
      // "HH:MM" strings compare in time order.
      .filter((s) => !query.startsAtOrAfter || (s.meetings[0] !== undefined && s.meetings[0].start >= query.startsAtOrAfter))
      .filter((s) => !query.day || s.meetings.some((m) => m.days.includes(query.day!)))
      .map((s) => {
        const course = courses.get(s.courseId);
        return {
          sectionId: s.id,
          courseId: s.courseId,
          title: course?.title ?? '',
          creditHours: course?.creditHours ?? 0,
          meetings: s.meetings,
          seatsAvailable: s.seatsAvailable,
          status: s.status,
        };
      });
  }
}
