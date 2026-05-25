import type { AppRouter } from '@atlas/api';
import { hc } from 'hono/client';

// End-to-end typed client. `apiBase` is empty in dev (vite proxy forwards /api → :3000).
export const api = hc<AppRouter>('/api');
