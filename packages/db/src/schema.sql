CREATE TABLE IF NOT EXISTS charge_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('plug', 'unplug')),
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'collector',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);