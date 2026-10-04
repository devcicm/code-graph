import { route } from './router.mjs';
route('GET', '/health', () => ({ ok: true }));
