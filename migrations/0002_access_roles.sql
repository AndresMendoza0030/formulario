-- Ejecutar UNA sola vez sobre una base creada con la versión anterior.

ALTER TABLE rooms ADD COLUMN admin_pin_salt TEXT;
ALTER TABLE rooms ADD COLUMN admin_pin_hash TEXT;

ALTER TABLE room_sessions
  ADD COLUMN role TEXT NOT NULL DEFAULT 'participant'
  CHECK (role IN ('participant', 'admin'));

CREATE INDEX IF NOT EXISTS idx_room_sessions_role
  ON room_sessions(room_id, role);
