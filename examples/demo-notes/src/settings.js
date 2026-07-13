import { api } from './api.js';

export async function loadSettings(userId) {
  return api.get('/api/settings?user=' + userId);
}

export async function saveSettings(patch) {
  return api.post('/api/settings', patch);
}
