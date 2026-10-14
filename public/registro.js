import {
  $, roomFromQuery, formatRoom, otherPageLinks, readSession, clearSession,
  sendRequest, unlockRoom, showError, hideError
} from "/participant-common.js";

const room = roomFromQuery();
let session = null;
otherPageLinks(room);
$("roomCode").textContent = formatRoom(room);
$("roomCodeOpen").textContent = formatRoom(room);

function enterRegistration(title) {
  $("roomAccess").classList.add("hidden");
  $("registrationArea").classList.remove("hidden");
  if (title) $("roomTitle").textContent = title;
}

function expiredSession(message) {
  clearSession(room);
  session = null;
  $("registrationArea").classList.add("hidden");
  $("roomAccess").classList.remove("hidden");
  showError("pinError", message);
}

if (room.length !== 12) {
  showError("pinError", "Abra el enlace de invitación para acceder a su sala.");
  $("pinButton").disabled = true;
} else {
  session = readSession(room);
  if (session) enterRegistration();
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
    enterRegistration(result.room?.title);
  } catch (error) {
    showError("pinError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Ingresar";
  }
});

$("registrationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = $("registrationButton");
  try {
    hideError("registrationError");
    button.disabled = true;
    button.textContent = "Guardando…";
    await sendRequest("/api/rooms/" + room + "/participants", "POST", {
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      conadem: String(data.get("conadem") || "").trim(),
      workType: String(data.get("workType") || ""),
      workTitle: String(data.get("workTitle") || "").trim()
    }, session?.token);
    form.reset();
    $("registrationCard").classList.add("hidden");
    $("registrationSuccess").classList.remove("hidden");
  } catch (error) {
    if (error.status === 401) {
      expiredSession("La sesión venció. Ingrese nuevamente la clave de la sala.");
    } else {
      showError("registrationError", error.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = "Guardar registro";
  }
});
