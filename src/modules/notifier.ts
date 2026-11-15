// Notifier (architecture.md §2; FR-006, FR-014, FR-015, FR-018, NFR-009, D11).
// Stores in-app Notifications and sends the matching email through the university mail service.

import { NotImplementedError } from '../domain/errors';
import type { Notification, NotificationEvent, ScheduleId, UserId } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';

/** The university mail service (Notification object). Injected so tests can record emails. */
export interface MailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

const SUBJECTS: Record<NotificationEvent, string> = {
  SCHEDULE_SUBMITTED: 'Course Planner: schedule submitted for review',
  SCHEDULE_APPROVED: 'Course Planner: schedule approved',
  SCHEDULE_RETURNED: 'Course Planner: schedule returned',
  ENROLLMENT_RESULT: 'Course Planner: enrollment result',
  REVALIDATION_FAILURE: 'Course Planner: schedule needs attention',
};

export class Notifier {
  constructor(
    private readonly store: DataStore,
    private readonly mail: MailService,
    private readonly clock: Clock,
  ) {}

  /** Stores an in-app Notification for one student or advisor and queues its email. */
  async notify(_recipientId: UserId, _event: NotificationEvent, _scheduleId: ScheduleId, _message: string): Promise<Notification> {
    throw new NotImplementedError('Notifier.notify');
  }

  /** The signed-in user's Notifications, newest first. Never another user's (NFR-001). */
  async listNotifications(_userId: UserId): Promise<Notification[]> {
    throw new NotImplementedError('Notifier.listNotifications');
  }

  /** Sends queued emails through MailService; returns how many were sent. Called by Job Runner. */
  async sendPendingEmails(): Promise<number> {
    const data = await this.store.getRegistrationData();
    const emailOf = new Map([...data.students, ...data.advisors].map((p) => [p.id, p.email]));
    let sent = 0;
    for (const n of await this.store.listUnsentEmails()) {
      const to = emailOf.get(n.recipientId);
      if (!to) continue;
      try {
        await this.mail.send(to, SUBJECTS[n.event], n.message);
      } catch {
        continue; // the mail service is down; the email stays queued for the next run (NFR-004)
      }
      await this.store.markEmailSent(n.id, this.clock.now().toISOString());
      sent++;
    }
    return sent;
  }
}
