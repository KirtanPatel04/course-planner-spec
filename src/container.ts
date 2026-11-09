// Wires the modules together following the "May depend on" column of architecture.md §2.
// Everything external (database, MavLINK, mail, clock) is injected so tests can replace it.

import type { Clock } from './shared/clock';
import type { DataStore } from './modules/dataStore/dataStore';
import type { RegistrationGateway } from './modules/registrationGateway/registrationGateway';
import { AccessControl } from './modules/accessControl';
import { CatalogSearch } from './modules/catalogSearch';
import { Classifier } from './modules/classifier';
import { DegreeAudit } from './modules/degreeAudit';
import { Enrollment } from './modules/enrollment';
import { JobRunner } from './modules/jobRunner';
import { MailService, Notifier } from './modules/notifier';
import { Planner } from './modules/planner';
import { RegistrationSync } from './modules/registrationSync';
import { Revalidator } from './modules/revalidator';
import { ReviewQueue } from './modules/reviewQueue';
import { ScheduleManager } from './modules/scheduleManager';
import { Validator } from './modules/validator';

export interface Dependencies {
  store: DataStore;
  gateway: RegistrationGateway;
  mail: MailService;
  clock: Clock;
}

export interface Services {
  accessControl: AccessControl;
  catalogSearch: CatalogSearch;
  scheduleManager: ScheduleManager;
  validator: Validator;
  classifier: Classifier;
  degreeAudit: DegreeAudit;
  planner: Planner;
  reviewQueue: ReviewQueue;
  registrationSync: RegistrationSync;
  revalidator: Revalidator;
  enrollment: Enrollment;
  notifier: Notifier;
  jobRunner: JobRunner;
}

export function createServices({ store, gateway, mail, clock }: Dependencies): Services {
  const notifier = new Notifier(store, mail, clock);
  const validator = new Validator(store);
  const classifier = new Classifier(store);
  const degreeAudit = new DegreeAudit(store);
  const planner = new Planner(degreeAudit, validator, store, clock);
  const scheduleManager = new ScheduleManager(validator, classifier, notifier, store, clock);
  const revalidator = new Revalidator(validator, classifier, scheduleManager, notifier, store, clock);
  const registrationSync = new RegistrationSync(gateway, revalidator, planner, store, clock);
  const enrollment = new Enrollment(gateway, scheduleManager, planner, notifier, store, clock);
  const jobRunner = new JobRunner(registrationSync, enrollment, notifier, store, clock);
  return {
    accessControl: new AccessControl(store),
    catalogSearch: new CatalogSearch(store),
    scheduleManager,
    validator,
    classifier,
    degreeAudit,
    planner,
    reviewQueue: new ReviewQueue(store),
    registrationSync,
    revalidator,
    enrollment,
    notifier,
    jobRunner,
  };
}
