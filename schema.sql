PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  admin_pin_salt TEXT,
  admin_pin_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS room_sessions (
  token_hash TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'admin')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_room_sessions_room
  ON room_sessions(room_id);

CREATE INDEX IF NOT EXISTS idx_room_sessions_expires
  ON room_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_room_sessions_role
  ON room_sessions(room_id, role);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  conadem TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN ('A', 'B', 'C')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_room_created
  ON participants(room_id, created_at);
