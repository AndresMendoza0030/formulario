const $ = (id) => document.getElementById(id);

const WORK_LABELS = {
  A: "A - Trabajo de investigación",
  B: "B - Monografía",
  C: "C - Caso interesante"
};

let roomId = null;
let accessRole = null;
let sessionToken = null;
let participants = [];
let participantPin = null;
let adminPin = null;
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

function sessionKey(id, role) {
  return `radiologia:session:${id}:${role}`;
}

function lastRoleKey(id) {
  return `radiologia:last-role:${id}`;
}

function participantPinKey(id) {
  return `radiologia:participant-pin:${id}`;
}

function adminPinKey(id) {
  return `radiologia:admin-pin:${id}`;
}

function saveSession(id, session) {
  sessionStorage.setItem(sessionKey(id, session.role), JSON.stringify(session));
  sessionStorage.setItem(lastRoleKey(id), session.role);
}

function readSession(id, role) {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey(id, role)) || "null");
    if (!value?.token || !value?.expiresAt || value?.role !== role) return null;
    if (Date.parse(value.expiresAt) <= Date.now()) return null;
    return value;
  } catch (_) {
    return null;
  }
}

function clearSession(id, role) {
  sessionStorage.removeItem(sessionKey(id, role));
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

function setRoleUI() {
  const isAdmin = accessRole === "admin";

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });

  document.querySelectorAll(".participant-only").forEach((el) => {
    el.classList.toggle("hidden", isAdmin);
  });

  $("roleBadge").textContent = isAdmin ? "Administrador" : "Aspirante";
  $("roleBadge").classList.toggle("admin", isAdmin);

  if (isAdmin) {
    $("accessNoteTitle").textContent = "Acceso administrativo.";
    $("accessNoteText").textContent =
      "Esta sesión puede consultar los datos completos de los aspirantes y exportar el listado.";
    $("privacyRoleText").textContent =
      "Solo una sesión administrativa puede consultar los datos personales y el listado consolidado.";
  } else {
    $("accessNoteTitle").textContent = "Acceso de aspirante.";
    $("accessNoteText").textContent =
      "Puede enviar su información, pero no puede ver los datos de otras personas registradas.";
    $("privacyRoleText").textContent =
      "Su acceso permite enviar información, pero no consultar teléfonos, correos ni otros datos de los demás aspirantes.";
  }
}

async function createRoom() {
  const button = $("createRoomBtn");
  const original = button.innerHTML;

  try {
    button.disabled = true;
    button.textContent = "Creando hoja…";

    const data = await api("/api/rooms", { method: "POST", body: "{}" });

    roomId = data.room.id;
    participantPin = data.room.participantPin;
    adminPin = data.room.adminPin;
    accessRole = "admin";
    sessionToken = data.session.token;

    saveSession(roomId, data.session);
    sessionStorage.setItem(participantPinKey(roomId), participantPin);
    sessionStorage.setItem(adminPinKey(roomId), adminPin);

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

async function accessRoom(id, pin, role, errorTarget) {
  try {
    hideError(errorTarget);

    const data = await api(`/api/rooms/${id}/access`, {
      method: "POST",
      body: JSON.stringify({ pin, role })
    });

    roomId = id;
    accessRole = data.session.role;
    sessionToken = data.session.token;

    saveSession(id, data.session);

    if (accessRole === "admin") {
      adminPin = pin;
      sessionStorage.setItem(adminPinKey(id), pin);
    } else {
      participantPin = pin;
      sessionStorage.setItem(participantPinKey(id), pin);
    }

    history.replaceState(null, "", `#room=${id}`);
    await enterRoom();
  } catch (error) {
    showError(errorTarget, error.message);
  }
}

async function enterRoom() {
  setView("app");
  $("roomCodeLabel").textContent = formatRoomId(roomId);
  setRoleUI();

  if (accessRole === "admin") {
    await loadParticipants();
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

async function loadParticipants({ quiet = false } = {}) {
  if (accessRole !== "admin") return;

  try {
    const data = await api(`/api/rooms/${roomId}/participants`);
    participants = data.participants || [];
    renderParticipants();

    const time = new Date(data.fetchedAt || Date.now());
    $("lastUpdated").textContent =
      `Actualizado ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    hideError("listError");
  } catch (error) {
    if (error.status === 401) {
      clearSession(roomId, accessRole);
      stopAutoRefresh();
      sessionToken = null;
      setView("join");
      $("joinRoomCode").textContent = formatRoomId(roomId);
      $("joinAccessRole").value = accessRole;
      showError("joinError", "La sesión venció. Introduzca nuevamente la clave.");
      return;
    }

    if (error.status === 403) {
      stopAutoRefresh();
      showError("listError", "Esta sesión no tiene permiso para consultar el listado.");
      return;
    }

    if (!quiet) showError("listError", error.message);
  }
}

function startAutoRefresh() {
  stopAutoRefresh();

  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible" && accessRole === "admin") {
      loadParticipants({ quiet: true });
    }
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
  participantPin =
    participantPin || sessionStorage.getItem(participantPinKey(roomId));
  adminPin = adminPin || sessionStorage.getItem(adminPinKey(roomId));

  $("shareRoomCode").value = formatRoomId(roomId);
  $("shareLink").value = roomLink();
  $("shareParticipantPin").value =
    participantPin || "No disponible en esta sesión";
  $("shareAdminPin").value =
    adminPin || "No disponible en esta sesión";

  $("copyInviteBtn").disabled = !participantPin;
  $("copyAdminAccessBtn").disabled = !adminPin;

  $("shareDialog").showModal();
}

$("createRoomBtn").addEventListener("click", createRoom);

$("showExistingBtn").addEventListener("click", () => {
  $("existingRoomPanel").classList.toggle("hidden");

  if (!$("existingRoomPanel").classList.contains("hidden")) {
    $("existingRoomCode").focus();
  }
});

$("existingRoomCode").addEventListener("input", (event) => {
  const cursorAtEnd = event.target.selectionStart === event.target.value.length;
  event.target.value = formatRoomId(event.target.value);

  if (cursorAtEnd) {
    event.target.setSelectionRange(event.target.value.length, event.target.value.length);
  }
});

$("openExistingBtn").addEventListener("click", () => {
  const id = normalizeRoomId($("existingRoomCode").value);
  const pin = $("existingRoomPin").value.replace(/\D/g, "");
  const role = $("existingAccessRole").value;

  if (id.length !== 12) {
    return showError("existingError", "Revise el código de sala.");
  }

  if (pin.length !== 8) {
    return showError("existingError", "La clave debe contener 8 dígitos.");
  }

  accessRoom(id, pin, role, "existingError");
});

$("joinBtn").addEventListener("click", () => {
  const pin = $("pinInput").value.replace(/\D/g, "");
  const role = $("joinAccessRole").value;

  if (pin.length !== 8) {
    return showError("joinError", "La clave debe contener 8 dígitos.");
  }

  accessRoom(roomId, pin, role, "joinError");
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
    $("participantFormCard").classList.add("hidden");
    $("participantSuccess").classList.remove("hidden");
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
  if (!participantPin) return;

  const text =
    `Hoja de registro para incorporación a la Sociedad de Radiología\n\n` +
    `Código de sala: ${formatRoomId(roomId)}\n` +
    `Clave de aspirantes: ${participantPin}\n` +
    `Enlace: ${roomLink()}\n\n` +
    `Ingrese como Aspirante. Esta clave permite enviar el formulario, pero no ver el listado de otras personas.`;

  await navigator.clipboard.writeText(text);
  $("copyInviteBtn").textContent = "Invitación copiada";

  setTimeout(() => {
    $("copyInviteBtn").textContent = "Copiar invitación para aspirantes";
  }, 1600);
});

$("copyAdminAccessBtn").addEventListener("click", async () => {
  if (!adminPin) return;

  const text =
    `Acceso administrativo - Sociedad de Radiología\n\n` +
    `Código de sala: ${formatRoomId(roomId)}\n` +
    `Clave administrativa: ${adminPin}\n` +
    `Enlace: ${roomLink()}\n\n` +
    `Esta clave permite consultar y exportar todos los datos. No compartir con aspirantes.`;

  await navigator.clipboard.writeText(text);
  $("copyAdminAccessBtn").textContent = "Acceso copiado";

  setTimeout(() => {
    $("copyAdminAccessBtn").textContent = "Copiar acceso administrativo";
  }, 1600);
});

$("closeShareBtn").addEventListener("click", () => {
  $("shareDialog").close();
});

$("csvBtn").addEventListener("click", () => {
  if (accessRole !== "admin") return;

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
    .map((row) =>
      row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
    )
    .join("\r\n");

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `registro-radiologia-${formatRoomId(roomId)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
});

$("printBtn").addEventListener("click", () => {
  if (accessRole === "admin") window.print();
});

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    roomId &&
    sessionToken &&
    accessRole === "admin"
  ) {
    loadParticipants({ quiet: true });
  }
});

async function boot() {
  const hashRoom = roomFromHash();

  if (!hashRoom) {
    setView("landing");
    return;
  }

  roomId = hashRoom;

  const rememberedRole =
    sessionStorage.getItem(lastRoleKey(roomId)) || "participant";
  const savedSession = readSession(roomId, rememberedRole);

  if (savedSession) {
    accessRole = savedSession.role;
    sessionToken = savedSession.token;
    participantPin = sessionStorage.getItem(participantPinKey(roomId));
    adminPin = sessionStorage.getItem(adminPinKey(roomId));

    await enterRoom();
    return;
  }

  setView("join");
  $("joinRoomCode").textContent = formatRoomId(roomId);
  $("joinAccessRole").value = "participant";
}

boot();