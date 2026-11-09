// Entry point: starts the Course Planner server.
//   npm run dev        (TypeScript, via tsx)
//   npm run build && npm start
// Environment: PORT (default 3000), DATABASE_URL (PostgreSQL), MAVLINK_MODE=simulated|real, MAVLINK_URL.

import { createApp } from './api/app';
import { createServices } from './container';
import { PostgresDataStore } from './modules/dataStore/postgresDataStore';
import type { MailService } from './modules/notifier';
import { MavlinkGateway } from './modules/registrationGateway/mavlinkGateway';
import { SimulatedRegistrationGateway } from './modules/registrationGateway/simulatedGateway';
import { SystemClock } from './shared/clock';

const port = Number(process.env.PORT ?? 3000);

const universityMail: MailService = {
  async send() {
    throw new Error('University mail service is not configured');
  },
};

const services = createServices({
  store: new PostgresDataStore(process.env.DATABASE_URL ?? 'postgres://localhost:5432/course_planner'),
  gateway: process.env.MAVLINK_MODE === 'real'
    ? new MavlinkGateway(process.env.MAVLINK_URL ?? '')
    : new SimulatedRegistrationGateway(),
  mail: universityMail,
  clock: new SystemClock(),
});

createApp(services).listen(port, () => {
  console.log(`Course Planner API listening on http://localhost:${port}`);
});

// Background jobs (hourly sync, enrollment retries, email; D10). Not implemented yet.
try {
  services.jobRunner.start(60_000);
} catch (err) {
  console.warn(`Job runner not started: ${(err as Error).message}`);
}
