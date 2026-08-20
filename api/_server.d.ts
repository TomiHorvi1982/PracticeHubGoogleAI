// Type declaration for the server bundle esbuild generates at build time
// (see vercel.json buildCommand). The .mjs itself is gitignored — this file
// is what keeps `tsc --noEmit` working on a clean checkout, where the bundle
// does not exist yet.
declare module './_server.mjs' {
  import type { Express } from 'express';
  export function createApp(): Promise<{ app: Express; PORT: number }>;
}
