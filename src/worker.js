const encoder = new TextEncoder();

const SESSION_HOURS = 24;
const PIN_ITERATIONS = 100000;
const WORK_TYPES = new Set(["A", "B", "C"]);
const ACCESS_ROLES = new Set(["participant", "admin"]);
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function randomRoomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let value = "";
  for (const byte of bytes) value += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  return value;
}

function randomPin() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 100000000).padStart(8, "0");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

async function derivePinHash(pin, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PIN_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return toBase64Url(new Uint8Array(bits));
}

function safeEqual(a, b) {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function verifyRoomPin(env, roomId, pin, role) {
  const room = await env.DB.prepare(
    `SELECT id, pin_salt, pin_hash, admin_pin_salt, admin_pin_hash, active
     FROM rooms
     WHERE id = ?1
     LIMIT 1`
  ).bind(roomId).first();

  if (!room || Number(room.active) !== 1) return false;

  const saltText = role === "admin" ? room.admin_pin_salt : room.pin_salt;
  const hashText = role === "admin" ? room.admin_pin_hash : room.pin_hash;

  if (!saltText || !hashText) return false;

  const candidate = await derivePinHash(pin, fromBase64Url(saltText));
  return safeEqual(candidate, hashText);
}

async function issueSession(env, roomId, role) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO room_sessions
     (token_hash, room_id, role, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(tokenHash, roomId, role, createdAt, expiresAt).run();

  return { token, role, expiresAt };
}

async function getSession(request, env, roomId) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();

  return env.DB.prepare(
    `SELECT s.room_id, s.role
     FROM room_sessions s
     INNER JOIN rooms r ON r.id = s.room_id
     WHERE s.token_hash = ?1
       AND s.room_id = ?2
       AND s.expires_at > ?3
       AND r.active = 1
     LIMIT 1`
  ).bind(tokenHash, roomId, now).first();
}

async function cleanupSessions(env) {
  try {
    await env.DB.prepare(
      "DELETE FROM room_sessions WHERE expires_at <= ?1"
    ).bind(new Date().toISOString()).run();
  } catch (_) {}
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Se esperaba contenido JSON.");
  return request.json();
}

function validateParticipant(value) {
  const name = String(value?.name || "").trim();
  const phone = String(value?.phone || "").trim();
  const email = String(value?.email || "").trim().toLowerCase();
  const conadem = String(value?.conadem || "").trim();
  const workType = String(value?.workType || "").trim().toUpperCase();

  if (name.length < 3 || name.length > 120) throw new Error("Revise el nombre completo.");
  if (phone.length < 7 || phone.length > 40) throw new Error("Revise el teléfono.");
  if (email.length < 5 || email.length > 120 || !email.includes("@")) throw new Error("Revise el correo electrónico.");
  if (conadem.length < 1 || conadem.length > 60) throw new Error("Revise el Nro. de CONADEM.");
  if (!WORK_TYPES.has(workType)) throw new Error("Seleccione un tipo de trabajo válido.");

  return { name, phone, email, conadem, workType };
}

async function createRoom(env) {
  await cleanupSessions(env);

  const participantPin = randomPin();
  let adminPin = randomPin();
  while (adminPin === participantPin) adminPin = randomPin();

  const participantSalt = crypto.getRandomValues(new Uint8Array(16));
  const adminSalt = crypto.getRandomValues(new Uint8Array(16));

  const [participantHash, adminHash] = await Promise.all([
    derivePinHash(participantPin, participantSalt),
    derivePinHash(adminPin, adminSalt)
  ]);

  const createdAt = new Date().toISOString();
  let roomId = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomRoomId();
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO rooms
       (id, pin_salt, pin_hash, admin_pin_salt, admin_pin_hash, created_at, updated_at, active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 1)`
    ).bind(
      candidate,
      toBase64Url(participantSalt),
      participantHash,
      toBase64Url(adminSalt),
      adminHash,
      createdAt
    ).run();

    if (Number(result.meta?.changes || 0) > 0) {
      roomId = candidate;
      break;
    }
  }

  if (!roomId) throw new Error("No se pudo crear un código de sala único.");

  const session = await issueSession(env, roomId, "admin");

  return json({
    ok: true,
    room: {
      id: roomId,
      participantPin,
      adminPin,
      createdAt
    },
    session
  }, 201);
}

async function accessRoom(request, env, roomId) {
  await cleanupSessions(env);

  const body = await readJson(request);
  const pin = String(body?.pin || "").replace(/\D/g, "");
  const role = String(body?.role || "participant").trim().toLowerCase();

  if (!ACCESS_ROLES.has(role)) return fail("Tipo de acceso inválido.", 400);
  if (pin.length !== 8) return fail("La clave debe contener 8 dígitos.", 400);

  const valid = await verifyRoomPin(env, roomId, pin, role);
  if (!valid) {
    return fail(
      role === "admin"
        ? "Código de sala o clave administrativa incorrectos."
        : "Código de sala o clave de aspirante incorrectos.",
      401
    );
  }

  const session = await issueSession(env, roomId, role);

  return json({
    ok: true,
    room: { id: roomId },
    session
  });
}

async function listParticipants(request, env, roomId) {
  const session = await getSession(request, env, roomId);

  if (!session) {
    return fail("La sesión de esta sala no es válida o ha vencido.", 401);
  }

  if (session.role !== "admin") {
    return fail("Solo el administrador de la hoja puede consultar el listado completo.", 403);
  }

  const result = await env.DB.prepare(
    `SELECT id, name, phone, email, conadem, work_type AS workType, created_at AS createdAt
     FROM participants
     WHERE room_id = ?1
     ORDER BY created_at ASC`
  ).bind(roomId).all();

  return json({
    ok: true,
    participants: result.results || [],
    fetchedAt: new Date().toISOString()
  });
}

async function addParticipant(request, env, roomId) {
  const session = await getSession(request, env, roomId);

  if (!session) {
    return fail("La sesión de esta sala no es válida o ha vencido.", 401);
  }

  const body = await readJson(request);
  const participant = validateParticipant(body);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO participants
     (id, room_id, name, phone, email, conadem, work_type, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(
    id,
    roomId,
    participant.name,
    participant.phone,
    participant.email,
    participant.conadem,
    participant.workType,
    createdAt
  ).run();

  await env.DB.prepare(
    "UPDATE rooms SET updated_at = ?1 WHERE id = ?2"
  ).bind(createdAt, roomId).run();

  return json({
    ok: true,
    participant: {
      id,
      name: participant.name,
      workType: participant.workType,
      createdAt
    }
  }, 201);
}

async function routeApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/api/health") {
    return json({ ok: true, service: "formulario-radiologia", time: new Date().toISOString() });
  }

  if (request.method === "POST" && path === "/api/rooms") {
    return createRoom(env);
  }

  const accessMatch = path.match(/^\/api\/rooms\/([A-Z2-9]{12})\/access$/);
  if (request.method === "POST" && accessMatch) {
    return accessRoom(request, env, accessMatch[1]);
  }

  const participantsMatch = path.match(/^\/api\/rooms\/([A-Z2-9]{12})\/participants$/);

  if (participantsMatch && request.method === "GET") {
    return listParticipants(request, env, participantsMatch[1]);
  }

  if (participantsMatch && request.method === "POST") {
    return addParticipant(request, env, participantsMatch[1]);
  }

  return fail("Ruta no encontrada.", 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await routeApi(request, env);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return fail(
        error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        500
      );
    }
  }
};
