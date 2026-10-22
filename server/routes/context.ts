import type { Config } from '../lib/config.js';
import type { ApplicationEvent, ApplicationResponse } from '../lib/http.js';
import { adminClient } from '../lib/supabase.js';

export type DatabaseClient = ReturnType<typeof adminClient>;

export type RouteContext = {
  event: ApplicationEvent;
  route: string;
  db: DatabaseClient;
  config: Config;
};

export type RouteHandler = (context: RouteContext) => Promise<ApplicationResponse | undefined>;
