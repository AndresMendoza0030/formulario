const $ = (id) => document.getElementById(id);

const WORK_LABELS = {
  A: "A - Trabajo de investigación",
  B: "B - Monografía",
  C: "C - Caso interesante"
};

let adminUser = null;
let adminRooms = [];
let currentAdminRoom = null;
let adminParticipants = [];
let participantRoomId = null;
let participantSessionToken = null;
let participantRoomTitle = "Incorporación a la Sociedad de Radiología";

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

function roomLink(id) {
  return `${location.origin}${location.pathname}#room=${encodeURIComponent(id)}`;
}

function participantSessionKey(id) {
  return `radiologia:participant-session:${id}`;
}

function saveParticipantSession(id, session) {
  sessionStorage.setItem(participantSessionKey(id), JSON.stringify(session));
}

function readParticipantSession(id) {
  try {
    const value = JSON.parse(sessionStorage.getItem(participantSessionKey(id)) || "null");
    if (!value?.token || !value?.expiresAt) return null;
    if (Date.parse(value.expiresAt) <= Date.now()) return null;
    return value;
  } catch (_) {
    return null;
  }
}

function showOnly(sectionId) {
  [
    "landing",
    "adminAuth",
    "adminDashboard",
    "adminRoom",
    "participantJoin",
    "participantApp"
  ].forEach((id) => $(id).classList.toggle("hidden", id !== sectionId));
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideError(id) {
  $(id).classList.add("hidden");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
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

async function participantApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(participantSessionToken ? { authorization: `Bearer ${participantSessionToken}` } : {}),
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

async function loadAdminProfile() {
  try {
    const data = await api("/api/admin/me");
    adminUser = data.user;
    return true;
  } catch (_) {
    adminUser = null;
    return false;
  }
}

function renderAdminIdentity() {
  $("adminUserName").textContent = adminUser?.name || "";
  $("adminUserEmail").textContent = adminUser?.email || "";
}

async function showDashboard() {
  history.replaceState(null, "", location.pathname);
  showOnly("adminDashboard");
  renderAdminIdentity();
  await loadAdminRooms();
}

async function loadAdminRooms() {
  try {
    const data = await api("/api/admin/rooms");
    adminRooms = data.rooms || [];
    renderRooms();
  } catch (error) {
    if (error.status === 401) {
      adminUser = null;
      showAdminAuth("login");
      return;
    }
    alert(error.message);
  }
}

function renderRooms() {
  const grid = $("roomsGrid");
  grid.innerHTML = "";
  $("roomsEmpty").classList.toggle("hidden", adminRooms.length > 0);

  adminRooms.forEach((room) => {
    const card = document.createElement("article");
    card.className = "room-card";

    const created = new Date(room.createdAt);
    const updated = new Date(room.updatedAt);

    card.innerHTML = `
      <div class="room-card-top">
        <div>
          <div class="eyebrow">Hoja de registro</div>
          <h3></h3>
        </div>
        <span class="room-count">${Number(room.participantCount || 0)} registro(s)</span>
      </div>
      <div class="room-meta">
        <span><strong>Código:</strong> ${formatRoomId(room.id)}</span>
        <span><strong>Clave aspirante:</strong> ${room.participantPin || "No disponible"}</span>
        <span><strong>Creada:</strong> ${created.toLocaleDateString()}</span>
        <span><strong>Último cambio:</strong> ${updated.toLocaleString()}</span>
      </div>
      <div class="room-card-actions">
        <button class="primary open-room-btn">Abrir hoja</button>
        <button class="secondary share-room-btn">Compartir</button>
      </div>
    `;

    card.querySelector("h3").textContent = room.title || "Hoja de registro";
    card.querySelector(".open-room-btn").addEventListener("click", () => openAdminRoom(room.id));
    card.querySelector(".share-room-btn").addEventListener("click", () => {
      currentAdminRoom = room;
      openShareDialog();
    });

    grid.appendChild(card);
  });
}

function showAdminAuth(mode = "login") {
  showOnly("adminAuth");
  $("loginBox").classList.toggle("hidden", mode !== "login");
  $("registerBox").classList.toggle("hidden", mode !== "register");
  hideError("adminLoginError");
  hideError("adminRegisterError");
}

async function registerAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  try {
    hideError("adminRegisterError");

    const result = await api("/api/admin/register", {
      method: "POST",
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      })
    });

    adminUser = result.user;
    form.reset();
    await showDashboard();
  } catch (error) {
    showError("adminRegisterError", error.message);
  }
}

async function loginAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  try {
    hideError("adminLoginError");

    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      })
    });

    adminUser = result.user;
    form.reset();
    await showDashboard();
  } catch (error) {
    showError("adminLoginError", error.message);
  }
}

async function logoutAdmin() {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
  } catch (_) {}

  adminUser = null;
  adminRooms = [];
  currentAdminRoom = null;
  history.replaceState(null, "", location.pathname);
  showOnly("landing");
}

async function createAdminRoom() {
  const title = $("newRoomTitle").value.trim() || "Incorporación a la Sociedad de Radiología";
  const button = $("confirmCreateRoomBtn");
  const original = button.textContent;

  try {
    hideError("createRoomError");
    button.disabled = true;
    button.textContent = "Creando…";

    const data = await api("/api/admin/rooms", {
      method: "POST",
      body: JSON.stringify({ title })
    });

    $("newRoomPanel").classList.add("hidden");
    await loadAdminRooms();

    currentAdminRoom = data.room;
    openShareDialog();
  } catch (error) {
    showError("createRoomError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function openAdminRoom(roomId) {
  try {
    const data = await api(`/api/admin/rooms/${roomId}/participants`);

    currentAdminRoom = data.room;
    adminParticipants = data.participants || [];

    $("adminRoomTitle").textContent = currentAdminRoom.title || "Hoja de registro";
    $("adminRoomCode").textContent = formatRoomId(roomId);

    const time = new Date(data.fetchedAt || Date.now());
    $("adminRoomUpdated").textContent = `Actualizado ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    renderAdminParticipants();
    showOnly("adminRoom");
  } catch (error) {
    if (error.status === 401) {
      adminUser = null;
      showAdminAuth("login");
      return;
    }

    alert(error.message);
  }
}

function renderAdminParticipants() {
  $("entryCount").textContent = adminParticipants.length;
  $("emptyState").classList.toggle("hidden", adminParticipants.length > 0);
  $("participantsTable").classList.toggle("hidden", adminParticipants.length === 0);

  const body = $("participantsBody");
  body.innerHTML = "";

  adminParticipants.forEach((item, index) => {
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
  if (!currentAdminRoom) return;

  $("shareRoomCode").value = formatRoomId(currentAdminRoom.id);
  $("shareParticipantPin").value = currentAdminRoom.participantPin || "No disponible";
  $("shareLink").value = roomLink(currentAdminRoom.id);
  $("shareDialog").showModal();
}

async function resetParticipantPin() {
  if (!currentAdminRoom) return;

  const confirmed = confirm(
    "La clave anterior dejará de funcionar. ¿Desea generar una nueva clave para aspirantes?"
  );

  if (!confirmed) return;

  try {
    const data = await api(`/api/admin/rooms/${currentAdminRoom.id}/reset-pin`, {
      method: "POST",
      body: "{}"
    });

    currentAdminRoom.participantPin = data.participantPin;
    $("shareParticipantPin").value = data.participantPin;

    const listedRoom = adminRooms.find((room) => room.id === currentAdminRoom.id);
    if (listedRoom) listedRoom.participantPin = data.participantPin;
  } catch (error) {
    alert(error.message);
  }
}

async function copyParticipantInvite() {
  if (!currentAdminRoom?.participantPin) return;

  const text =
    `${currentAdminRoom.title || "Hoja de registro"}\n\n` +
    `Código de sala: ${formatRoomId(currentAdminRoom.id)}\n` +
    `Clave: ${currentAdminRoom.participantPin}\n` +
    `Enlace: ${roomLink(currentAdminRoom.id)}\n\n` +
    `Este acceso es únicamente para completar el formulario.`;

  await navigator.clipboard.writeText(text);

  const button = $("copyParticipantInviteBtn");
  button.textContent = "Invitación copiada";
  setTimeout(() => (button.textContent = "Copiar invitación"), 1400);
}

async function accessParticipant(roomId, pin, errorTarget) {
  try {
    hideError(errorTarget);

    const data = await participantApi(`/api/rooms/${roomId}/access`, {
      method: "POST",
      body: JSON.stringify({ pin })
    });

    participantRoomId = roomId;
    participantSessionToken = data.session.token;
    participantRoomTitle = data.room?.title || "Incorporación a la Sociedad de Radiología";

    saveParticipantSession(roomId, data.session);
    history.replaceState(null, "", `#room=${roomId}`);
    showParticipantForm();
  } catch (error) {
    showError(errorTarget, error.message);
  }
}

function showParticipantForm() {
  showOnly("participantApp");
  $("participantRoomCode").textContent = formatRoomId(participantRoomId);
  $("participantRoomTitle").textContent = participantRoomTitle;
  $("participantSuccess").classList.add("hidden");
  $("participantForm").closest(".form-card").classList.remove("hidden");
}

async function submitParticipant(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);
  const button = $("participantSubmitBtn");
  const original = button.textContent;

  try {
    hideError("participantFormError");
    button.disabled = true;
    button.textContent = "Guardando…";

    await participantApi(`/api/rooms/${participantRoomId}/participants`, {
      method: "POST",
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        email: String(data.get("email") || "").trim(),
        conadem: String(data.get("conadem") || "").trim(),
        workType: String(data.get("workType") || "").trim()
      })
    });

    form.reset();
    form.closest(".form-card").classList.add("hidden");
    $("participantSuccess").classList.remove("hidden");
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(participantSessionKey(participantRoomId));
      participantSessionToken = null;
      showOnly("participantJoin");
      $("participantJoinCode").textContent = formatRoomId(participantRoomId);
      showError("participantJoinError", "La sesión venció. Introduzca nuevamente la clave.");
      return;
    }

    showError("participantFormError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function exportCsv() {
  if (!currentAdminRoom) return;

  const rows = [
    ["Nombre completo", "Teléfono", "Correo electrónico", "Nro. de CONADEM", "Tipo de trabajo"],
    ...adminParticipants.map((item) => [
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
  a.download = `registro-radiologia-${formatRoomId(currentAdminRoom.id)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

$("showAdminLoginBtn").addEventListener("click", () => showAdminAuth("login"));

$("showParticipantAccessBtn").addEventListener("click", () => {
  $("participantManualPanel").classList.toggle("hidden");
});

$("manualRoomCode").addEventListener("input", (event) => {
  event.target.value = formatRoomId(event.target.value);
});

$("manualParticipantEnterBtn").addEventListener("click", () => {
  const id = normalizeRoomId($("manualRoomCode").value);
  const pin = $("manualRoomPin").value.replace(/\D/g, "");

  if (id.length !== 12) return showError("manualParticipantError", "Revise el código de sala.");
  if (pin.length !== 8) return showError("manualParticipantError", "La clave debe tener 8 dígitos.");

  accessParticipant(id, pin, "manualParticipantError");
});

$("showRegisterBtn").addEventListener("click", () => showAdminAuth("register"));
$("showLoginBtn").addEventListener("click", () => showAdminAuth("login"));
$("backFromAuthBtn").addEventListener("click", () => showOnly("landing"));

$("adminRegisterForm").addEventListener("submit", registerAdmin);
$("adminLoginForm").addEventListener("submit", loginAdmin);
$("logoutBtn").addEventListener("click", logoutAdmin);

$("newRoomBtn").addEventListener("click", () => {
  $("newRoomPanel").classList.toggle("hidden");
});

$("confirmCreateRoomBtn").addEventListener("click", createAdminRoom);
$("reloadRoomsBtn").addEventListener("click", loadAdminRooms);

$("backToDashboardBtn").addEventListener("click", showDashboard);
$("shareParticipantBtn").addEventListener("click", openShareDialog);
$("refreshParticipantsBtn").addEventListener("click", () => openAdminRoom(currentAdminRoom.id));

$("copyParticipantInviteBtn").addEventListener("click", copyParticipantInvite);
$("resetParticipantPinBtn").addEventListener("click", resetParticipantPin);
$("closeShareDialogBtn").addEventListener("click", () => $("shareDialog").close());

$("participantJoinBtn").addEventListener("click", () => {
  const pin = $("participantJoinPin").value.replace(/\D/g, "");
  if (pin.length !== 8) return showError("participantJoinError", "La clave debe tener 8 dígitos.");
  accessParticipant(participantRoomId, pin, "participantJoinError");
});

$("participantForm").addEventListener("submit", submitParticipant);
$("csvBtn").addEventListener("click", exportCsv);
$("printBtn").addEventListener("click", () => window.print());

async function boot() {
  const hashRoom = roomFromHash();

  if (hashRoom) {
    participantRoomId = hashRoom;
    const session = readParticipantSession(hashRoom);

    if (session) {
      participantSessionToken = session.token;
      showParticipantForm();
      return;
    }

    $("participantJoinCode").textContent = formatRoomId(hashRoom);
    showOnly("participantJoin");
    return;
  }

  const loggedIn = await loadAdminProfile();

  if (loggedIn) {
    await showDashboard();
  } else {
    showOnly("landing");
  }
}

boot();