const isDevelopment = Boolean(import.meta.env?.DEV);
const configuredBaseUrl = isDevelopment ? '' : (import.meta.env?.VITE_APIMON_API_BASE_URL || '');
let activeApiToken = '';

export function setApiToken(token) {
  activeApiToken = String(token || '').trim();
}

export function createApiClient(baseUrl, fetchImpl = fetch, allowRelativeUrl = false, tokenProvider = () => activeApiToken) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');

  async function request(path, options = {}) {
    if (!normalizedBaseUrl && !allowRelativeUrl) {
      throw new Error('APIMON API is not configured. Set VITE_APIMON_API_BASE_URL and rebuild the frontend.');
    }

    const token = String(tokenProvider() || '').trim();
    if (!token) throw new Error('Enter your APIMON API token to connect.');

    let response;
    try {
      response = await fetchImpl(normalizedBaseUrl + path, {
        ...options,
        credentials: 'omit',
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
          Authorization: 'Bearer ' + token
        }
      });
    } catch {
      throw new Error('Could not reach the APIMON API. Check your connection and API configuration.');
    }

    if (response.status === 204) return null;

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('APIMON rejected this API token (401). Check that it matches the APIMON_API_TOKEN secret configured on the Worker.');
      }
      if (response.status === 403) {
        throw new Error('APIMON blocked this request (403). Check APIMON_ALLOWED_ORIGIN and the Worker deployment configuration.');
      }
      throw new Error(payload?.error || 'APIMON API request failed (' + response.status + ').');
    }

    return payload;
  }

  return {
    listMonitors: () => request('/api/monitors'),
    createMonitor: monitor => request('/api/monitors', { method: 'POST', body: JSON.stringify(monitor) }),
    updateMonitor: (id, monitor) => request('/api/monitors/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(monitor) }),
    pauseMonitor: id => request('/api/monitors/' + encodeURIComponent(id) + '/pause', { method: 'POST' }),
    resumeMonitor: id => request('/api/monitors/' + encodeURIComponent(id) + '/resume', { method: 'POST' }),
    deleteMonitor: id => request('/api/monitors/' + encodeURIComponent(id), { method: 'DELETE' }),
    getChecks: (id, limit = 50) => request('/api/monitors/' + encodeURIComponent(id) + '/checks?limit=' + limit)
  };
}

export const api = createApiClient(configuredBaseUrl, fetch, isDevelopment);
