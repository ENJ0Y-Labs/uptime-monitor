const MAX_MONITORS_PER_RUN = 25;

function rowToMonitor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    intervalMinutes: row.interval_minutes,
    timeoutSeconds: row.timeout_seconds,
    expectedStatus: row.expected_status,
    enabled: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextCheckAt: row.next_check_at,
    lastCheckedAt: row.last_checked_at
  };
}

export async function listMonitors(db, { activeOnly = false } = {}) {
  const query = activeOnly
    ? "SELECT * FROM monitors WHERE is_active = 1 ORDER BY created_at DESC"
    : "SELECT * FROM monitors ORDER BY created_at DESC";
  const { results = [] } = await db.prepare(query).all();
  return results.map(rowToMonitor);
}

export async function getMonitor(db, id) {
  const row = await db.prepare("SELECT * FROM monitors WHERE id = ?").bind(id).first();
  return rowToMonitor(row);
}

export async function createMonitor(db, monitor, now = new Date().toISOString()) {
  await db.prepare(`
    INSERT INTO monitors
      (id, name, url, interval_minutes, timeout_seconds, expected_status, is_active,
       created_at, updated_at, next_check_at, last_checked_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)
  `).bind(
    monitor.id, monitor.name, monitor.url, monitor.intervalMinutes,
    monitor.timeoutSeconds, monitor.expectedStatus, now, now, now
  ).run();
  return getMonitor(db, monitor.id);
}

export async function updateMonitor(db, id, monitor, now = new Date().toISOString()) {
  await db.prepare(`
    UPDATE monitors
    SET name = ?, url = ?, interval_minutes = ?, timeout_seconds = ?,
        expected_status = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    monitor.name, monitor.url, monitor.intervalMinutes, monitor.timeoutSeconds,
    monitor.expectedStatus, now, id
  ).run();
  return getMonitor(db, id);
}

export async function setMonitorActive(db, id, active, now = new Date().toISOString()) {
  await db.prepare(`
    UPDATE monitors SET is_active = ?, updated_at = ?,
      next_check_at = CASE WHEN ? = 1 THEN ? ELSE next_check_at END
    WHERE id = ?
  `).bind(active ? 1 : 0, now, active ? 1 : 0, now, id).run();
  return getMonitor(db, id);
}

export async function deleteMonitor(db, id) {
  const result = await db.prepare("DELETE FROM monitors WHERE id = ?").bind(id).run();
  return result.meta?.changes > 0;
}

export async function listCheckResults(db, monitorId, limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const { results = [] } = await db.prepare(`
    SELECT id, monitor_id AS monitorId, status,
      http_status_code AS httpStatusCode,
      response_time_ms AS responseTimeMs,
      checked_at AS checkedAt,
      error_category AS errorCategory,
      error_message AS errorMessage
    FROM check_results
    WHERE monitor_id = ?
    ORDER BY checked_at DESC
    LIMIT ?
  `).bind(monitorId, safeLimit).all();
  return results;
}

export async function claimDueMonitors(db, now = new Date().toISOString()) {
  const { results = [] } = await db.prepare(`
    SELECT id FROM monitors
    WHERE is_active = 1 AND next_check_at <= ?
    ORDER BY next_check_at ASC
    LIMIT ?
  `).bind(now, MAX_MONITORS_PER_RUN).all();

  const claimed = [];
  for (const candidate of results) {
    const row = await db.prepare(`
      UPDATE monitors
      SET next_check_at = strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || interval_minutes || ' minutes')
      WHERE id = ? AND is_active = 1 AND next_check_at <= ?
      RETURNING *
    `).bind(now, candidate.id, now).first();
    if (row) claimed.push(rowToMonitor(row));
  }
  return claimed;
}

export async function saveCheckResult(db, result) {
  const id = crypto.randomUUID();
  const statements = [
    db.prepare(`
      INSERT INTO check_results
        (id, monitor_id, status, http_status_code, response_time_ms,
         checked_at, error_category, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, result.monitorId, result.status, result.httpStatusCode,
      result.responseTimeMs, result.checkedAt, result.errorCategory,
      result.errorMessage
    ),
    db.prepare("UPDATE monitors SET last_checked_at = ? WHERE id = ?")
      .bind(result.checkedAt, result.monitorId)
  ];
  await db.batch(statements);
  return { id, ...result };
}
