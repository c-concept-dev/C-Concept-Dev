-- Backfill of a migration that was never committed: index.js reads and writes
-- reembed_truncated_log in seven places (the truncated-chunk re-embedding campaign),
-- yet no migration in this repository ever created it. The 0008 -> 0010 numbering gap
-- is exactly where it belonged.
--
-- The table already exists in the live database, where it was created outside of
-- migrations; IF NOT EXISTS makes applying this file there a no-op. The DDL below is
-- transcribed from that live schema, so a fresh database is rebuilt identically.
-- Columns match the INSERT statements in index.js exactly.
CREATE TABLE IF NOT EXISTS reembed_truncated_log (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  old_length INTEGER NOT NULL,
  new_length INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  embedded_at TEXT NOT NULL
);
