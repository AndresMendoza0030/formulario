-- Migración a cuentas administrativas persistentes.
-- Ejecutar UNA sola vez sobre la D1 existente.

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user
  ON admin_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON admin_sessions(expires_at);

ALTER TABLE rooms ADD COLUMN owner_user_id TEXT;
ALTER TABLE rooms ADD COLUMN title TEXT NOT NULL DEFAULT 'Incorporación a la Sociedad de Radiología';
ALTER TABLE rooms ADD COLUMN participant_pin TEXT;

CREATE INDEX IF NOT EXISTS idx_rooms_owner
  ON rooms(owner_user_id);
