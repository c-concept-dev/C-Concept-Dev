-- Journalisation permanente de l'appel Worker -> Anthropic identifié comme "appel 2"
-- (génération structurée forcée via handleAnthropicProxy, cf. studio-clinique.html
-- ADOC_CALL2_TRANSPORT_TIMEOUT_MS / ADOC_CALL2_SEMANTIC_TIMEOUT_MS_EXPERIMENTAL).
-- Une ligne par appel, écrite en une seule fois une fois tous les timestamps connus
-- (succès ou erreur) — jamais de ligne à moitié écrite. Corrélation via anthropic_request_id.
CREATE TABLE IF NOT EXISTS proxy_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anthropic_request_id TEXT,
  received_at TEXT NOT NULL,
  sent_at TEXT,
  headers_received_at TEXT,
  closed_at TEXT,
  http_status INTEGER
);

CREATE INDEX IF NOT EXISTS idx_proxy_call_log_request_id ON proxy_call_log(anthropic_request_id);
