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
let pendingParticipantAction = "new";
let participantEditToken = null;
let participantEditEmail = "";

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

  $("navHomeLink").setAttribute("aria-current", sectionId === "landing" ? "page" : "false");
  $("adminNavBtn").setAttribute("aria-current", sectionId.startsWith("admin") ? "page" : "false");
}

function goHome(event) {
  event.preventDefault();
  history.replaceState(null, "", location.pathname + location.search);
  showOnly("landing");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openAdminNavigation() {
  if (adminUser || await loadAdminProfile()) {
    await showDashboard();
  } else {
    showAdminAuth("login");
  }
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
      WORK_LABELS[item.workType] || item.workType || "—",
      item.workTitle || "—"
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
    `Enlace: ${roomLink(currentAdminRoom.id)}`;

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
    if (pendingParticipantAction === "edit") selectParticipantAction("edit");
    pendingParticipantAction = "new";
  } catch (error) {
    showError(errorTarget, error.message);
  }
}

function showParticipantForm() {
  showOnly("participantApp");
  $("participantRoomCode").textContent = formatRoomId(participantRoomId);
  $("participantRoomTitle").textContent = participantRoomTitle;
  $("participantSuccess").classList.add("hidden");
  $("participantActionChooser").classList.remove("hidden");
  $("participantForm").reset();
  resetParticipantEditor();
  $("participantUpdateSuccess").classList.add("hidden");
  hideError("participantUpdateError");
  hideError("participantFormError");
  selectParticipantAction("new", false);
}

function selectParticipantAction(action, focus = true) {
  const edit = action === "edit";
  $("participantNewCard").classList.toggle("hidden", edit);
  $("participantUpdateCard").classList.toggle("hidden", !edit);
  $("participantNewChoiceBtn").setAttribute("aria-pressed", String(!edit));
  $("participantEditChoiceBtn").setAttribute("aria-pressed", String(edit));
  hideError("participantUpdateError");
  hideError("participantFormError");
  if (focus) {
    const firstInput = edit
      ? $("participantEditEmailForm").querySelector('input[name="email"]')
      : $("participantForm").querySelector('input[name="name"]');
    firstInput.focus({ preventScroll: true });
    (edit ? $("participantUpdateCard") : $("participantNewCard"))
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
        workType: String(data.get("workType") || "").trim(),
        workTitle: String(data.get("workTitle") || "").trim()
      })
    });

    form.reset();
    $("participantNewCard").classList.add("hidden");
    $("participantUpdateCard").classList.add("hidden");
    $("participantActionChooser").classList.add("hidden");
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


function resetParticipantEditor() {
  participantEditToken = null;
  participantEditEmail = "";
  $("participantEditEmailForm").reset();
  $("participantEditCodeForm").reset();
  $("participantUpdateForm").reset();
  $("participantEditEmailForm").classList.remove("hidden");
  $("participantEditCodeForm").classList.add("hidden");
  $("participantUpdateForm").classList.add("hidden");
  $("participantUpdateSuccess").classList.add("hidden");
  hideError("participantUpdateError");
}

function fillParticipantEditForm(participant) {
  const form = $("participantUpdateForm");
  for (const field of ["name", "phone", "email", "conadem", "workTitle"]) {
    const input = form.elements.namedItem(field);
    input.value = participant[field] || "";
  }
  const choice = form.querySelector('input[name="workType"][value="' + participant.workType + '"]');
  if (choice) choice.checked = true;
}

async function requestParticipantEditCode(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "").trim();
  const button = $("participantSendCodeBtn");
  const label = button.textContent;

  try {
    hideError("participantUpdateError");
    button.disabled = true;
    button.textContent = "Enviando…";
    await participantApi("/api/rooms/" + participantRoomId + "/edit/start", {
      method: "POST", body: JSON.stringify({ email })
    });
    participantEditEmail = email;
    $("participantEditCodeForm").reset();
    $("participantEditEmailForm").classList.add("hidden");
    $("participantEditCodeForm").classList.remove("hidden");
    $("participantEditCodeForm").querySelector('input[name="code"]').focus();
  } catch (error) {
    showError("participantUpdateError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function verifyParticipantEditCode(event) {
  event.preventDefault();
  const code = String(new FormData(event.currentTarget).get("code") || "").trim();
  const button = $("participantVerifyCodeBtn");
  const label = button.textContent;

  try {
    hideError("participantUpdateError");
    button.disabled = true;
    button.textContent = "Verificando…";
    const data = await participantApi("/api/rooms/" + participantRoomId + "/edit/verify", {
      method: "POST",
      body: JSON.stringify({ email: participantEditEmail, code })
    });
    participantEditToken = data.editToken;
    fillParticipantEditForm(data.participant);
    $("participantEditCodeForm").classList.add("hidden");
    $("participantUpdateForm").classList.remove("hidden");
  } catch (error) {
    showError("participantUpdateError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function submitParticipantUpdate(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = $("participantUpdateSubmitBtn");
  const label = button.textContent;

  try {
    hideError("participantUpdateError");
    $("participantUpdateSuccess").classList.add("hidden");
    button.disabled = true;
    button.textContent = "Guardando…";
    const result = await participantApi("/api/rooms/" + participantRoomId + "/edit", {
      method: "PUT",
      headers: { "x-edit-token": participantEditToken || "" },
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        email: String(data.get("email") || "").trim(),
        conadem: String(data.get("conadem") || "").trim(),
        workType: String(data.get("workType") || "").trim(),
        workTitle: String(data.get("workTitle") || "").trim()
      })
    });
    fillParticipantEditForm(result.participant);
    $("participantUpdateSuccess").classList.remove("hidden");
  } catch (error) {
    if (error.status === 401) {
      resetParticipantEditor();
      showError("participantUpdateError", "Su acceso venció. Solicite un nuevo código.");
    } else {
      showError("participantUpdateError", error.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function exportCsv() {
  if (!currentAdminRoom) return;

  const rows = [
    ["Nombre completo", "Teléfono", "Correo electrónico", "Nro. de CONADEM", "Tipo de trabajo", "Título del trabajo"],
    ...adminParticipants.map((item) => [
      item.name || "",
      item.phone || "",
      item.email || "",
      item.conadem || "",
      WORK_LABELS[item.workType] || item.workType || "",
      item.workTitle || ""
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

document.querySelectorAll("[data-home-link]").forEach((link) => link.addEventListener("click", goHome));
$("adminNavBtn").addEventListener("click", openAdminNavigation);

$("showAdminLoginBtn").addEventListener("click", openAdminNavigation);

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

function chooseJoinAction(action) {
  pendingParticipantAction = action;
  $("joinNewChoiceBtn").setAttribute("aria-pressed", String(action === "new"));
  $("joinEditChoiceBtn").setAttribute("aria-pressed", String(action === "edit"));
}
$("joinNewChoiceBtn").addEventListener("click", () => chooseJoinAction("new"));
$("joinEditChoiceBtn").addEventListener("click", () => chooseJoinAction("edit"));

$("participantJoinBtn").addEventListener("click", () => {
  const pin = $("participantJoinPin").value.replace(/\D/g, "");
  if (pin.length !== 8) return showError("participantJoinError", "La clave debe tener 8 dígitos.");
  accessParticipant(participantRoomId, pin, "participantJoinError");
});

$("participantForm").addEventListener("submit", submitParticipant);
$("participantNewChoiceBtn").addEventListener("click", () => selectParticipantAction("new"));
$("participantEditChoiceBtn").addEventListener("click", () => selectParticipantAction("edit"));
$("participantEditEmailForm").addEventListener("submit", requestParticipantEditCode);
$("participantEditCodeForm").addEventListener("submit", verifyParticipantEditCode);
$("participantEditBackBtn").addEventListener("click", resetParticipantEditor);
$("participantUpdateForm").addEventListener("submit", submitParticipantUpdate);
$("csvBtn").addEventListener("click", exportCsv);
$("printBtn").addEventListener("click", () => window.print());

async function boot() {
  const hashRoom = roomFromHash();

  if (hashRoom) {
    participantRoomId = hashRoom;
    pendingParticipantAction = "new";
    chooseJoinAction("new");
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