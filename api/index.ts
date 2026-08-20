// Vercel serverless entry point.
//
// Vercel serves the built SPA from dist/ itself (see vercel.json); this
// function only handles /api/* requests. The Express app is built by
// createApp() in ../server.ts — the same routes the local dev server uses,
// minus the listen() call and Vite middleware.
//
// KNOWN LIMITATION: routes that keep state in module memory —
// /api/live/* (who's online, shared playback) and /api/rooms/* (Živá
// zkušebna) — cannot work here. Each invocation may land on a fresh
// instance with empty memory, so presence always reads as nobody online.
// Everything else is stateless (Supabase, YouTube, Gemini) and behaves
// exactly as it does locally. See docs/NASAZENI-A-SYNCHRONIZACE.md.

import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server';

// Build once per warm instance, not per request.
const appPromise = createApp().then(({ app }) => app);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await appPromise;
  return app(req, res);
}
