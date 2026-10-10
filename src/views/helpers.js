import { html, raw } from 'hono/html';
export { html, raw };
export * as dates from '../dates.js';

export const paragraphs = (text) =>
  String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

export const csrfField = (p) => html`<input type="hidden" name="_csrf" value="${p.csrf}">`;
export const sel = (cond) => (cond ? raw(' selected') : '');
export const chk = (cond) => (cond ? raw(' checked') : '');
export const v = (x) => x ?? '';
export const errorBox = (error) => (error ? html`<p class="error">${error}</p>` : '');
