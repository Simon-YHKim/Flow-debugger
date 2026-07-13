// demo app: a tiny notes tool. REST backend + one AI call. Deliberately small, and
// deliberately containing the two traps the flow-debugger exists to catch.
import { api } from './api.js';
import { summarize } from './ai.js';
import { isNewUI } from './flags.js';

export function NotesScreen() {
  if (isNewUI()) return NotesScreenV2();      // <- delegation: the body below never renders
  return renderLegacyList();                   // legacy body (a trap for a naive anchor)
}

export async function loadNotes(userId) {
  return api.get('/api/notes?user=' + userId);
}

export async function saveNote(text) {
  const note = await api.post('/api/notes', { text });
  return note;
}

export async function summarizeNote(id) {
  const note = await api.get('/api/notes/' + id);
  return summarize(note.text);                 // AI call
}

export async function deleteNote(id) {
  return api.del('/api/notes/' + id);
}
