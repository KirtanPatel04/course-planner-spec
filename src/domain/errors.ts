// Error types shared by every module. contracts.md lists which function raises which code.

/** Thrown by every skeleton body until the function is implemented. The API maps it to HTTP 501. */
export class NotImplementedError extends Error {
  constructor(public readonly functionName: string) {
    super(`${functionName} is not implemented`);
    this.name = 'NotImplementedError';
  }
}

/** Every failure a caller is expected to handle. The API maps `code` to `httpStatus`. */
export type ErrorCode =
  | 'UNAUTHENTICATED' // 401: no signed-in user, or the user is unknown to MavLINK
  | 'FORBIDDEN' // 403: user may see the data but not perform this action (AC-034, student approving)
  | 'NOT_FOUND' // 404: does not exist OR belongs to someone the user may not see (AC-033, NFR-001)
  | 'INVALID_INPUT' // 400: malformed or unknown term, section, course, time, day, reason code
  | 'SECTION_TERM_MISMATCH' // 400: section is not offered in the schedule's Term
  | 'COMMENT_REQUIRED' // 400: Return without a comment (AC-017)
  | 'JUSTIFICATION_REQUIRED' // 400: Exception Request without a justification (AC-028)
  | 'INVALID_STATE' // 409: status does not allow this transition or edit (Draft Schedule transitions)
  | 'ACTIVE_SUBMISSION_EXISTS' // 409: another schedule for the Term is Submitted or later (AC-014)
  | 'REGISTRATION_UNAVAILABLE'; // 503: Submit blocked until a successful sync (FR-018, AC-031)

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  SECTION_TERM_MISMATCH: 400,
  COMMENT_REQUIRED: 400,
  JUSTIFICATION_REQUIRED: 400,
  INVALID_STATE: 409,
  ACTIVE_SUBMISSION_EXISTS: 409,
  REGISTRATION_UNAVAILABLE: 503,
};

export class DomainError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

/** Raised by a Registration Gateway when MavLINK cannot be reached (FR-018). Never leaves the server. */
export class RegistrationUnavailableError extends Error {
  constructor(message = 'University Registration System cannot be reached') {
    super(message);
    this.name = 'RegistrationUnavailableError';
  }
}
