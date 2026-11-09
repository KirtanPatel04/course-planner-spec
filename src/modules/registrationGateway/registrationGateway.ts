// Registration Gateway (architecture.md §2, NFR-010, D15): the only code that calls MavLINK.
// Two versions implement this interface: MavlinkGateway (real) and SimulatedRegistrationGateway.

import type { RegistrationData, SectionId, StudentId } from '../../domain/types';

export interface FetchScope {
  /** Limit the fetch to the data one student's schedules use (on-open refresh, FR-010). */
  studentId?: StudentId;
}

export type EnrollmentResponse = { ok: true } | { ok: false; reason: string };

export interface RegistrationGateway {
  /**
   * Reads registration data from MavLINK and translates it into the domain model.
   * @throws RegistrationUnavailableError when MavLINK cannot be reached (FR-018).
   */
  fetchRegistrationData(scope?: FetchScope): Promise<RegistrationData>;

  /**
   * Asks MavLINK to enroll one student in one section (FR-014).
   * Returns MavLINK's answer; a rejection such as "full" is a normal result, not an error (AC-025).
   * @throws RegistrationUnavailableError when MavLINK cannot be reached (FR-018).
   */
  enrollSection(studentId: StudentId, sectionId: SectionId): Promise<EnrollmentResponse>;
}
