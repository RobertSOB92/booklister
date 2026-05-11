/**
 * _worker.js — Cloudflare Worker entry point
 * Routes /api/description to the scraper function,
 * everything else served as static assets.
 */

import { onRequestGet } from './functions/api/description.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests
    if (url.pathname === '/api/description') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' },
        });
      }
      return onRequestGet({ request, env, ctx, params: {} });
    }

    // Serve static assets (index.html, styles.css, app.js, etc.)
    return env.ASSETS.fetch(request);
  },
};
