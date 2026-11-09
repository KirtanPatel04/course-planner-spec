// Simulated Registration Gateway (D15, NFR-010, C3): stands in for MavLINK in development,
// tests, and the course demo. It holds seeded data and answers with it. It contains no
// Course Planner rules (no validation, classification, or planning), so it is the one
// module in the skeleton whose bodies are filled in: tests need it to set up their data.

import { RegistrationUnavailableError } from '../../domain/errors';
import type { RegistrationData, SectionId, StudentId } from '../../domain/types';
import type { EnrollmentResponse, FetchScope, RegistrationGateway } from './registrationGateway';

export interface EnrollCall {
  studentId: StudentId;
  sectionId: SectionId;
  /** false when the simulator was unavailable and the call failed (FR-018 retry attempts). */
  delivered: boolean;
}

const emptyData = (): RegistrationData => ({
  terms: [], programs: [], courses: [], sections: [], students: [], advisors: [], holds: [], courseHistory: [],
});

export class SimulatedRegistrationGateway implements RegistrationGateway {
  private data: RegistrationData = emptyData();
  private available = true;
  private outcomes = new Map<SectionId, EnrollmentResponse>();

  /** Every fetch, in order (used to check the hourly sync, AC-020). */
  readonly fetchCalls: { scope: FetchScope | undefined; delivered: boolean }[] = [];
  /** Every enrollment call, in order (used to check FR-020 and the FR-018 retries). */
  readonly enrollCalls: EnrollCall[] = [];

  // ----- Simulator controls (not part of RegistrationGateway) -----

  /** Replaces all simulated MavLINK data. */
  seed(data: RegistrationData): void {
    this.data = structuredClone(data);
  }

  /** Changes simulated MavLINK data in place, e.g. cancel a section or add course history. */
  update(change: (data: RegistrationData) => void): void {
    change(this.data);
  }

  /** false makes every call throw RegistrationUnavailableError (an outage, FR-018). */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /** Makes MavLINK answer an enrollment for this section with the given response (default { ok: true }). */
  setEnrollmentOutcome(sectionId: SectionId, response: EnrollmentResponse): void {
    this.outcomes.set(sectionId, response);
  }

  // ----- RegistrationGateway -----

  async fetchRegistrationData(scope?: FetchScope): Promise<RegistrationData> {
    this.fetchCalls.push({ scope, delivered: this.available });
    if (!this.available) throw new RegistrationUnavailableError();
    return structuredClone(this.data);
  }

  async enrollSection(studentId: StudentId, sectionId: SectionId): Promise<EnrollmentResponse> {
    this.enrollCalls.push({ studentId, sectionId, delivered: this.available });
    if (!this.available) throw new RegistrationUnavailableError();
    return this.outcomes.get(sectionId) ?? { ok: true };
  }
}
