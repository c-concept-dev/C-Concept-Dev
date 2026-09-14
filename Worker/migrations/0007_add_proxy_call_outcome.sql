-- Appliquer avant le nouveau Worker. Les anciennes lignes restent honnêtement indéterminées.
ALTER TABLE proxy_call_log ADD COLUMN outcome TEXT NOT NULL DEFAULT 'legacy_unknown'
  CHECK (outcome IN ('legacy_unknown', 'success', 'error', 'interruption'));
ALTER TABLE proxy_call_log ADD COLUMN termination_reason TEXT NOT NULL DEFAULT 'legacy_unknown'
  CHECK (termination_reason IN ('legacy_unknown', 'fetch_error', 'upstream_eof',
    'upstream_read_error', 'downstream_cancel', 'upstream_body_error',
    'http_body_complete', 'http_error'));
