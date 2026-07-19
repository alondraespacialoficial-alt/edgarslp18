import app from '../server.js';

// Vercel Serverless Function entrypoint.
// All /api/* requests are rewritten here (see vercel.json) and handled
// by the existing Express app defined in server.ts.
export default app;
