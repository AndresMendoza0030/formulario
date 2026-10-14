import {
  $, roomFromQuery, formatRoom, otherPageLinks, readSession, clearSession,
  sendRequest, unlockRoom, showError, hideError
} from "/participant-common.js";

const room = roomFromQuery();
let session = null;
let original = null;
otherPageLinks(room);
$("roomCode").textContent = formatRoom(room);
$("roomCodeOpen").textContent = formatRoom(room);

function enterUpdate(title) {
  $("roomAccess").classList.add("hidden");
  $("updateArea").classList.remove("hidden");
  if (title) $("roomTitle").textContent = title;
}

function expiredSession(message) {
  clearSession(room);
  session = null;
  original = null;
  $("editCard").classList.add("hidden");
  $("updateArea").classList.add("hidden");
  $("roomAccess").classList.remove("hidden");
  showError("pinError", message);
}

function fillEditFields(participant) {
  const form = $("editForm");
  for (const field of ["name", "phone", "email", "conadem", "workTitle"]) {
    form.elements.namedItem(field).value = participant[field] || "";
  }
  for (const radio of form.querySelectorAll('input[name="workType"]')) {
    radio.checked = radio.value === participant.workType;
  }
}

if (room.length !== 12) {
  showError("pinError", "Abra el enlace de invitación para acceder a su sala.");
  $("pinButton").disabled = true;
} else {
  session = readSession(room);
  if (session) enterUpdate();
}

$("pinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("pinButton");
  const pin = String(new FormData(event.currentTarget).get("pin") || "").replace(/\D/g, "");
  try {
    hideError("pinError");
    button.disabled = true;
    button.textContent = "Ingresando…";
    const result = await unlockRoom(room, pin);
    session = result.session;
    enterUpdate(result.room?.title);
  } catch (error) {
    showError("pinError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Ingresar";
  }
});

$("lookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = String(data.get("email") || "").trim();
  const conadem = String(data.get("conadem") || "").trim();
  const button = $("lookupButton");

  original = null;
  $("editCard").classList.add("hidden");
  $("editForm").reset();
  try {
    hideError("lookupError");
    hideError("editError");
    $("editSuccess").classList.add("hidden");
    button.disabled = true;
    button.textContent = "Buscando…";
    const result = await sendRequest("/api/rooms/" + room + "/edit/lookup", "POST",
      { email, conadem }, session?.token);
    original = { email, conadem };
    fillEditFields(result.participant);
    $("editCard").classList.remove("hidden");
    $("editCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error.status === 401) {
      expiredSession("La sesión venció. Ingrese nuevamente la clave de la sala.");
    } else {
      showError("lookupError", error.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = "Buscar mi registro";
  }
});

$("editForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!original) return showError("editError", "Primero busque su registro.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = $("editButton");
  try {
    hideError("editError");
    $("editSuccess").classList.add("hidden");
    button.disabled = true;
    button.textContent = "Guardando…";
    const result = await sendRequest("/api/rooms/" + room + "/edit", "PUT", {
      originalEmail: original.email,
      originalConadem: original.conadem,
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      conadem: String(data.get("conadem") || "").trim(),
      workType: String(data.get("workType") || ""),
      workTitle: String(data.get("workTitle") || "").trim()
    }, session?.token);

    original = { email: result.participant.email, conadem: result.participant.conadem };
    const lookup = $("lookupForm");
    lookup.elements.namedItem("email").value = original.email;
    lookup.elements.namedItem("conadem").value = original.conadem;
    fillEditFields(result.participant);
    $("editSuccess").classList.remove("hidden");
  } catch (error) {
    if (error.status === 401) {
      expiredSession("La sesión venció. Ingrese nuevamente la clave de la sala.");
    } else {
      showError("editError", error.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = "Guardar cambios";
  }
});
