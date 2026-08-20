// Vercel serverless entry point.
//
// Vercel only packages files inside api/ into the function, so it cannot
// reach ../server.ts. The build command bundles that into ./_server.mjs
// (leading underscore = not itself routed as a function) and this file
// imports it from inside the deployed directory. See vercel.json.
//
// Vercel serves the built SPA from dist/ itself; this function only handles
// /api/* requests.
//
// KNOWN LIMITATION: routes keeping state in module memory — /api/live/*
// (presence, shared playback) and /api/rooms/* (Živá zkušebna) — cannot work
// here, since each invocation may get a fresh instance. Everything else is
// stateless. See docs/NASAZENI-A-SYNCHRONIZACE.md.

import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './_server.mjs';

// Build once per warm instance, not per request.
const appPromise = createApp().then(({ app }) => app);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await appPromise;
  return app(req, res);
}
