const $ = (id) => document.getElementById(id);

const WORK_LABELS = {
  A: "A - Trabajo de investigación",
  B: "B - Monografía",
  C: "C - Caso interesante"
};

let roomId = null;
let roomPin = null;
let sessionToken = null;
let sessionExpiresAt = null;
let participants = [];
let refreshTimer = null;

function normalizeRoomId(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 12);
}

function formatRoomId(value) {
  const clean = normalizeRoomId(value);
  return clean.match(/.{1,4}/g)?.join("-") || clean;
}

function roomFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  return normalizeRoomId(params.get("room"));
}

function roomLink(id = roomId) {
  return `${location.origin}${location.pathname}#room=${encodeURIComponent(id)}`;
}

function sessionKey(id) {
  return `radiologia:session:${id}`;
}

function pinKey(id) {
  return `radiologia:pin:${id}`;
}

function saveSession(id, session, pin = null) {
  sessionStorage.setItem(sessionKey(id), JSON.stringify(session));
  if (pin) sessionStorage.setItem(pinKey(id), pin);
}

function readSession(id) {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey(id)) || "null");
    if (!value?.token || !value?.expiresAt) return null;
    if (Date.parse(value.expiresAt) <= Date.now()) return null;
    return value;
  } catch (_) {
    return null;
  }
}

function clearSession(id) {
  sessionStorage.removeItem(sessionKey(id));
  sessionStorage.removeItem(pinKey(id));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "No se pudo completar la solicitud.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function setView(view) {
  $("landing").classList.toggle("hidden", view !== "landing");
  $("joinCard").classList.toggle("hidden", view !== "join");
  $("app").classList.toggle("hidden", view !== "app");
}

function showError(elementId, message) {
  const el = $(elementId);
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideError(elementId) {
  $(elementId).classList.add("hidden");
}

async function createRoom() {
  const button = $("createRoomBtn");
  const original = button.innerHTML;

  try {
    button.disabled = true;
    button.textContent = "Creando hoja…";

    const data = await api("/api/rooms", { method: "POST", body: "{}" });
    roomId = data.room.id;
    roomPin = data.room.pin;
    sessionToken = data.session.token;
    sessionExpiresAt = data.session.expiresAt;

    saveSession(roomId, data.session, roomPin);
    history.replaceState(null, "", `#room=${roomId}`);

    await enterRoom();
    openShareDialog();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function accessRoom(id, pin, errorTarget) {
  try {
    hideError(errorTarget);

    const data = await api(`/api/rooms/${id}/access`, {
      method: "POST",
      body: JSON.stringify({ pin })
    });

    roomId = id;
    roomPin = pin;
    sessionToken = data.session.token;
    sessionExpiresAt = data.session.expiresAt;

    saveSession(id, data.session, pin);
    history.replaceState(null, "", `#room=${id}`);

    await enterRoom();
  } catch (error) {
    showError(errorTarget, error.message);
  }
}

async function enterRoom() {
  setView("app");
  $("roomCodeLabel").textContent = formatRoomId(roomId);
  await loadParticipants();
  startAutoRefresh();
}

async function loadParticipants({ quiet = false } = {}) {
  try {
    const data = await api(`/api/rooms/${roomId}/participants`);
    participants = data.participants || [];
    renderParticipants();

    const time = new Date(data.fetchedAt || Date.now());
    $("lastUpdated").textContent = `Actualizado ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    hideError("listError");
  } catch (error) {
    if (error.status === 401) {
      clearSession(roomId);
      stopAutoRefresh();
      sessionToken = null;
      setView("join");
      $("joinRoomCode").textContent = formatRoomId(roomId);
      showError("joinError", "La sesión venció. Introduzca nuevamente la clave.");
      return;
    }

    if (!quiet) showError("listError", error.message);
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") loadParticipants({ quiet: true });
  }, 10000);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

function renderParticipants() {
  $("entryCount").textContent = participants.length;
  $("emptyState").classList.toggle("hidden", participants.length > 0);
  $("participantsTable").classList.toggle("hidden", participants.length === 0);

  const body = $("participantsBody");
  body.innerHTML = "";

  participants.forEach((item, index) => {
    const tr = document.createElement("tr");
    const values = [
      index + 1,
      item.name || "—",
      item.phone || "—",
      item.email || "—",
      item.conadem || "—",
      WORK_LABELS[item.workType] || item.workType || "—"
    ];

    values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}

function openShareDialog() {
  $("shareRoomCode").value = formatRoomId(roomId);
  $("shareLink").value = roomLink();
  $("sharePin").value = roomPin || sessionStorage.getItem(pinKey(roomId)) || "Consulte la clave original";
  $("shareDialog").showModal();
}

$("createRoomBtn").addEventListener("click", createRoom);

$("showExistingBtn").addEventListener("click", () => {
  $("existingRoomPanel").classList.toggle("hidden");
  if (!$("existingRoomPanel").classList.contains("hidden")) $("existingRoomCode").focus();
});

$("existingRoomCode").addEventListener("input", (event) => {
  const cursorAtEnd = event.target.selectionStart === event.target.value.length;
  event.target.value = formatRoomId(event.target.value);
  if (cursorAtEnd) event.target.setSelectionRange(event.target.value.length, event.target.value.length);
});

$("openExistingBtn").addEventListener("click", () => {
  const id = normalizeRoomId($("existingRoomCode").value);
  const pin = $("existingRoomPin").value.replace(/\D/g, "");

  if (id.length !== 12) return showError("existingError", "Revise el código de sala.");
  if (pin.length !== 8) return showError("existingError", "La clave debe contener 8 dígitos.");

  accessRoom(id, pin, "existingError");
});

$("joinBtn").addEventListener("click", () => {
  const pin = $("pinInput").value.replace(/\D/g, "");
  if (pin.length !== 8) return showError("joinError", "La clave debe contener 8 dígitos.");
  accessRoom(roomId, pin, "joinError");
});

$("participantForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("submitParticipantBtn");
  const original = button.textContent;
  const form = event.currentTarget;
  const data = new FormData(form);

  const payload = {
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    conadem: String(data.get("conadem") || "").trim(),
    workType: String(data.get("workType") || "").trim()
  };

  try {
    button.disabled = true;
    button.textContent = "Guardando…";

    await api(`/api/rooms/${roomId}/participants`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    form.reset();
    $("formStatus").textContent = "Registro guardado correctamente.";
    $("formStatus").classList.remove("hidden");
    await loadParticipants();

    setTimeout(() => $("formStatus").classList.add("hidden"), 2600);
  } catch (error) {
    $("formStatus").textContent = error.message;
    $("formStatus").classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$("shareBtn").addEventListener("click", openShareDialog);
$("refreshBtn").addEventListener("click", () => loadParticipants());

$("copyInviteBtn").addEventListener("click", async () => {
  const pin = roomPin || sessionStorage.getItem(pinKey(roomId)) || "[clave de acceso]";
  const text =
    `Hoja de registro para incorporación a la Sociedad de Radiología\n\n` +
    `Código de sala: ${formatRoomId(roomId)}\n` +
    `Clave: ${pin}\n` +
    `Enlace: ${roomLink()}\n\n` +
    `Conserve el código y la clave para volver a consultar la hoja.`;

  await navigator.clipboard.writeText(text);
  $("copyInviteBtn").textContent = "Invitación copiada";
  setTimeout(() => $("copyInviteBtn").textContent = "Copiar invitación", 1500);
});

$("csvBtn").addEventListener("click", () => {
  const rows = [
    ["Nombre completo", "Teléfono", "Correo electrónico", "Nro. de CONADEM", "Tipo de trabajo"],
    ...participants.map((item) => [
      item.name || "",
      item.phone || "",
      item.email || "",
      item.conadem || "",
      WORK_LABELS[item.workType] || item.workType || ""
    ])
  ];

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `registro-radiologia-${formatRoomId(roomId)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

$("printBtn").addEventListener("click", () => window.print());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && roomId && sessionToken) loadParticipants({ quiet: true });
});

async function boot() {
  const hashRoom = roomFromHash();

  if (!hashRoom) {
    setView("landing");
    return;
  }

  roomId = hashRoom;
  const savedSession = readSession(roomId);
  roomPin = sessionStorage.getItem(pinKey(roomId));

  if (savedSession) {
    sessionToken = savedSession.token;
    sessionExpiresAt = savedSession.expiresAt;

    try {
      await enterRoom();
      return;
    } catch (_) {
      clearSession(roomId);
    }
  }

  setView("join");
  $("joinRoomCode").textContent = formatRoomId(roomId);
}

boot();
