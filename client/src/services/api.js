import { supabase } from './supabase.js';

const base = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = result.error?.code;
    throw error;
  }
  return result.data;
}

export async function uploadItemPhotos(listingId, files, onProgress = () => {}) {
  if (!supabase) throw new Error('Supabase is not configured yet.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again before uploading photos.');

  const baseUrl = base.replace(/\/api\/v1$/, '');
  const batches = [];
  for (let index = 0; index < files.length; index += 5) batches.push(files.slice(index, index + 5));
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
  let uploadedBytes = 0;
  const results = [];

  for (const batch of batches) {
    const batchSize = batch.reduce((sum, file) => sum + file.size, 0);
    try {
      const result = await new Promise((resolve, reject) => {
        const form = new FormData();
        for (const file of batch) form.append('photos', file);
        const request = new XMLHttpRequest();
        request.open('POST', `${baseUrl}/api/v1/items/${listingId}/photos`);
        request.setRequestHeader('Authorization', `Bearer ${token}`);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(Math.min(99, Math.round(100 * (uploadedBytes + event.loaded) / total)));
          }
        };
        request.onerror = () => reject(new Error('The photo upload could not reach the server.'));
        request.ontimeout = () => reject(new Error('The photo upload timed out. Try again.'));
        request.timeout = 120000;
        request.onload = () => {
          let responseBody;
          try {
            responseBody = JSON.parse(request.responseText);
          } catch {
            reject(new Error('The server returned an invalid photo upload response.'));
            return;
          }
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(responseBody.error?.message || `Photo upload failed (${request.status}).`));
            return;
          }
          resolve(responseBody.data);
        };
        request.send(form);
      });
      results.push(...(result.photos ?? []));
      uploadedBytes += batchSize;
      onProgress(Math.min(99, Math.round(100 * uploadedBytes / total)));
    } catch (error) {
      error.uploadedCount = results.length;
      throw error;
    }
  }

  onProgress(100);
  return results;
}
