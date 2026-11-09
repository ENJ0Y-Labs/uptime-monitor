CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes IN (1, 5, 10, 20, 30)),
  timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 30),
  expected_status INTEGER NOT NULL CHECK (expected_status BETWEEN 100 AND 599),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  next_check_at TEXT NOT NULL,
  last_checked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitors_due
  ON monitors (is_active, next_check_at);

CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('UP', 'DOWN')),
  http_status_code INTEGER,
  response_time_ms INTEGER CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  checked_at TEXT NOT NULL,
  error_category TEXT,
  error_message TEXT,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_check_results_monitor_checked_at
  ON check_results (monitor_id, checked_at DESC);
