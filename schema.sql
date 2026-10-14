PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  title TEXT NOT NULL DEFAULT 'Incorporación a la Sociedad de Radiología',
  participant_pin TEXT,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner
  ON rooms(owner_user_id);

CREATE TABLE IF NOT EXISTS room_sessions (
  token_hash TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_room_sessions_room
  ON room_sessions(room_id);

CREATE INDEX IF NOT EXISTS idx_room_sessions_expires
  ON room_sessions(expires_at);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  conadem TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN ('A', 'B', 'C')),
  work_title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_room_created
  ON participants(room_id, created_at);

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
