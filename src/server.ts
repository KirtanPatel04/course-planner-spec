// Entry point: starts the Course Planner server.
//   npm run dev        (TypeScript, via tsx)
//   npm run build && npm start
// Environment: PORT (default 3000), DATABASE_URL (PostgreSQL), MAVLINK_MODE=simulated|real, MAVLINK_URL.

import { createApp } from './api/app';
import { createServices } from './container';
import { PostgresDataStore } from './modules/dataStore/postgresDataStore';
import type { MailService } from './modules/notifier';
import { demoData } from './modules/registrationGateway/demoData';
import { MavlinkGateway } from './modules/registrationGateway/mavlinkGateway';
import { SimulatedRegistrationGateway } from './modules/registrationGateway/simulatedGateway';
import { SystemClock } from './shared/clock';

const port = Number(process.env.PORT ?? 3000);

// No university mail service is available to this project (C2), so emails are written to the log.
const universityMail: MailService = {
  async send(to, subject, body) {
    console.log(`[mail] to ${to}: ${subject}\n        ${body}`);
  },
};

// The simulator stands in for MavLINK (C3, D15), seeded with the demo catalog and students.
const simulator = new SimulatedRegistrationGateway();
simulator.seed(demoData());

const services = createServices({
  store: new PostgresDataStore(process.env.DATABASE_URL ?? 'postgres://localhost:5432/course_planner'),
  gateway: process.env.MAVLINK_MODE === 'real' ? new MavlinkGateway(process.env.MAVLINK_URL ?? '') : simulator,
  mail: universityMail,
  clock: new SystemClock(),
});

async function main(): Promise<void> {
  // Load the snapshot before taking requests, so identities and the catalog are known (D4).
  const report = await services.registrationSync.syncAll();
  console.log(report.succeeded
    ? `Synced registration data at ${report.syncedAt}`
    : 'MavLINK could not be reached; using the last snapshot (FR-018)');

  createApp(services).listen(port, () => {
    console.log(`Course Planner API listening on http://localhost:${port}`);
  });

  // Background jobs: hourly sync, enrollment and retries, email (D10).
  services.jobRunner.start(15_000);
}

main().catch((err) => {
  console.error(`Course Planner failed to start: ${(err as Error).message}`);
  process.exit(1);
});
