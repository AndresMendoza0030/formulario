-- Tokens de verificación de correo y sesiones de edición individuales.
-- Ejecutar una sola vez sobre D1 ya existente antes del nuevo Worker.
CREATE TABLE IF NOT EXISTS participant_edit_codes (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edit_codes_room_email ON participant_edit_codes(room_id, email);
CREATE INDEX IF NOT EXISTS idx_edit_codes_expiry ON participant_edit_codes(expires_at);

CREATE TABLE IF NOT EXISTS participant_edit_sessions (
  token_hash TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_edit_sessions_expiry ON participant_edit_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_edit_sessions_participant ON participant_edit_sessions(participant_id);
