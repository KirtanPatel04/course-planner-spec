// Express application. Reads the SSO identity, runs the route handler, and turns errors into
// JSON bodies of the form { "error": <code>, "message": <text> }.

import express, { NextFunction, Request, Response } from 'express';
import type { Services } from '../container';
import { DomainError, NotImplementedError } from '../domain/errors';
import { routes } from './routes';

/**
 * Stand-in for the UNO single sign-on session (Description, D1, C5): the SSO proxy in front of the
 * server places the authenticated user ID in this header. The server never handles passwords.
 */
export const SSO_USER_HEADER = 'x-user-id';

export function createApp(services: Services): express.Express {
  const app = express();
  app.use(express.json());

  for (const route of routes) {
    app[route.method](route.path, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const actor = await services.accessControl.resolveActor(req.header(SSO_USER_HEADER));
        const result = await route.handle(services, actor, req);
        res.status(route.successStatus).json(result);
      } catch (err) {
        if (err instanceof NotImplementedError) {
          res.status(501).json({
            error: 'not_implemented',
            message: `${route.method.toUpperCase()} ${route.path} → ${route.target} is not implemented (stopped at ${err.functionName})`,
          });
          return;
        }
        next(err);
      }
    });
  }

  // Unknown route
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` });
  });

  // Domain errors carry their own HTTP status. Anything else is a 500 that reveals no data (NFR-001).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(err.httpStatus).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'INTERNAL', message: 'Internal error' });
  });

  return app;
}
