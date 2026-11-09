// Wiring check for contracts.md: every route exists and maps to its function, and every public
// function in contracts.md §1 exists on the wired services. These tests pass on the skeleton and
// keep passing once the behavior is implemented. They show that the failing acceptance tests can
// reach the code under test.

import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/api/app';
import { routes } from '../src/api/routes';
import { createHarness } from './helpers/harness';

const CONTRACT_FUNCTIONS: Record<string, string[]> = {
  accessControl: ['resolveActor', 'requireStudent', 'requireAdvisor', 'authorizeSchedule'],
  catalogSearch: ['searchSections'],
  scheduleManager: ['createDraft', 'listSchedules', 'getSchedule', 'addSection', 'removeSection', 'requestException',
    'submit', 'withdraw', 'approve', 'returnSchedule', 'systemReturn', 'recordEnrollmentOutcome'],
  validator: ['validateSchedule', 'validatePlan'],
  classifier: ['classify'],
  degreeAudit: ['getDegreeProgress'],
  planner: ['getPlan', 'moveCourse', 'regenerate', 'applyEnrollment'],
  reviewQueue: ['getDashboard', 'getReviewView'],
  registrationSync: ['syncAll', 'refreshForStudent', 'getSyncStatus'],
  revalidator: ['revalidate'],
  enrollment: ['processEnrollmentJob'],
  notifier: ['notify', 'listNotifications', 'sendPendingEmails'],
  jobRunner: ['runDueJobs', 'start', 'stop'],
};

const EXPECTED_ROUTES = [
  'GET /sections', 'POST /schedules', 'GET /schedules', 'GET /schedules/:id', 'POST /schedules/:id/sections',
  'DELETE /schedules/:id/sections/:sectionId', 'POST /schedules/:id/exceptions', 'POST /schedules/:id/submit',
  'POST /schedules/:id/withdraw', 'POST /schedules/:id/approve', 'POST /schedules/:id/return', 'GET /plan',
  'PUT /plan/courses/:courseId', 'GET /degree-progress', 'GET /notifications', 'GET /advisor/dashboard',
  'GET /advisor/schedules/:id/review', 'GET /sync-status',
];

describe('contracts.md wiring', () => {
  test('the route table matches contracts.md §2', () => {
    expect(routes.map((r) => `${r.method.toUpperCase()} ${r.path}`)).toEqual(EXPECTED_ROUTES);
  });

  test('every contract function exists on the wired services', () => {
    const { services } = createHarness();
    for (const [module, fns] of Object.entries(CONTRACT_FUNCTIONS)) {
      for (const fn of fns) {
        expect(typeof (services as unknown as Record<string, Record<string, unknown>>)[module][fn], `${module}.${fn}`).toBe('function');
      }
    }
  });

  test.each(routes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))('%s is routed (not an unknown path)', async (_name, route) => {
    const app = createApp(createHarness().services);
    const path = route.path.replace(':id', 'sched-1').replace(':sectionId', 'CSCI8000-001').replace(':courseId', 'CSCI%208000');
    const res = await request(app)[route.method](path).set('X-User-Id', 'stu-a').send({});
    expect(String(res.body.message ?? '')).not.toMatch(/^No route for/);
  });
});
