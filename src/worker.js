const encoder = new TextEncoder();

const PARTICIPANT_SESSION_HOURS = 24;
const ADMIN_SESSION_DAYS = 30;
const HASH_ITERATIONS = 100000;
const WORK_TYPES = new Set(["A", "B", "C"]);
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders
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

async function deriveHash(secret, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: HASH_ITERATIONS,
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return email.length >= 5 && email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const result = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }

  return result;
}

function adminCookie(request, token, maxAgeSeconds) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearAdminCookie(request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

async function cleanupSessions(env) {
  const now = new Date().toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM room_sessions WHERE expires_at <= ?1").bind(now),
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?1").bind(now)
    ]);
  } catch (_) {}
}

async function issueAdminSession(request, env, userId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO admin_sessions
     (token_hash, user_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(tokenHash, userId, createdAt, expiresAt).run();

  return {
    expiresAt,
    cookie: adminCookie(request, token, ADMIN_SESSION_DAYS * 24 * 60 * 60)
  };
}

async function getAdmin(request, env) {
  const token = parseCookies(request).admin_session;
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();

  return env.DB.prepare(
    `SELECT u.id, u.name, u.email
     FROM admin_sessions s
     INNER JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = ?1
       AND s.expires_at > ?2
     LIMIT 1`
  ).bind(tokenHash, now).first();
}

async function requireAdmin(request, env) {
  const admin = await getAdmin(request, env);
  if (!admin) return null;
  return admin;
}

async function issueParticipantSession(env, roomId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PARTICIPANT_SESSION_HOURS * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO room_sessions
     (token_hash, room_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(tokenHash, roomId, createdAt, expiresAt).run();

  return { token, expiresAt };
}

async function getParticipantSession(request, env, roomId) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();

  return env.DB.prepare(
    `SELECT s.room_id
     FROM room_sessions s
     INNER JOIN rooms r ON r.id = s.room_id
     WHERE s.token_hash = ?1
       AND s.room_id = ?2
       AND s.expires_at > ?3
       AND r.active = 1
     LIMIT 1`
  ).bind(tokenHash, roomId, now).first();
}

async function verifyParticipantPin(env, roomId, pin) {
  const room = await env.DB.prepare(
    `SELECT id, participant_pin, pin_salt, pin_hash, active
     FROM rooms
     WHERE id = ?1
     LIMIT 1`
  ).bind(roomId).first();

  if (!room || Number(room.active) !== 1) return false;

  if (room.participant_pin) {
    return safeEqual(String(pin), String(room.participant_pin));
  }

  if (!room.pin_salt || !room.pin_hash) return false;

  const candidate = await deriveHash(pin, fromBase64Url(room.pin_salt));
  return safeEqual(candidate, room.pin_hash);
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Se esperaba contenido JSON.");
  return request.json();
}

function validateParticipant(value) {
  const name = String(value?.name || "").trim();
  const phone = String(value?.phone || "").trim();
  const email = normalizeEmail(value?.email);
  const conadem = String(value?.conadem || "").trim();
  const workType = String(value?.workType || "").trim().toUpperCase();

  if (name.length < 3 || name.length > 120) throw new Error("Revise el nombre completo.");
  if (phone.length < 7 || phone.length > 40) throw new Error("Revise el teléfono.");
  if (!validateEmail(email) || email.length > 120) throw new Error("Revise el correo electrónico.");
  if (conadem.length < 1 || conadem.length > 60) throw new Error("Revise el Nro. de CONADEM.");
  if (!WORK_TYPES.has(workType)) throw new Error("Seleccione un tipo de trabajo válido.");

  return { name, phone, email, conadem, workType };
}

async function registerAdmin(request, env) {
  await cleanupSessions(env);
  const body = await readJson(request);

  const name = String(body?.name || "").trim();
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");

  if (name.length < 2 || name.length > 100) return fail("Revise el nombre.", 400);
  if (!validateEmail(email)) return fail("Revise el correo electrónico.", 400);
  if (password.length < 8 || password.length > 128) {
    return fail("La contraseña debe tener al menos 8 caracteres.", 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM admin_users WHERE email = ?1 LIMIT 1"
  ).bind(email).first();

  if (existing) return fail("Ya existe una cuenta administrativa con ese correo.", 409);

  const userId = crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await deriveHash(password, salt);
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO admin_users
     (id, name, email, password_salt, password_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(
    userId,
    name,
    email,
    toBase64Url(salt),
    passwordHash,
    createdAt
  ).run();

  const session = await issueAdminSession(request, env, userId);

  return json(
    { ok: true, user: { id: userId, name, email } },
    201,
    { "set-cookie": session.cookie }
  );
}

async function loginAdmin(request, env) {
  await cleanupSessions(env);
  const body = await readJson(request);

  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");

  if (!validateEmail(email) || !password) {
    return fail("Correo o contraseña incorrectos.", 401);
  }

  const user = await env.DB.prepare(
    `SELECT id, name, email, password_salt, password_hash
     FROM admin_users
     WHERE email = ?1
     LIMIT 1`
  ).bind(email).first();

  if (!user) return fail("Correo o contraseña incorrectos.", 401);

  const candidate = await deriveHash(password, fromBase64Url(user.password_salt));
  if (!safeEqual(candidate, user.password_hash)) {
    return fail("Correo o contraseña incorrectos.", 401);
  }

  const session = await issueAdminSession(request, env, user.id);

  return json(
    { ok: true, user: { id: user.id, name: user.name, email: user.email } },
    200,
    { "set-cookie": session.cookie }
  );
}

async function logoutAdmin(request, env) {
  const token = parseCookies(request).admin_session;

  if (token) {
    try {
      const tokenHash = await sha256(token);
      await env.DB.prepare(
        "DELETE FROM admin_sessions WHERE token_hash = ?1"
      ).bind(tokenHash).run();
    } catch (_) {}
  }

  return json(
    { ok: true },
    200,
    { "set-cookie": clearAdminCookie(request) }
  );
}

async function getAdminProfile(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return fail("Debe iniciar sesión como administrador.", 401);

  return json({ ok: true, user: admin });
}

async function listAdminRooms(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return fail("Debe iniciar sesión como administrador.", 401);

  const result = await env.DB.prepare(
    `SELECT
       r.id,
       r.title,
       r.participant_pin AS participantPin,
       r.created_at AS createdAt,
       r.updated_at AS updatedAt,
       r.active,
       COUNT(p.id) AS participantCount
     FROM rooms r
     LEFT JOIN participants p ON p.room_id = r.id
     WHERE r.owner_user_id = ?1
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  ).bind(admin.id).all();

  return json({ ok: true, rooms: result.results || [] });
}

async function createAdminRoom(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return fail("Debe iniciar sesión como administrador.", 401);

  const body = await readJson(request);
  const title = String(body?.title || "Incorporación a la Sociedad de Radiología").trim().slice(0, 140);

  const participantPin = randomPin();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await deriveHash(participantPin, salt);
  const createdAt = new Date().toISOString();

  let roomId = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomRoomId();
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO rooms
       (id, owner_user_id, title, participant_pin, pin_salt, pin_hash, created_at, updated_at, active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 1)`
    ).bind(
      candidate,
      admin.id,
      title || "Incorporación a la Sociedad de Radiología",
      participantPin,
      toBase64Url(salt),
      pinHash,
      createdAt
    ).run();

    if (Number(result.meta?.changes || 0) > 0) {
      roomId = candidate;
      break;
    }
  }

  if (!roomId) throw new Error("No se pudo crear un código de sala único.");

  return json({
    ok: true,
    room: {
      id: roomId,
      title,
      participantPin,
      createdAt,
      participantCount: 0
    }
  }, 201);
}

async function getOwnedRoom(env, roomId, ownerUserId) {
  return env.DB.prepare(
    `SELECT id, title, participant_pin AS participantPin, created_at AS createdAt,
            updated_at AS updatedAt, active
     FROM rooms
     WHERE id = ?1 AND owner_user_id = ?2
     LIMIT 1`
  ).bind(roomId, ownerUserId).first();
}

async function listAdminParticipants(request, env, roomId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return fail("Debe iniciar sesión como administrador.", 401);

  const room = await getOwnedRoom(env, roomId, admin.id);
  if (!room) return fail("No tiene acceso administrativo a esta hoja.", 403);

  const result = await env.DB.prepare(
    `SELECT id, name, phone, email, conadem, work_type AS workType, created_at AS createdAt
     FROM participants
     WHERE room_id = ?1
     ORDER BY created_at ASC`
  ).bind(roomId).all();

  return json({
    ok: true,
    room,
    participants: result.results || [],
    fetchedAt: new Date().toISOString()
  });
}

async function resetParticipantPin(request, env, roomId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return fail("Debe iniciar sesión como administrador.", 401);

  const room = await getOwnedRoom(env, roomId, admin.id);
  if (!room) return fail("No tiene acceso administrativo a esta hoja.", 403);

  const participantPin = randomPin();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await deriveHash(participantPin, salt);
  const updatedAt = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE rooms
     SET participant_pin = ?1, pin_salt = ?2, pin_hash = ?3, updated_at = ?4
     WHERE id = ?5 AND owner_user_id = ?6`
  ).bind(
    participantPin,
    toBase64Url(salt),
    pinHash,
    updatedAt,
    roomId,
    admin.id
  ).run();

  return json({ ok: true, participantPin, updatedAt });
}

async function accessParticipantRoom(request, env, roomId) {
  await cleanupSessions(env);

  const body = await readJson(request);
  const pin = String(body?.pin || "").replace(/\D/g, "");

  if (pin.length !== 8) return fail("La clave debe contener 8 dígitos.", 400);

  const valid = await verifyParticipantPin(env, roomId, pin);
  if (!valid) return fail("Código de sala o clave incorrectos.", 401);

  const session = await issueParticipantSession(env, roomId);
  const room = await env.DB.prepare(
    "SELECT id, title FROM rooms WHERE id = ?1 LIMIT 1"
  ).bind(roomId).first();

  return json({ ok: true, room, session });
}

async function addParticipant(request, env, roomId) {
  const session = await getParticipantSession(request, env, roomId);
  if (!session) return fail("La sesión de esta sala no es válida o ha vencido.", 401);

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

  if (request.method === "POST" && path === "/api/admin/register") {
    return registerAdmin(request, env);
  }

  if (request.method === "POST" && path === "/api/admin/login") {
    return loginAdmin(request, env);
  }

  if (request.method === "POST" && path === "/api/admin/logout") {
    return logoutAdmin(request, env);
  }

  if (request.method === "GET" && path === "/api/admin/me") {
    return getAdminProfile(request, env);
  }

  if (request.method === "GET" && path === "/api/admin/rooms") {
    return listAdminRooms(request, env);
  }

  if (request.method === "POST" && path === "/api/admin/rooms") {
    return createAdminRoom(request, env);
  }

  const adminParticipantsMatch = path.match(/^\/api\/admin\/rooms\/([A-Z2-9]{12})\/participants$/);
  if (request.method === "GET" && adminParticipantsMatch) {
    return listAdminParticipants(request, env, adminParticipantsMatch[1]);
  }

  const resetPinMatch = path.match(/^\/api\/admin\/rooms\/([A-Z2-9]{12})\/reset-pin$/);
  if (request.method === "POST" && resetPinMatch) {
    return resetParticipantPin(request, env, resetPinMatch[1]);
  }

  const accessMatch = path.match(/^\/api\/rooms\/([A-Z2-9]{12})\/access$/);
  if (request.method === "POST" && accessMatch) {
    return accessParticipantRoom(request, env, accessMatch[1]);
  }

  const participantSubmitMatch = path.match(/^\/api\/rooms\/([A-Z2-9]{12})\/participants$/);
  if (request.method === "POST" && participantSubmitMatch) {
    return addParticipant(request, env, participantSubmitMatch[1]);
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
