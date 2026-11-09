// Real Registration Gateway. Not buildable yet: UNO offers students no PeopleSoft API (C3).

import { NotImplementedError } from '../../domain/errors';
import type { RegistrationData, SectionId, StudentId } from '../../domain/types';
import type { EnrollmentResponse, FetchScope, RegistrationGateway } from './registrationGateway';

export class MavlinkGateway implements RegistrationGateway {
  constructor(private readonly baseUrl: string) {}

  fetchRegistrationData(_scope?: FetchScope): Promise<RegistrationData> {
    throw new NotImplementedError('MavlinkGateway.fetchRegistrationData');
  }

  enrollSection(_studentId: StudentId, _sectionId: SectionId): Promise<EnrollmentResponse> {
    throw new NotImplementedError('MavlinkGateway.enrollSection');
  }
}
