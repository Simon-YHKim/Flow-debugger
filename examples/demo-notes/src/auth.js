import { api } from './api.js';

export async function signIn(email, password) {
  const res = await api.post('/api/auth/login', { email, password });
  localStorage.setItem('token', res.token);
  return res;
}

export async function signOut() {
  localStorage.removeItem('token');
  return api.post('/api/auth/logout', {});
}
