import { z } from 'zod';
import { config } from './lib/config.js';
import {
  assertSameOrigin,
  HttpError,
  json,
  responseError,
  routeOf,
  type ApplicationHandler,
} from './lib/http.js';
import { adminClient } from './lib/supabase.js';
import { handleAdministrationRoutes } from './routes/administration.js';
import type { RouteHandler } from './routes/context.js';
import { handlePublicRoutes } from './routes/public.js';
import { handleStaffRoutes } from './routes/staff.js';

const routeHandlers: RouteHandler[] = [
  handlePublicRoutes,
  handleStaffRoutes,
  handleAdministrationRoutes,
];

export const handler: ApplicationHandler = async (event) => {
  try {
    assertSameOrigin(event);
    const context = {
      event,
      route: routeOf(event),
      db: adminClient(),
      config: config(),
    };

    for (const routeHandler of routeHandlers) {
      const response = await routeHandler(context);
      if (response) return response;
    }

    throw new HttpError(404, 'API route not found.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json(400, {
        ok: false,
        error: 'Please correct the highlighted information.',
        issues: error.issues,
      });
    }
    return responseError(error);
  }
};
