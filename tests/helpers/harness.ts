// Test harness: builds the server from the contracts with injected fakes (clock, mail, simulated
// MavLINK) and offers the shorthand steps used in test_plan.md. It calls only functions listed in
// contracts.md: REST routes, RegistrationSync.syncAll, JobRunner.runDueJobs, Classifier.classify.

import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../../src/api/app';
import { createServices, Services } from '../../src/container';
import { NotImplementedError } from '../../src/domain/errors';
import type { Notification, PlanOfStudy, RegistrationData, ScheduleView } from '../../src/domain/types';
import { PostgresDataStore } from '../../src/modules/dataStore/postgresDataStore';
import type { MailService } from '../../src/modules/notifier';
import { SimulatedRegistrationGateway } from '../../src/modules/registrationGateway/simulatedGateway';
import type { Clock } from '../../src/shared/clock';
import { T0, world } from './world';

export class FakeClock implements Clock {
  private current: Date;
  constructor(iso: string) { this.current = new Date(iso); }
  now(): Date { return new Date(this.current); }
  set(iso: string): void { this.current = new Date(iso); }
  advanceMinutes(minutes: number): void { this.current = new Date(this.current.getTime() + minutes * 60_000); }
  iso(): string { return this.current.toISOString(); }
}

export class RecordingMail implements MailService {
  readonly sent: { to: string; subject: string; body: string }[] = [];
  async send(to: string, subject: string, body: string): Promise<void> { this.sent.push({ to, subject, body }); }
}

/**
 * Calls a contract function. A NotImplementedError becomes a value instead of an exception, so the
 * calling test fails on its assertion about the result (the behavior), not on a thrown error.
 * Any other error is rethrown unchanged.
 */
export async function attempt<T>(call: () => Promise<T>): Promise<T | { notImplemented: string }> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof NotImplementedError) return { notImplemented: err.functionName };
    throw err;
  }
}

type Res = request.Response;

/** Asserts the HTTP status, showing the body on failure. */
export function expectStatus(res: Res, status: number): void {
  expect(res.status, `response body: ${JSON.stringify(res.body)}`).toBe(status);
}

export interface Harness {
  services: Services;
  gateway: SimulatedRegistrationGateway;
  clock: FakeClock;
  mail: RecordingMail;
  /** supertest agent methods that send X-User-Id for `user` (omit `user` to send no identity). */
  as(user?: string): {
    get(path: string): request.Test;
    post(path: string, body?: object): request.Test;
    put(path: string, body?: object): request.Test;
    delete(path: string): request.Test;
  };
  /** Changes simulated MavLINK data. */
  mavlink(change: (data: RegistrationData) => void): void;
  /** RegistrationSync.syncAll() at the current clock time; asserts it succeeded. */
  sync(): Promise<void>;
  /** Sets the clock and calls JobRunner.runDueJobs(); asserts it ran. */
  runJobs(atIso: string): Promise<void>;
  // ----- shorthand steps from test_plan.md -----
  createDraft(user: string, term: string, sectionIds?: string[], name?: string): Promise<string>;
  submit(user: string, scheduleId: string): Promise<ScheduleView>;
  approve(advisor: string, scheduleId: string): Promise<ScheduleView>;
  schedule(user: string, scheduleId: string): Promise<ScheduleView>;
  pinPlan(user: string, placements: Record<string, string>): Promise<PlanOfStudy>;
  plan(user: string): Promise<PlanOfStudy>;
  notifications(user: string): Promise<Notification[]>;
  enrollCallsFor(sectionId: string): number;
}

export function createHarness(options: { at?: string; data?: (d: RegistrationData) => void } = {}): Harness {
  const clock = new FakeClock(options.at ?? T0);
  const gateway = new SimulatedRegistrationGateway();
  const data = world();
  options.data?.(data);
  gateway.seed(data);
  const mail = new RecordingMail();
  const store = new PostgresDataStore(process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/course_planner_test');
  const services = createServices({ store, gateway, mail, clock });
  const app = createApp(services);

  const as = (user?: string) => {
    const withUser = (t: request.Test) => (user ? t.set('X-User-Id', user) : t);
    return {
      get: (path: string) => withUser(request(app).get(path)),
      post: (path: string, body?: object) => withUser(request(app).post(path)).send(body ?? {}),
      put: (path: string, body?: object) => withUser(request(app).put(path)).send(body ?? {}),
      delete: (path: string) => withUser(request(app).delete(path)),
    };
  };

  const h: Harness = {
    services, gateway, clock, mail, as,
    mavlink: (change) => gateway.update(change),

    async sync() {
      const report = await attempt(() => services.registrationSync.syncAll());
      expect(report, 'RegistrationSync.syncAll() should succeed').toMatchObject({ succeeded: true });
    },

    async runJobs(atIso: string) {
      clock.set(atIso);
      const summary = await attempt(() => services.jobRunner.runDueJobs());
      expect(summary, 'JobRunner.runDueJobs() should run').toHaveProperty('ranAt');
    },

    async createDraft(user, term, sectionIds = [], name) {
      const created = await as(user).post('/schedules', name ? { term, name } : { term });
      expectStatus(created, 201);
      const id = created.body.id as string;
      for (const sectionId of sectionIds) {
        expectStatus(await as(user).post(`/schedules/${id}/sections`, { sectionId }), 200);
      }
      return id;
    },

    async submit(user, scheduleId) {
      const res = await as(user).post(`/schedules/${scheduleId}/submit`);
      expectStatus(res, 200);
      return res.body;
    },

    async approve(advisor, scheduleId) {
      const res = await as(advisor).post(`/schedules/${scheduleId}/approve`);
      expectStatus(res, 200);
      return res.body;
    },

    async schedule(user, scheduleId) {
      const res = await as(user).get(`/schedules/${scheduleId}`);
      expectStatus(res, 200);
      return res.body;
    },

    async plan(user) {
      const res = await as(user).get('/plan');
      expectStatus(res, 200);
      return res.body;
    },

    async pinPlan(user, placements) {
      let plan = await h.plan(user);
      for (const [courseId, term] of Object.entries(placements)) {
        const res = await as(user).put(`/plan/courses/${encodeURIComponent(courseId)}`, { term });
        expectStatus(res, 200);
        plan = res.body;
      }
      return plan;
    },

    async notifications(user) {
      const res = await as(user).get('/notifications');
      expectStatus(res, 200);
      return res.body;
    },

    enrollCallsFor: (sectionId) => gateway.enrollCalls.filter((c) => c.sectionId === sectionId && c.delivered).length,
  };
  return h;
}

// ----- small readers over response bodies -----

export const resultFor = (view: ScheduleView, sectionId: string) => {
  const result = view.validationResults.find((r) => r.sectionId === sectionId);
  expect(result, `validation result for ${sectionId}`).toBeDefined();
  return result!;
};

export const flagCodes = (view: ScheduleView, sectionId: string): string[] =>
  resultFor(view, sectionId).flags.map((f) => f.code);

export const coursesInTerm = (plan: PlanOfStudy, term: string): string[] =>
  plan.terms.find((t) => t.term === term)?.courses.map((c) => c.courseId) ?? [];

export const termOf = (plan: PlanOfStudy, courseId: string): string | undefined =>
  plan.terms.find((t) => t.courses.some((c) => c.courseId === courseId))?.term;

export const eventsFor = (notes: Notification[], event: string, scheduleId?: string) =>
  notes.filter((n) => n.event === event && (scheduleId === undefined || n.scheduleId === scheduleId));

/** Minutes after an ISO instant, as an ISO string. */
export const plusMinutes = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
