export const $ = (id) => document.getElementById(id);

export function roomFromQuery() {
  return String(new URLSearchParams(location.search).get("room") || "")
    .toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 12);
}

export function formatRoom(id) {
  return String(id || "").match(/.{1,4}/g)?.join("-") || "";
}

export function otherPageLinks(room) {
  document.querySelectorAll("[data-room-link]").forEach((link) => {
    const base = link.getAttribute("data-room-link");
    link.href = base + (room ? "?room=" + encodeURIComponent(room) : "");
  });
}

export function showError(target, message) {
  const el = $(target);
  el.textContent = message;
  el.classList.remove("hidden");
}

export function hideError(target) {
  $(target).classList.add("hidden");
}

function sessionKey(room) {
  return "radiologia:participant-session:" + room;
}

export function readSession(room) {
  try {
    const data = JSON.parse(sessionStorage.getItem(sessionKey(room)) || "null");
    if (!data?.token || Date.parse(data.expiresAt) <= Date.now()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function clearSession(room) {
  sessionStorage.removeItem(sessionKey(room));
}

export async function sendRequest(url, method = "GET", data = null, token = null) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(data !== null ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: "Bearer " + token } : {})
    },
    ...(data !== null ? { body: JSON.stringify(data) } : {})
  });
  const content = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(content.error || "No fue posible completar la solicitud.");
    error.status = res.status;
    throw error;
  }
  return content;
}

export async function unlockRoom(room, pin) {
  const result = await sendRequest(
    "/api/rooms/" + room + "/access", "POST", { pin }
  );
  sessionStorage.setItem(sessionKey(room), JSON.stringify(result.session));
  return result;
}
