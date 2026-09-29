import { joinRoom } from 'https://esm.run/trystero';

const APP_ID = 'sala-privada-registro-v1-2026';
const BACKUP_KIND = 'sociedad-radiologia-encrypted-backup';
const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 180000;

const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const landing = $('landing');
const joinCard = $('joinCard');
const app = $('app');
const shareDialog = $('shareDialog');
const restoreDialog = $('restoreDialog');

let room = null;
let roomId = null;
let roomPin = null;
let peers = new Set();
let entries = new Map();
let syncAction = null;
let entryAction = null;
let isCustodian = false;
let pendingRestoreBackup = null;
let vaultWriteChain = Promise.resolve();

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomPin() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 100000000).padStart(8, '0');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveEncryptionKey(pin, id, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${APP_ID}|${id}|${pin}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptRecords(records, pin, id) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(pin, id, salt);
  const plaintext = encoder.encode(JSON.stringify(records));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    version: VAULT_VERSION,
    roomId: id,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    updatedAt: Date.now(),
    entryCount: records.length
  };
}

async function decryptRecords(vault, pin, id) {
  if (!vault || vault.version !== VAULT_VERSION || vault.roomId !== id) {
    throw new Error('El respaldo no corresponde a esta sala.');
  }

  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const ciphertext = base64ToBytes(vault.ciphertext);
  const key = await deriveEncryptionKey(pin, id, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const parsed = JSON.parse(decoder.decode(decrypted));

  if (!Array.isArray(parsed)) throw new Error('El contenido del respaldo no es válido.');
  return parsed;
}

function roomFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  return params.get('room');
}

function roomLink(id = roomId) {
  return `${location.origin}${location.pathname}#room=${encodeURIComponent(id)}`;
}

function legacyEntriesKey() {
  return `sala-privada:${roomId}:entries`;
}

function pinKey(id = roomId) {
  return `sala-privada:${id}:pin`;
}

function vaultStorageKey(id = roomId) {
  return `sala-privada:${id}:vault-v1`;
}

function custodianKey(id = roomId) {
  return `sala-privada:${id}:custodian`;
}

function exportRevisionKey(id = roomId) {
  return `sala-privada:${id}:export-revision`;
}

function currentRevision() {
  return [...entries.values()]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((item) => `${item.id}:${item.updatedAt || 0}`)
    .join('|');
}

function hasUnexportedChanges() {
  if (!roomId || entries.size === 0) return false;
  return localStorage.getItem(exportRevisionKey()) !== currentRevision();
}

function updateBackupUI() {
  if (!roomId || !app || app.classList.contains('hidden')) return;

  const localStatus = $('localBackupStatus');
  const exportStatus = $('exportBackupStatus');
  const warning = $('backupWarning');
  const custodianBadge = $('custodianBadge');

  custodianBadge.classList.toggle('hidden', !isCustodian);

  const localVault = localStorage.getItem(vaultStorageKey());
  if (localVault) {
    localStatus.classList.add('ok');
    localStatus.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v6h8V4M8 16h8"></path></svg>
      Copia local cifrada activa
    `;
  } else {
    localStatus.classList.remove('ok');
    localStatus.textContent = 'Preparando copia local…';
  }

  const pending = hasUnexportedChanges();

  if (entries.size === 0) {
    exportStatus.className = 'status-chip';
    exportStatus.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m8 11 4 4 4-4"></path><path d="M5 20h14"></path></svg>
      Sin registros todavía
    `;
  } else if (pending) {
    exportStatus.className = 'status-chip pending';
    exportStatus.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m8 11 4 4 4-4"></path><path d="M5 20h14"></path></svg>
      Respaldo descargable pendiente
    `;
  } else {
    exportStatus.className = 'status-chip ok';
    exportStatus.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"></path></svg>
      Respaldo descargado y actualizado
    `;
  }

  warning.classList.toggle('hidden', !(isCustodian && pending));
}

async function persistEncryptedLocalCopy(snapshot = [...entries.values()]) {
  if (!roomId || !roomPin) return;

  const vault = await encryptRecords(snapshot, roomPin, roomId);
  localStorage.setItem(vaultStorageKey(), JSON.stringify(vault));
  localStorage.removeItem(legacyEntriesKey());
  updateBackupUI();
}

function queueEncryptedLocalCopy() {
  const snapshot = [...entries.values()];
  vaultWriteChain = vaultWriteChain
    .catch(() => {})
    .then(() => persistEncryptedLocalCopy(snapshot))
    .catch((error) => console.error('No se pudo guardar la copia cifrada local:', error));

  return vaultWriteChain;
}

async function loadLocalEntries() {
  entries = new Map();

  const encryptedVault = localStorage.getItem(vaultStorageKey());

  if (encryptedVault) {
    try {
      const vault = JSON.parse(encryptedVault);
      const records = await decryptRecords(vault, roomPin, roomId);
      for (const item of records) {
        if (item && item.id) entries.set(item.id, item);
      }
    } catch (error) {
      throw new Error('La clave no puede descifrar la copia local guardada en este navegador.');
    }
  } else {
    try {
      const legacy = JSON.parse(localStorage.getItem(legacyEntriesKey()) || '[]');
      for (const item of legacy) {
        if (item && item.id) entries.set(item.id, item);
      }

      if (entries.size > 0) await persistEncryptedLocalCopy([...entries.values()]);
    } catch (_) {}
  }

  renderEntries();
  updateBackupUI();
}

async function mergeEntries(incoming = []) {
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
    renderEntries();
    updateBackupUI();
    await queueEncryptedLocalCopy();
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

  updateBackupUI();
}

function updatePeers() {
  $('peerCount').textContent = peers.size + 1;
}

async function connect(id, pin) {
  roomId = id;
  roomPin = pin;

  sessionStorage.setItem(pinKey(), pin);
  localStorage.removeItem(pinKey());
  isCustodian = localStorage.getItem(custodianKey()) === '1';

  await loadLocalEntries();

  room = joinRoom({ appId: APP_ID, password: pin }, roomId);
  syncAction = room.makeAction('sync-state');
  entryAction = room.makeAction('new-entry');

  syncAction.onMessage = async (data) => {
    if (Array.isArray(data)) await mergeEntries(data);
  };

  entryAction.onMessage = async (data) => {
    if (data && data.id) await mergeEntries([data]);
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
  updateBackupUI();
}

async function downloadEncryptedBackup() {
  if (!roomId || !roomPin) return;

  const vault = await encryptRecords([...entries.values()], roomPin, roomId);
  const backup = {
    kind: BACKUP_KIND,
    version: 1,
    roomId,
    createdAt: new Date().toISOString(),
    entryCount: entries.size,
    vault
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  a.href = url;
  a.download = `respaldo-radiologia-${stamp}.srbackup`;
  a.click();

  URL.revokeObjectURL(url);
  localStorage.setItem(exportRevisionKey(), currentRevision());
  updateBackupUI();
}

function validateBackupObject(value) {
  return Boolean(
    value &&
    value.kind === BACKUP_KIND &&
    value.version === 1 &&
    typeof value.roomId === 'string' &&
    value.vault &&
    value.vault.roomId === value.roomId
  );
}

function showRestoreDialog(backup) {
  pendingRestoreBackup = backup;
  $('restorePinInput').value = '';
  $('restoreError').classList.add('hidden');
  $('restoreFileSummary').innerHTML = `
    <strong>Respaldo encontrado</strong>
    <span>${Number(backup.entryCount || backup.vault?.entryCount || 0)} registro(s) · Sala ${backup.roomId.slice(0, 8)}…</span>
  `;
  restoreDialog.showModal();
  setTimeout(() => $('restorePinInput').focus(), 50);
}

async function handleBackupFile(file) {
  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    if (!validateBackupObject(backup)) {
      throw new Error('El archivo seleccionado no es un respaldo válido de esta aplicación.');
    }

    showRestoreDialog(backup);
  } catch (error) {
    alert(error.message || 'No se pudo leer el archivo de respaldo.');
  } finally {
    $('backupFileInput').value = '';
  }
}

async function confirmRestore() {
  const pin = $('restorePinInput').value.replace(/\D/g, '');

  if (pin.length !== 8) {
    $('restoreError').textContent = 'La clave debe contener 8 dígitos.';
    $('restoreError').classList.remove('hidden');
    return;
  }

  if (!pendingRestoreBackup) return;

  try {
    const records = await decryptRecords(
      pendingRestoreBackup.vault,
      pin,
      pendingRestoreBackup.roomId
    );

    const targetRoomId = pendingRestoreBackup.roomId;
    localStorage.setItem(custodianKey(targetRoomId), '1');

    if (roomId && roomId !== targetRoomId) {
      throw new Error('Este respaldo pertenece a otra sala. Vuelva al inicio para restaurarlo.');
    }

    if (!roomId) {
      history.replaceState(null, '', `#room=${targetRoomId}`);
      restoreDialog.close();
      await connect(targetRoomId, pin);
    } else if (roomPin !== pin) {
      throw new Error('La clave del respaldo no coincide con la clave de la sala abierta.');
    }

    isCustodian = true;
    await mergeEntries(records);
    localStorage.setItem(exportRevisionKey(), currentRevision());
    updateBackupUI();

    restoreDialog.close();
    pendingRestoreBackup = null;

    $('formStatus').textContent = 'Respaldo restaurado correctamente.';
    $('formStatus').classList.remove('hidden');
    setTimeout(() => $('formStatus').classList.add('hidden'), 3200);
  } catch (error) {
    $('restoreError').textContent =
      error.name === 'OperationError'
        ? 'No se pudo descifrar el respaldo. Verifique la clave de la sala.'
        : error.message || 'No se pudo restaurar el respaldo.';
    $('restoreError').classList.remove('hidden');
  }
}

$('createRoomBtn').addEventListener('click', async () => {
  const id = randomHex(16);
  const pin = randomPin();

  localStorage.setItem(custodianKey(id), '1');
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

  try {
    $('joinError').classList.add('hidden');
    await connect(roomFromHash(), pin);
  } catch (error) {
    $('joinError').textContent = error.message || 'No se pudo abrir la sala.';
    $('joinError').classList.remove('hidden');
  }
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

  await mergeEntries([entry]);
  entryAction?.send(entry).catch(() => {});
  event.currentTarget.reset();

  $('formStatus').textContent = 'Registro incorporado y guardado localmente.';
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
    `Clave de acceso: ${roomPin}\n\n` +
    `Importante: conserve el enlace y la clave para poder volver a abrir la sala.`;

  await navigator.clipboard.writeText(text);
  $('copyInviteBtn').textContent = 'Invitación copiada';
  setTimeout(() => $('copyInviteBtn').textContent = 'Copiar invitación', 1600);
});

$('downloadBackupBtn').addEventListener('click', async () => {
  const button = $('downloadBackupBtn');
  const original = button.innerHTML;

  try {
    button.disabled = true;
    button.textContent = 'Preparando respaldo…';
    await downloadEncryptedBackup();
    button.textContent = 'Respaldo descargado';
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.innerHTML = original;
    }, 1400);
  }
});

$('restoreBackupBtn').addEventListener('click', () => $('backupFileInput').click());
$('landingRestoreBtn').addEventListener('click', () => $('backupFileInput').click());

$('backupFileInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (file) await handleBackupFile(file);
});

$('confirmRestoreBtn').addEventListener('click', confirmRestore);

$('cancelRestoreBtn').addEventListener('click', () => {
  pendingRestoreBackup = null;
  restoreDialog.close();
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

window.addEventListener('beforeunload', (event) => {
  if (isCustodian && hasUnexportedChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && roomId && roomPin && entries.size > 0) {
    queueEncryptedLocalCopy();
  }
});

const initialRoom = roomFromHash();

if (initialRoom) {
  landing.classList.add('hidden');
  const remembered = sessionStorage.getItem(pinKey(initialRoom));

  if (remembered) {
    connect(initialRoom, remembered).catch(() => {
      joinCard.classList.remove('hidden');
    });
  } else {
    joinCard.classList.remove('hidden');
  }
}
