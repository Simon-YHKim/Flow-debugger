const BASE = process.env.API_BASE || 'http://localhost:3000';
export const api = {
  get: (p) => fetch(BASE + p).then((r) => r.json()),
  post: (p, b) => fetch(BASE + p, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json()),
  del: (p) => fetch(BASE + p, { method: 'DELETE' }).then((r) => r.json()),
};
