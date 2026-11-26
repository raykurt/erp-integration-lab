/**
 * The browser only talks to this Next.js server; /api/* is forwarded to the NestJS API.
 * Same origin for the browser, so no CORS setup is needed.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // web/ has its own lockfile next to the API's; tell Next.js which folder is the app root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};
