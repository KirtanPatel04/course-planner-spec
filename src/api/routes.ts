// API (architecture.md §2): one route per user-facing requirement, each mapped to one public function.
// Every handler: SSO identity → Access Control → the module function. No business logic lives here.
// contracts.md §2 lists the same table with request and response shapes.

import type { Request } from 'express';
import type { Services } from '../container';
import type { Actor, ReasonCode, Weekday } from '../domain/types';

export interface RouteDef {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  /** The public function this route maps to (shown in the 501 message). */
  target: string;
  requirements: string[];
  successStatus: number;
  handle: (s: Services, actor: Actor, req: Request) => Promise<unknown>;
}

const q = (req: Request, name: string): string | undefined =>
  typeof req.query[name] === 'string' ? (req.query[name] as string) : undefined;

/** The signed-in user's ID, for data addressed to the user themself (notifications). */
const userIdOf = (actor: Actor): string => (actor.kind === 'SYSTEM' ? '' : actor.id);

export const routes: RouteDef[] = [
  {
    method: 'get', path: '/sections', target: 'CatalogSearch.searchSections', requirements: ['FR-001'], successStatus: 200,
    handle: async (s, actor, req) => {
      const me = await s.accessControl.requireStudent(actor);
      return s.catalogSearch.searchSections(me, {
        term: q(req, 'term') ?? '',
        requirementId: q(req, 'requirement'),
        startsAtOrAfter: q(req, 'startsAtOrAfter'),
        day: q(req, 'day') as Weekday | undefined,
      });
    },
  },
  {
    method: 'post', path: '/schedules', target: 'ScheduleManager.createDraft', requirements: ['FR-002'], successStatus: 201,
    handle: async (s, actor, req) => {
      const me = await s.accessControl.requireStudent(actor);
      return s.scheduleManager.createDraft(me, req.body?.term, req.body?.name);
    },
  },
  {
    method: 'get', path: '/schedules', target: 'ScheduleManager.listSchedules', requirements: ['FR-002'], successStatus: 200,
    handle: async (s, actor, req) => {
      const me = await s.accessControl.requireStudent(actor);
      return s.scheduleManager.listSchedules(me, q(req, 'term'));
    },
  },
  {
    method: 'get', path: '/schedules/:id', target: 'ScheduleManager.getSchedule', requirements: ['FR-002', 'FR-003', 'FR-010', 'FR-011', 'FR-018'], successStatus: 200,
    handle: async (s, actor, req) => {
      const owner = await s.accessControl.authorizeSchedule(actor, 'VIEW', req.params.id);
      await s.registrationSync.refreshForStudent(owner);
      return s.scheduleManager.getSchedule(req.params.id);
    },
  },
  {
    method: 'post', path: '/schedules/:id/sections', target: 'ScheduleManager.addSection', requirements: ['FR-002', 'FR-003', 'FR-010', 'FR-011'], successStatus: 200,
    handle: async (s, actor, req) => {
      const owner = await s.accessControl.authorizeSchedule(actor, 'EDIT', req.params.id);
      await s.registrationSync.refreshForStudent(owner);
      return s.scheduleManager.addSection(req.params.id, req.body?.sectionId);
    },
  },
  {
    method: 'delete', path: '/schedules/:id/sections/:sectionId', target: 'ScheduleManager.removeSection', requirements: ['FR-002', 'FR-003'], successStatus: 200,
    handle: async (s, actor, req) => {
      const owner = await s.accessControl.authorizeSchedule(actor, 'EDIT', req.params.id);
      await s.registrationSync.refreshForStudent(owner);
      return s.scheduleManager.removeSection(req.params.id, req.params.sectionId);
    },
  },
  {
    method: 'post', path: '/schedules/:id/exceptions', target: 'ScheduleManager.requestException', requirements: ['FR-016'], successStatus: 201,
    handle: async (s, actor, req) => {
      await s.accessControl.authorizeSchedule(actor, 'EDIT', req.params.id);
      return s.scheduleManager.requestException(req.params.id, req.body?.sectionId, req.body?.reasonCode as ReasonCode, req.body?.justification);
    },
  },
  {
    method: 'post', path: '/schedules/:id/submit', target: 'ScheduleManager.submit', requirements: ['FR-006', 'FR-013', 'FR-018'], successStatus: 200,
    handle: async (s, actor, req) => {
      const owner = await s.accessControl.authorizeSchedule(actor, 'SUBMIT', req.params.id);
      await s.registrationSync.refreshForStudent(owner);
      return s.scheduleManager.submit(req.params.id, actor);
    },
  },
  {
    method: 'post', path: '/schedules/:id/withdraw', target: 'ScheduleManager.withdraw', requirements: ['FR-017'], successStatus: 200,
    handle: async (s, actor, req) => {
      await s.accessControl.authorizeSchedule(actor, 'WITHDRAW', req.params.id);
      return s.scheduleManager.withdraw(req.params.id, actor);
    },
  },
  {
    method: 'post', path: '/schedules/:id/approve', target: 'ScheduleManager.approve', requirements: ['FR-008', 'FR-019', 'FR-020'], successStatus: 200,
    handle: async (s, actor, req) => {
      await s.accessControl.authorizeSchedule(actor, 'APPROVE', req.params.id);
      return s.scheduleManager.approve(req.params.id, actor);
    },
  },
  {
    method: 'post', path: '/schedules/:id/return', target: 'ScheduleManager.returnSchedule', requirements: ['FR-008', 'FR-019'], successStatus: 200,
    handle: async (s, actor, req) => {
      await s.accessControl.authorizeSchedule(actor, 'RETURN', req.params.id);
      return s.scheduleManager.returnSchedule(req.params.id, req.body?.comment, actor);
    },
  },
  {
    method: 'get', path: '/plan', target: 'Planner.getPlan', requirements: ['FR-004', 'FR-012'], successStatus: 200,
    handle: async (s, actor) => {
      const me = await s.accessControl.requireStudent(actor);
      return s.planner.getPlan(me);
    },
  },
  {
    method: 'put', path: '/plan/courses/:courseId', target: 'Planner.moveCourse', requirements: ['FR-004'], successStatus: 200,
    handle: async (s, actor, req) => {
      const me = await s.accessControl.requireStudent(actor);
      return s.planner.moveCourse(me, req.params.courseId, req.body?.term);
    },
  },
  {
    method: 'get', path: '/degree-progress', target: 'DegreeAudit.getDegreeProgress', requirements: ['FR-005'], successStatus: 200,
    handle: async (s, actor) => {
      const me = await s.accessControl.requireStudent(actor);
      return s.degreeAudit.getDegreeProgress(me);
    },
  },
  {
    method: 'get', path: '/notifications', target: 'Notifier.listNotifications', requirements: ['FR-006', 'FR-014', 'FR-015', 'FR-018'], successStatus: 200,
    handle: async (s, actor) => s.notifier.listNotifications(userIdOf(actor)),
  },
  {
    method: 'get', path: '/advisor/dashboard', target: 'ReviewQueue.getDashboard', requirements: ['FR-007', 'FR-013'], successStatus: 200,
    handle: async (s, actor) => s.reviewQueue.getDashboard(await s.accessControl.requireAdvisor(actor)),
  },
  {
    method: 'get', path: '/advisor/schedules/:id/review', target: 'ReviewQueue.getReviewView', requirements: ['FR-009'], successStatus: 200,
    handle: async (s, actor, req) => {
      await s.accessControl.requireAdvisor(actor);
      await s.accessControl.authorizeSchedule(actor, 'VIEW', req.params.id);
      return s.reviewQueue.getReviewView(req.params.id);
    },
  },
  {
    method: 'get', path: '/sync-status', target: 'RegistrationSync.getSyncStatus', requirements: ['FR-018'], successStatus: 200,
    handle: async (s) => s.registrationSync.getSyncStatus(),
  },
];
