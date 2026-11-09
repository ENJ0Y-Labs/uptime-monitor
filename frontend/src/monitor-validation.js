export const SUPPORTED_INTERVALS = [5, 10, 20, 30];
export const SUPPORTED_TIMEOUTS = [5, 10, 15, 30];

export function validateMonitor({ name, url, intervalMinutes, timeoutSeconds, expectedStatus }) {
  if (!String(name ?? '').trim()) return { valid: false, message: 'Enter a monitor name.' };
  if (String(name).trim().length > 80) return { valid: false, message: 'Monitor name must be 80 characters or fewer.' };

  let parsed;
  try {
    parsed = new URL(String(url ?? '').trim());
  } catch {
    return { valid: false, message: 'Enter a valid absolute URL, including https://.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, message: 'Only HTTP and HTTPS URLs are supported.' };
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    return { valid: false, message: 'Enter a URL with a hostname and without embedded credentials.' };
  }
  if (!SUPPORTED_INTERVALS.includes(Number(intervalMinutes))) {
    return { valid: false, message: 'Choose a supported check interval.' };
  }
  if (!SUPPORTED_TIMEOUTS.includes(Number(timeoutSeconds))) {
    return { valid: false, message: 'Choose a supported timeout.' };
  }
  if (!Number.isInteger(Number(expectedStatus)) || Number(expectedStatus) < 100 || Number(expectedStatus) > 599) {
    return { valid: false, message: 'Expected HTTP status must be a whole number from 100 to 599.' };
  }

  return { valid: true, message: '' };
}
