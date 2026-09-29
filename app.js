import { joinRoom } from 'https://esm.run/trystero';

const APP_ID = 'sala-privada-registro-v1-2026';
const $ = (id) => document.getElementById(id);

const landing = $('landing');
const joinCard = $('joinCard');
const app = $('app');
const shareDialog = $('shareDialog');

let room = null;
let roomId = null;
let roomPin = null;
let peers = new Set();
let entries = new Map();
let syncAction = null;
let entryAction = null;

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomPin() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 100000000).padStart(8, '0');
}

function roomFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  return params.get('room');
}

function roomLink(id = roomId) {
  return `${location.origin}${location.pathname}#room=${encodeURIComponent(id)}`;
}

function storageKey() {
  return `sala-privada:${roomId}:entries`;
}

function pinKey() {
  return `sala-privada:${roomId}:pin`;
}

function loadLocalEntries() {
  entries = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || '[]');
    for (const item of saved) {
      if (item && item.id) entries.set(item.id, item);
    }
  } catch (_) {}
  renderEntries();
}

function saveLocalEntries() {
  localStorage.setItem(storageKey(), JSON.stringify([...entries.values()]));
}

function mergeEntries(incoming = []) {
  let changed = false;
  for (const item of incoming) {
    if (!item || !item.id) continue;
    const current = entries.get(item.id);
    if (!current || Number(item.updatedAt || 0) > Number(current.updatedAt || 0)) {
      entries.set(item.id, item);
      changed = true;
    }
  }
  if (changed) {
    saveLocalEntries();
    renderEntries();
  }
}

function renderEntries() {
  const items = [...entries.values()].sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  $('entryCount').textContent = items.length;
  $('emptyState').classList.toggle('hidden', items.length > 0);
  $('participantsTable').classList.toggle('hidden', items.length === 0);
  $('participantsBody').innerHTML = '';

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    const values = [
      index + 1,
      item.name || '—',
      item.phone || '—',
      item.email || '—',
      item.conadem || '—',
      item.workType || '—'
    ];

    values.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });

    $('participantsBody').appendChild(tr);
  });
}

function updatePeers() {
  $('peerCount').textContent = peers.size + 1;
}

async function connect(id, pin) {
  roomId = id;
  roomPin = pin;
  localStorage.setItem(pinKey(), pin);
  loadLocalEntries();

  room = joinRoom({ appId: APP_ID, password: pin }, roomId);
  syncAction = room.makeAction('sync-state');
  entryAction = room.makeAction('new-entry');

  syncAction.onMessage = (data) => {
    if (Array.isArray(data)) mergeEntries(data);
  };

  entryAction.onMessage = (data) => {
    if (data && data.id) mergeEntries([data]);
  };

  room.onPeerJoin = (peerId) => {
    peers.add(peerId);
    updatePeers();
    syncAction.send([...entries.values()], { target: peerId }).catch(() => {});
  };

  room.onPeerLeave = (peerId) => {
    peers.delete(peerId);
    updatePeers();
  };

  landing.classList.add('hidden');
  joinCard.classList.add('hidden');
  app.classList.remove('hidden');
  updatePeers();

  $('shareLink').value = roomLink();
  $('sharePin').value = roomPin;
}

$('createRoomBtn').addEventListener('click', async () => {
  const id = randomHex(16);
  const pin = randomPin();
  history.replaceState(null, '', `#room=${id}`);
  await connect(id, pin);
  shareDialog.showModal();
});

$('joinBtn').addEventListener('click', async () => {
  const pin = $('pinInput').value.replace(/\D/g, '');

  if (pin.length !== 8) {
    $('joinError').textContent = 'La clave debe contener 8 dígitos.';
    $('joinError').classList.remove('hidden');
    return;
  }

  $('joinError').classList.add('hidden');
  await connect(roomFromHash(), pin);
});

$('participantForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const data = new FormData(event.currentTarget);
  const name = String(data.get('name') || '').trim();
  const phone = String(data.get('phone') || '').trim();
  const email = String(data.get('email') || '').trim();
  const conadem = String(data.get('conadem') || '').trim();
  const workType = String(data.get('workType') || '').trim();

  if (!name || !phone || !email || !conadem || !workType) return;

  const now = Date.now();
  const entry = {
    id: `${now}-${randomHex(6)}`,
    name,
    phone,
    email,
    conadem,
    workType,
    createdAt: now,
    updatedAt: now
  };

  mergeEntries([entry]);
  entryAction?.send(entry).catch(() => {});
  event.currentTarget.reset();

  $('formStatus').textContent = 'Registro incorporado correctamente.';
  $('formStatus').classList.remove('hidden');
  setTimeout(() => $('formStatus').classList.add('hidden'), 2600);
});

$('shareBtn').addEventListener('click', () => shareDialog.showModal());

$('copyLinkBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(roomLink());
  $('copyLinkBtn').textContent = 'Enlace copiado';
  setTimeout(() => $('copyLinkBtn').textContent = 'Copiar enlace', 1600);
});

$('copyInviteBtn').addEventListener('click', async () => {
  const text =
    `Hoja de registro para incorporación a la Sociedad de Radiología\n` +
    `${roomLink()}\n` +
    `Clave de acceso: ${roomPin}`;

  await navigator.clipboard.writeText(text);
  $('copyInviteBtn').textContent = 'Invitación copiada';
  setTimeout(() => $('copyInviteBtn').textContent = 'Copiar invitación', 1600);
});

$('csvBtn').addEventListener('click', () => {
  const items = [...entries.values()].sort((a, b) => Number(a.createdAt) - Number(b.createdAt));

  const rows = [
    ['Nombre completo', 'Teléfono', 'Correo electrónico', 'Nro. de CONADEM', 'Tipo de trabajo'],
    ...items.map((x) => [
      x.name || '',
      x.phone || '',
      x.email || '',
      x.conadem || '',
      x.workType || ''
    ])
  ];

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registro-radiologia-${roomId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

$('printBtn').addEventListener('click', () => window.print());

const initialRoom = roomFromHash();

if (initialRoom) {
  landing.classList.add('hidden');
  const remembered = localStorage.getItem(`sala-privada:${initialRoom}:pin`);

  if (remembered) {
    connect(initialRoom, remembered);
  } else {
    joinCard.classList.remove('hidden');
  }
}
