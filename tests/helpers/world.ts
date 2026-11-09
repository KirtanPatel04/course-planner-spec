// The test world from test_plan.md ("Test data"). Every test starts from a fresh copy.

import type {
  CourseHistoryEntry, CourseSection, RegistrationData, SectionStatus, Weekday,
} from '../../src/domain/types';

/** Default start time: 2027-07-15 9:00 AM CDT, inside the FA27 registration window. */
export const T0 = '2027-07-15T14:00:00.000Z';

const section = (
  id: string, courseId: string, term: string, days: Weekday[], start: string, end: string,
  capacity: number, seatsAvailable: number, status: SectionStatus = 'OPEN',
): CourseSection => ({ id, courseId, term, meetings: [{ days, start, end }], capacity, seatsAvailable, status });

const course = (id: string, title: string, creditHours: number, offeredIn: ('FALL' | 'SPRING')[], prerequisites: string[] = [], corequisites: string[] = []) =>
  ({ id, title, creditHours, prerequisites, corequisites, offeredIn });

const student = (id: string, name: string, advisorId: string) =>
  ({ id, name, email: `${id}@unomaha.edu`, programId: 'MSCS', advisorId, firstTerm: 'FA27' });

export function world(): RegistrationData {
  return {
    terms: [
      { code: 'FA27', name: 'Fall 2027', season: 'FALL', startDate: '2027-08-23', endDate: '2027-12-17', registrationStart: '2027-04-01', registrationEnd: '2027-08-20' },
      { code: 'SP28', name: 'Spring 2028', season: 'SPRING', startDate: '2028-01-18', endDate: '2028-05-12', registrationStart: '2027-11-01', registrationEnd: '2028-01-14' },
      { code: 'FA28', name: 'Fall 2028', season: 'FALL', startDate: '2028-08-21', endDate: '2028-12-15', registrationStart: '2028-04-01', registrationEnd: '2028-08-18' },
      { code: 'SP29', name: 'Spring 2029', season: 'SPRING', startDate: '2029-01-16', endDate: '2029-05-11', registrationStart: '2028-11-01', registrationEnd: '2029-01-12' },
    ],
    programs: [{
      id: 'MSCS',
      name: 'MS in Computer Science',
      maxCreditHoursPerTerm: 12,
      requirements: [
        { id: 'CORE', name: 'Core', courses: ['CSCI 8000', 'CSCI 8100', 'CSCI 8500'], creditHoursRequired: 9 },
        { id: 'ELEC', name: 'Electives', courses: ['CSCI 8200', 'CSCI 8300', 'CSCI 8400', 'CSCI 8600', 'CSCI 8700', 'CSCI 8800'], creditHoursRequired: 12 },
        { id: 'PROJ', name: 'Thesis or Project', courses: ['CSCI 8990'], creditHoursRequired: 3 },
      ],
    }],
    courses: [
      course('CSCI 8000', 'Foundations of Computing', 3, ['FALL']),
      course('CSCI 8100', 'Software Specification', 3, ['FALL', 'SPRING']),
      course('CSCI 8500', 'Advanced Algorithms', 3, ['SPRING'], ['CSCI 8000']),
      course('CSCI 8200', 'Databases', 3, ['FALL', 'SPRING']),
      course('CSCI 8300', 'Machine Learning', 3, ['FALL']),
      course('CSCI 8400', 'Computer Networks', 3, ['FALL', 'SPRING']),
      course('CSCI 8410', 'Networks Lab', 1, ['FALL', 'SPRING'], [], ['CSCI 8400']),
      course('CSCI 8600', 'Security', 3, ['FALL', 'SPRING']),
      course('CSCI 8700', 'Distributed Systems', 3, ['FALL']),
      course('CSCI 8800', 'Human-Computer Interaction', 3, ['FALL', 'SPRING']),
      course('CSCI 8990', 'Graduate Project', 3, ['SPRING'], ['CSCI 8500']),
    ],
    sections: [
      section('CSCI8000-001', 'CSCI 8000', 'FA27', ['MON', 'WED'], '18:00', '19:15', 30, 5),
      section('CSCI8000-002', 'CSCI 8000', 'FA27', ['TUE', 'THU'], '17:00', '18:15', 30, 12),
      section('CSCI8100-001', 'CSCI 8100', 'FA27', ['TUE', 'THU'], '17:30', '18:45', 30, 10),
      section('CSCI8100-002', 'CSCI 8100', 'FA27', ['FRI'], '16:59', '19:39', 30, 10),
      section('CSCI8200-001', 'CSCI 8200', 'FA27', ['TUE'], '18:00', '20:40', 30, 8),
      section('CSCI8300-001', 'CSCI 8300', 'FA27', ['TUE'], '18:44', '21:24', 30, 8),
      section('CSCI8300-002', 'CSCI 8300', 'FA27', ['TUE'], '18:46', '21:26', 30, 8),
      section('CSCI8400-001', 'CSCI 8400', 'FA27', ['THU'], '19:00', '21:40', 30, 8),
      section('CSCI8410-001', 'CSCI 8410', 'FA27', ['FRI'], '13:00', '14:50', 20, 6),
      section('CSCI8600-001', 'CSCI 8600', 'FA27', ['WED'], '13:00', '15:40', 25, 0, 'FULL'),
      section('CSCI8700-001', 'CSCI 8700', 'FA27', ['MON'], '13:00', '15:40', 25, 20, 'CANCELLED'),
      section('CSCI8800-001', 'CSCI 8800', 'FA27', ['SAT'], '09:00', '11:40', 25, 15),
      section('CSCI8500-001', 'CSCI 8500', 'SP28', ['MON', 'WED'], '18:00', '19:15', 30, 10),
      section('CSCI8100-101', 'CSCI 8100', 'SP28', ['TUE', 'THU'], '17:30', '18:45', 30, 10),
    ],
    students: [
      student('stu-a', 'Ana Alvarez', 'adv-1'),
      student('stu-b', 'Ben Brooks', 'adv-1'),
      student('stu-c', 'Cara Chen', 'adv-2'),
      student('stu-d', 'Dev Desai', 'adv-1'),
    ],
    advisors: [
      { id: 'adv-1', name: 'Dr. Harper', email: 'adv-1@unomaha.edu' },
      { id: 'adv-2', name: 'Dr. Lee', email: 'adv-2@unomaha.edu' },
    ],
    holds: [],
    courseHistory: [],
  };
}

export const history = (studentId: string, courseId: string, term: string, status: CourseHistoryEntry['status']): CourseHistoryEntry =>
  ({ studentId, courseId, term, status });
