function invalidResponse(resource) {
  throw new Error('The APIMON API returned an invalid ' + resource + ' response.');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidMonitor(monitor) {
  return isRecord(monitor) &&
    typeof monitor.id === 'string' && monitor.id.length > 0 &&
    typeof monitor.name === 'string' && monitor.name.length > 0 &&
    typeof monitor.url === 'string' &&
    typeof monitor.enabled === 'boolean' &&
    Number.isInteger(monitor.intervalMinutes) &&
    Number.isInteger(monitor.timeoutSeconds) &&
    Number.isInteger(monitor.expectedStatus);
}

function isValidCheckResult(result) {
  return isRecord(result) &&
    typeof result.id === 'string' && result.id.length > 0 &&
    typeof result.monitorId === 'string' && result.monitorId.length > 0 &&
    ['UP', 'DOWN'].includes(result.status) &&
    Number.isFinite(Date.parse(result.checkedAt)) &&
    (result.httpStatusCode === null || Number.isInteger(result.httpStatusCode)) &&
    (result.responseTimeMs === null ||
      (typeof result.responseTimeMs === 'number' && Number.isFinite(result.responseTimeMs) && result.responseTimeMs >= 0));
}

export function readMonitorsResponse(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.monitors) || !payload.monitors.every(isValidMonitor)) {
    invalidResponse('monitor list');
  }
  return payload.monitors;
}

export function readMonitorResponse(payload) {
  if (!isRecord(payload) || !isValidMonitor(payload.monitor)) invalidResponse('monitor');
  return payload.monitor;
}

export function readCheckHistoryResponse(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.results) || !payload.results.every(isValidCheckResult)) {
    invalidResponse('check history');
  }
  return payload.results;
}

export async function fetchDashboardSnapshot(api) {
  const monitors = readMonitorsResponse(await api.listMonitors());
  const histories = await Promise.all(monitors.map(async monitor => [
    monitor.id,
    readCheckHistoryResponse(await api.getChecks(monitor.id, 50))
  ]));
  return { monitors, checkData: Object.fromEntries(histories) };
}

export function buildResponseTimeChart(results) {
  const points = (Array.isArray(results) ? results : [])
    .filter(result =>
      isRecord(result) &&
      Number.isFinite(Date.parse(result.checkedAt)) &&
      typeof result.responseTimeMs === 'number' &&
      Number.isFinite(result.responseTimeMs) &&
      result.responseTimeMs >= 0
    )
    .map(result => ({ ...result, timestamp: Date.parse(result.checkedAt) }))
    .sort((left, right) => left.timestamp - right.timestamp);

  if (!points.length) return { points: [], line: '' };

  const firstTimestamp = points[0].timestamp;
  const elapsed = points[points.length - 1].timestamp - firstTimestamp;
  const values = points.map(point => point.responseTimeMs);
  const minimum = Math.min(...values);
  const range = Math.max(Math.max(...values) - minimum, 1);
  const chartPoints = points.map(point => ({
    ...point,
    x: elapsed === 0 ? 300 : 18 + ((point.timestamp - firstTimestamp) / elapsed) * 564,
    y: 132 - ((point.responseTimeMs - minimum) / range) * 104
  }));

  return {
    points: chartPoints,
    line: chartPoints.map(point => point.x + ',' + point.y).join(' ')
  };
}
