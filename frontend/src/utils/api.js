const API_PREFIX = process.env.NODE_ENV === 'development'
  ? 'http://127.0.0.1:5000/api'
  : '/api';

function toApiPath(path) {
  return path.startsWith('/') ? `${API_PREFIX}${path}` : `${API_PREFIX}/${path}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let payload;
  try {
    payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload?.error || {};
    throw new Error(error.message || payload?.detail || `Request failed (${response.status})`);
  }
  return payload;
}

export async function apiFetchJson(path, options = {}) {
  try {
    const response = await fetch(toApiPath(path), {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    return await parseResponse(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to connect to Style-AER. Is the backend running?');
    }
    throw error;
  }
}

export async function apiFetchStream(path, options = {}) {
  try {
    const response = await fetch(toApiPath(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text();
        const responseMessage = typeof payload === 'string'
          ? payload.trim()
          : payload?.error?.message || payload?.detail;
        if (responseMessage) {
          message = `${responseMessage} (HTTP ${response.status})`;
        }
      } catch {
        // Keep the status-based message when the error response is malformed.
      }
      throw new Error(message);
    }
    if (!response.body) {
      throw new Error('The backend returned an empty stream.');
    }
    return response;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to connect to Style-AER. Is the backend running?');
    }
    throw error;
  }
}
