function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Lozanor App')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Límites para evitar payloads enormes (pueden cortar la respuesta en google.script.run)
const LIMITS = {
  MAX_ROWS_PER_SHEET: 2000, // incluye header
  MAX_COLS_PER_SHEET: 40
};

/** Ventanas de lectura (evitar cargar toda la base en cada refresh). */
const DATA_SCOPES = {
  /** Agenda: desde el 1/1 del año actual (no solo N días atrás). */
  AGENDA_FROM_YEAR_START: true,
  AGENDA_DAYS_FUTURE: 120,
  FINANCE_MONTHS_BACK: 6,
  /** Historial: año actual; años previos se cargan a demanda (visitsYear). */
  HISTORY_FROM_YEAR_START: true,
  REQUESTS_MONTHS_BACK: 12
};

/** Permisos configurables para rol ADMIN2 (admin secundario). */
const ADMIN2_PERMISSION_KEYS = [
  'AGENDA', 'SOLICITUDES', 'PENDIENTES', 'CLIENTES', 'FINANZAS', 'HISTORIAL', 'NOTAS', 'RECOMENDADOR'
];

/**
 * CONFIG:
 * - Si este Apps Script NO está vinculado (container-bound) a tu Google Sheet,
 *   SpreadsheetApp.getActiveSpreadsheet() puede devolver null en el WebApp.
 * - En ese caso, pegá acá el ID del spreadsheet (lo sacás del URL).
 *   Ej: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
 */
const CONFIG = {
  SPREADSHEET_ID: '1lFpxmaCuF4ySL_PaUbV9yqo8s7k5CRS3-zCrgyVmBfk', // <-- ID del spreadsheet (standalone)
  /**
   * Google Calendar (secundario recomendado "Lozanor"):
   * 1) Creá un calendario nuevo en calendar.google.com (misma cuenta que ejecuta el Web App / guarda datos).
   * 2) Configuración del calendario > Integrar calendario > ID de calendario (termina en @group.calendar.google.com o similar).
   * 3) Pegá ese ID acá. Si lo dejás vacío, no se sincroniza nada.
   * 4) Ejecutá una vez desde el editor: testLozanorCalendarAccess() y aceptá permisos de Calendar.
   * Ver bloque "PASOS MANUALES" al final de este archivo.
   */
  GOOGLE_CALENDAR_ID: 'b79f9a95b3e4138367fe1a4d58b43f457883038fb62023c3d26f63f51772b2e3@group.calendar.google.com',
  /** Prefijo del título en Google Calendar; se arma como "Prefijo: Nombre del cliente". */
  LOZANOR_CALENDAR_EVENT_TITLE: 'Lozanor',
  /** Duración por defecto de cada bloque (minutos). */
  CALENDAR_EVENT_DURATION_MINUTES: 30,
  /** Años completos que quedan en la hoja Visits (actual + anterior = 2). Más viejos van a Visits_AAAA. */
  VISIT_ARCHIVE_ACTIVE_YEARS: 2,
  // Opcional: clave de Gemini (sino se usa Propiedad del proyecto "GEMINI_API_KEY"). Obtenerla en https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: '',
  // Proveedor de IA: 'groq' (por defecto) o 'gemini'. Groq = Llama 3.3 70B, menos cortes en respuestas largas.
  AI_PROVIDER: 'groq',
  // Clave de Groq. Por seguridad podés moverla a Propiedades de script > GROQ_API_KEY y dejar esto vacío.
  GROQ_API_KEY: '',
  // Punto de partida y de regreso del fumigador (cada día sale y vuelve acá).
  BASE_ADDRESS: 'Magallanes 1090, San Isidro',
  // Opcional: coordenadas de la base para incluir distancias base↔visitas. Si no ponés nada, la IA igual sabe la dirección.
  BASE_LAT: '',
  BASE_LNG: ''
};

// =============================================================================
// Autenticación por PIN (hash en servidor + sesión). Sin login de Google para usuarios.
// =============================================================================
const AUTH = {
  SESSION_CACHE_PREFIX: 'loz_sess_',
  /** Sesión normal (sin "recordar dispositivo"). */
  SESSION_TTL_SEC: 12 * 60 * 60,
  /** Sesión con "recordar en este dispositivo" (30 días). */
  SESSION_REMEMBER_TTL_SEC: 30 * 24 * 60 * 60,
  /** CacheService de GAS no acepta más de 6 h por entrada. */
  CACHE_MAX_SEC: 6 * 60 * 60,
  LOGIN_FAIL_PREFIX: 'loz_login_fail_',
  LOGIN_MAX_ATTEMPTS: 10,
  LOGIN_WINDOW_SEC: 15 * 60
};

function getAuthPepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('AUTH_PEPPER');
  if (!p) {
    p = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_PEPPER', p);
  }
  return p;
}

function normalizePin_(pin) {
  return String(pin || '').trim();
}

function getUserPinSalt_(user) {
  if (user && user.pinSalt && String(user.pinSalt).trim()) {
    return String(user.pinSalt).trim();
  }
  return String((user && user.id) || (user && user.email) || 'user');
}

function hashPin_(pin, user) {
  var norm = normalizePin_(pin);
  var salt = getUserPinSalt_(user);
  var pepper = getAuthPepper_();
  var payload = pepper + '|' + salt + '|' + norm;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest);
}

function verifyUserPin_(pin, user) {
  var norm = normalizePin_(pin);
  if (!norm || norm.length < 4) return false;
  var storedHash = String((user && user.pinHash) || '').trim();
  if (storedHash) {
    return hashPin_(norm, user) === storedHash;
  }
  var legacy = String((user && user.pin) || '').trim();
  return legacy.length > 0 && legacy === norm;
}

function prepareUserPinForSave_(dataObj) {
  var out = {};
  Object.keys(dataObj || {}).forEach(function (k) { out[k] = dataObj[k]; });
  var pin = normalizePin_(out.pin);
  if (pin && pin.length >= 4) {
    if (!out.pinSalt) out.pinSalt = Utilities.getUuid();
    out.pinHash = hashPin_(pin, out);
    out.pin = '';
  }
  return out;
}

function sanitizeUserForClient_(user) {
  if (!user) return null;
  var u = {};
  Object.keys(user).forEach(function (k) {
    if (k !== 'pin' && k !== 'pinHash' && k !== 'pinSalt') u[k] = user[k];
  });
  return u;
}

function findUserByEmail_(email) {
  var emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) return null;
  var ss = getSpreadsheet_();
  var users = readSheetTable_(ss, 'Users', null);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email || '').trim().toLowerCase() === emailNorm) return users[i];
  }
  return null;
}

function findUserById_(userId) {
  if (!userId) return null;
  var ss = getSpreadsheet_();
  var users = readSheetTable_(ss, 'Users', null);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].id) === String(userId)) return users[i];
  }
  return null;
}

function readUserRowFromSheet_(ss, userId) {
  if (!ss || !userId) return null;
  var sh = ss.getSheetByName('Users');
  if (!sh) return null;
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return null;
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var idCol = headers.indexOf('id');
  if (idCol === -1) return null;
  var data = sh.getRange(2, 1, lr, lc).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idCol]) === String(userId)) {
      var row = {};
      headers.forEach(function (h, j) { row[h] = data[i][j]; });
      return row;
    }
  }
  return null;
}

function preserveUserSecretsOnSave_(ss, dataObj) {
  if (!dataObj || !dataObj.id) return dataObj;
  var existing = readUserRowFromSheet_(ss, dataObj.id);
  if (!existing) return dataObj;
  var out = {};
  Object.keys(dataObj).forEach(function (k) { out[k] = dataObj[k]; });
  if (!String(out.pinHash || '').trim() && String(existing.pinHash || '').trim()) {
    out.pinHash = existing.pinHash;
  }
  if (!String(out.pinSalt || '').trim() && String(existing.pinSalt || '').trim()) {
    out.pinSalt = existing.pinSalt;
  }
  if (!normalizePin_(out.pin) && String(existing.pinHash || '').trim()) {
    out.pin = '';
  }
  return out;
}

function migrateUserPinHash_(user) {
  if (!user || !user.id) return;
  var legacyPin = String(user.pin || '').trim();
  if (!legacyPin || String(user.pinHash || '').trim()) return;
  var prepared = prepareUserPinForSave_(Object.assign({}, user, { pin: legacyPin }));
  saveData({ table: 'Users', data: prepared });
}

function isLoginRateLimited_(emailNorm) {
  var key = AUTH.LOGIN_FAIL_PREFIX + emailNorm;
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) return false;
  try {
    var o = JSON.parse(raw);
    return (o.count || 0) >= AUTH.LOGIN_MAX_ATTEMPTS;
  } catch (e) {
    return false;
  }
}

function recordLoginFailure_(emailNorm) {
  var key = AUTH.LOGIN_FAIL_PREFIX + emailNorm;
  var cache = CacheService.getScriptCache();
  var raw = cache.get(key);
  var count = 1;
  if (raw) {
    try { count = (JSON.parse(raw).count || 0) + 1; } catch (e) { count = 1; }
  }
  cache.put(key, JSON.stringify({ count: count }), AUTH.LOGIN_WINDOW_SEC);
}

function clearLoginFailures_(emailNorm) {
  CacheService.getScriptCache().remove(AUTH.LOGIN_FAIL_PREFIX + emailNorm);
}

function parseAdmin2Permissions_(userOrRaw) {
  var raw = '';
  if (typeof userOrRaw === 'string') raw = userOrRaw;
  else if (userOrRaw && userOrRaw.admin2Permissions) raw = String(userOrRaw.admin2Permissions);
  var set = {};
  String(raw || '')
    .split(',')
    .map(function (s) { return String(s || '').trim().toUpperCase(); })
    .filter(Boolean)
    .forEach(function (k) {
      if (ADMIN2_PERMISSION_KEYS.indexOf(k) !== -1) set[k] = true;
    });
  return set;
}

function admin2HasPermission_(session, key) {
  if (!session || String(session.role) !== 'ADMIN2') return false;
  var perms = session.permissions || {};
  return !!perms[String(key || '').toUpperCase()];
}

function sessionStorageKey_(token) {
  return AUTH.SESSION_CACHE_PREFIX + String(token || '').trim();
}

function sessionTtlSec_(rememberDevice) {
  return rememberDevice ? AUTH.SESSION_REMEMBER_TTL_SEC : AUTH.SESSION_TTL_SEC;
}

function putSession_(token, payload) {
  var key = sessionStorageKey_(token);
  var json = JSON.stringify(payload);
  var remainingSec = Math.max(60, Math.floor((Number(payload.exp) - Date.now()) / 1000));
  var cacheTtl = Math.min(remainingSec, AUTH.CACHE_MAX_SEC);
  CacheService.getScriptCache().put(key, json, cacheTtl);
  PropertiesService.getScriptProperties().setProperty(key, json);
}

function cleanupExpiredSessions_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var now = Date.now();
  Object.keys(props || {}).forEach(function (key) {
    if (key.indexOf(AUTH.SESSION_CACHE_PREFIX) !== 0) return;
    try {
      var s = JSON.parse(props[key]);
      if (!s || !s.exp || now > Number(s.exp)) {
        PropertiesService.getScriptProperties().deleteProperty(key);
        CacheService.getScriptCache().remove(key);
      }
    } catch (e) {
      PropertiesService.getScriptProperties().deleteProperty(key);
      CacheService.getScriptCache().remove(key);
    }
  });
}

function createSessionToken_(user, rememberDevice) {
  var remember = !!rememberDevice;
  var ttlSec = sessionTtlSec_(remember);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var payload = {
    userId: String(user.id),
    email: String(user.email || '').trim().toLowerCase(),
    role: String(user.role || ''),
    clientId: String(user.clientId || ''),
    sessionVersion: String(user.sessionVersion || '0'),
    permissions: String(user.role) === 'ADMIN2' ? parseAdmin2Permissions_(user) : {},
    rememberDevice: remember,
    exp: Date.now() + ttlSec * 1000
  };
  putSession_(token, payload);
  return token;
}

function getSession_(token) {
  if (!token) return null;
  var key = sessionStorageKey_(token);
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) {
    raw = PropertiesService.getScriptProperties().getProperty(key);
    if (!raw) return null;
  }
  try {
    var s = JSON.parse(raw);
    if (!s || !s.userId || !s.exp || Date.now() > Number(s.exp)) {
      deleteSession_(token);
      return null;
    }
    var remainingSec = Math.max(60, Math.floor((Number(s.exp) - Date.now()) / 1000));
    CacheService.getScriptCache().put(key, raw, Math.min(remainingSec, AUTH.CACHE_MAX_SEC));
    return s;
  } catch (e) {
    return null;
  }
}

function deleteSession_(token) {
  if (!token) return;
  var key = sessionStorageKey_(token);
  CacheService.getScriptCache().remove(key);
  PropertiesService.getScriptProperties().deleteProperty(key);
}

function requireSession_(token) {
  var session = getSession_(token);
  if (!session) {
    throw new Error('AUTH_REQUIRED: Sesión inválida o expirada. Volvé a iniciar sesión.');
  }
  verifySessionUserStillValid_(session);
  return session;
}

function verifySessionUserStillValid_(session) {
  var user = findUserById_(session.userId);
  if (!user) {
    throw new Error('AUTH_REQUIRED: Usuario no encontrado.');
  }
  if (String(user.sessionVersion || '0') !== String(session.sessionVersion || '0')) {
    throw new Error('AUTH_REVOKED: Tu sesión fue cerrada desde otro dispositivo.');
  }
}

function filterDataForSession_(data, session) {
  var out = Object.assign({}, data || {});
  var role = String(session.role || '');

  if (role === 'ADMIN' || role === 'ADMIN2') {
    out.users = (out.users || []).map(sanitizeUserForClient_);
    return out;
  }

  if (role === 'OPERATIVO') {
    out.users = (out.users || [])
      .filter(function (u) { return u.id === session.userId || u.role === 'OPERATIVO'; })
      .map(sanitizeUserForClient_);
    return out;
  }

  if (role === 'CLIENT') {
    var cid = String(session.clientId || '');
    out.users = (out.users || []).filter(function (u) { return u.id === session.userId; }).map(sanitizeUserForClient_);
    out.clients = (out.clients || []).filter(function (c) { return String(c.id) === cid; });
    out.visits = (out.visits || []).filter(function (v) { return String(v.clientId) === cid; });
    out.requests = (out.requests || []).filter(function (r) { return String(r.clientId) === cid; });
    out.transactions = [];
    out.notes = [];
    return out;
  }

  throw new Error('AUTH_FORBIDDEN: Rol no autorizado.');
}

function restrictVisitSaveForAdmin2_(session, dataObj) {
  if (!dataObj || String(session.role) !== 'ADMIN2') return dataObj;
  if (admin2HasPermission_(session, 'AGENDA')) return dataObj;
  if (!admin2HasPermission_(session, 'FINANZAS')) {
    throw new Error('AUTH_FORBIDDEN: Sin permiso para modificar visitas.');
  }
  var ss = getSpreadsheet_();
  var existing = dataObj.id ? readVisitRowFromSheet_(ss, dataObj.id) : null;
  if (!existing) {
    throw new Error('AUTH_FORBIDDEN: Visita no encontrada.');
  }
  return Object.assign({}, existing, {
    price: dataObj.price,
    priceDisabled: dataObj.priceDisabled,
    paymentStatus: dataObj.paymentStatus,
    updatedAt: dataObj.updatedAt || new Date().toISOString()
  });
}

function readVisitRowFromSheet_(ss, visitId) {
  if (!visitId || !ss) return null;
  var rows = readVisitsFromAllSheets_(ss, null, true);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(visitId)) return rows[i];
  }
  return null;
}

function assertSavePermission_(session, table, dataObj) {
  var role = String(session.role || '');
  if (role === 'ADMIN2') {
    if (table === 'Clients' && admin2HasPermission_(session, 'CLIENTES')) return;
    if (table === 'Requests' && admin2HasPermission_(session, 'SOLICITUDES')) return;
    if (table === 'Notes' && admin2HasPermission_(session, 'NOTAS')) return;
    if (table === 'Transactions' && admin2HasPermission_(session, 'FINANZAS')) return;
    if (table === 'Visits' && (admin2HasPermission_(session, 'AGENDA') || admin2HasPermission_(session, 'FINANZAS'))) return;
    throw new Error('AUTH_FORBIDDEN: Sin permiso para guardar en ' + table);
  }
  if (role === 'ADMIN') return;

  if (role === 'OPERATIVO') {
    if (table === 'Visits' || table === 'Notes') return;
    throw new Error('AUTH_FORBIDDEN: Sin permiso para guardar en ' + table);
  }

  if (role === 'CLIENT') {
    if (table === 'Requests') {
      if (dataObj.clientId && String(dataObj.clientId) !== String(session.clientId)) {
        throw new Error('AUTH_FORBIDDEN: No podés crear solicitudes de otro cliente.');
      }
      return;
    }
    if (table === 'Clients' && String(dataObj.id) === String(session.clientId)) return;
    if (table === 'Users' && String(dataObj.id) === String(session.userId)) return;
    throw new Error('AUTH_FORBIDDEN: Sin permiso para guardar en ' + table);
  }

  throw new Error('AUTH_FORBIDDEN: Rol no autorizado.');
}

/** Sin sesión: indica si hace falta crear el primer admin. */
function apiGetSetupStatus() {
  try {
    var ss = getSpreadsheet_();
    var users = readSheetTable_(ss, 'Users', null).filter(function (u) {
      return u && String(u.email || '').trim();
    });
    return { needsSetup: users.length === 0 };
  } catch (e) {
    return { needsSetup: true, error: String(e) };
  }
}

/** Sin sesión: solo si no hay usuarios. Crea admin inicial con PIN hasheado. */
function apiBootstrap(adminPayload) {
  try {
    var status = apiGetSetupStatus();
    if (!status.needsSetup) {
      return { success: false, message: 'El sistema ya está inicializado.' };
    }
    if (!adminPayload || !adminPayload.email) {
      return { success: false, message: 'Datos de admin incompletos.' };
    }
    var admin = prepareUserPinForSave_(adminPayload);
    var result = saveData({ table: 'Users', data: admin });
    return Object.assign({ success: !!result.success }, result);
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

/** Sin sesión: registro público de cliente (PIN hasheado en Users). */
function apiPublicRegister(info) {
  try {
    var emailNorm = String((info && info.email) || '').trim().toLowerCase();
    if (!emailNorm || emailNorm.indexOf('@') === -1) {
      return { success: false, message: 'Email inválido.' };
    }
    if (!info || !String(info.name || '').trim()) {
      return { success: false, message: 'Nombre requerido.' };
    }
    if (!info || !String(info.phone || '').trim()) {
      return { success: false, message: 'Teléfono requerido.' };
    }
    var pinNorm = normalizePin_(info.pin);
    if (!pinNorm || pinNorm.length < 4) {
      return { success: false, message: 'PIN inválido (mínimo 4 dígitos).' };
    }
    if (findUserByEmail_(emailNorm)) {
      return { success: false, message: 'Ya existe un usuario con ese email.' };
    }

    var newClientId = 'c' + Date.now();
    var clientInfo = {};
    Object.keys(info || {}).forEach(function (k) {
      if (k !== 'pin') clientInfo[k] = info[k];
    });
    var newClient = Object.assign({}, clientInfo, {
      id: newClientId,
      status: 'ACTIVO',
      relationshipType: 'ESPECIAL',
      email: emailNorm
    });
    var newUser = prepareUserPinForSave_({
      id: 'u_' + newClientId,
      email: emailNorm,
      pin: pinNorm,
      role: 'CLIENT',
      clientId: newClientId,
      name: info.name,
      sessionVersion: '0'
    });

    var r1 = saveData({ table: 'Clients', data: newClient });
    if (!r1.success) return { success: false, message: r1.message || 'Error guardando cliente' };
    var r2 = saveData({ table: 'Users', data: newUser });
    if (!r2.success) return { success: false, message: r2.message || 'Error guardando usuario' };

    return { success: true, email: emailNorm, clientId: newClientId };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

function apiLogin(email, pin, rememberDevice) {
  try {
    cleanupExpiredSessions_();
    var emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm) return { success: false, message: 'Email requerido.' };
    if (isLoginRateLimited_(emailNorm)) {
      return { success: false, message: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' };
    }

    var user = findUserByEmail_(emailNorm);
    if (!user || !verifyUserPin_(pin, user)) {
      recordLoginFailure_(emailNorm);
      return { success: false, message: 'Credenciales incorrectas.' };
    }
    clearLoginFailures_(emailNorm);

    if (!String(user.pinHash || '').trim() && String(user.pin || '').trim()) {
      migrateUserPinHash_(user);
      user = findUserByEmail_(emailNorm) || user;
    }

    var sessionToken = createSessionToken_(user, rememberDevice);
    var safeUser = sanitizeUserForClient_(user);
    if (String(user.role) === 'ADMIN2') {
      safeUser.admin2Permissions = String(user.admin2Permissions || '');
    }
    return {
      success: true,
      sessionToken: sessionToken,
      user: safeUser
    };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

function apiArchiveVisitsYearly(sessionToken, pin) {
  try {
    var session = requireSession_(sessionToken);
    if (String(session.role || '') !== 'ADMIN') {
      throw new Error('AUTH_FORBIDDEN: Solo el administrador general puede archivar visitas.');
    }
    var user = findUserById_(session.userId);
    if (!user || !verifyUserPin_(pin, user)) {
      return { success: false, message: 'PIN incorrecto.' };
    }
    var result = archiveVisitsByYear_();
    if (result && result.success) {
      appendArchiveLogToSheet_(user, result);
      result.loggedAt = new Date().toISOString();
      result.performedBy = String(user.email || user.name || '').trim();
    }
    return result;
  } catch (e) {
    Logger.log('apiArchiveVisitsYearly: ' + e);
    return { success: false, message: shortenErrorMessage_(e) };
  }
}

/** Registro en planilla (hoja ArchiveLog) para auditar archivados. */
function appendArchiveLogToSheet_(user, result) {
  try {
    var ss = getSpreadsheet_();
    if (!ss) return;
    var name = 'ArchiveLog';
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(['fecha', 'usuario', 'movidas', 'hojas_destino', 'min_año_activo', 'quedan_en_visits', 'detalle']);
      sh.setFrozenRows(1);
    }
    var years = result.years || [];
    var dest = years.map(function (y) { return visitArchiveSheetForYear_(y); }).join(', ');
    var counts = result.yearCounts || {};
    var detailParts = years.map(function (y) {
      var n = counts[y] != null ? counts[y] : '';
      return visitArchiveSheetForYear_(y) + (n !== '' ? (' (' + n + ')') : '');
    });
    sh.appendRow([
      new Date(),
      String(user.email || user.name || '').trim(),
      result.moved || 0,
      dest,
      result.minActiveYear || '',
      result.keptInVisits || 0,
      detailParts.length ? detailParts.join(' · ') : (result.message || '')
    ]);
  } catch (e) {
    Logger.log('appendArchiveLogToSheet_: ' + e);
  }
}

function apiLogout(sessionToken) {
  try {
    deleteSession_(sessionToken);
    return { success: true };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

function getSpreadsheet_() {
  // 1) Si está configurado, abrir por ID (más confiable para WebApp standalone)
  if (CONFIG.SPREADSHEET_ID && String(CONFIG.SPREADSHEET_ID).trim()) {
    return SpreadsheetApp.openById(String(CONFIG.SPREADSHEET_ID).trim());
  }
  // 2) Intentar activo (funciona si el script está vinculado a la planilla)
  return SpreadsheetApp.getActiveSpreadsheet();
}

// (removido) endpoints de diagnóstico

// Función auxiliar para normalizar fechas
function normalizeDate(dateValue) {
  if (!dateValue) return '';

  const TZ = 'America/Argentina/Buenos_Aires';
  const pad2 = (n) => String(n).padStart(2, '0');

  // Date (desde Sheets)
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    return Utilities.formatDate(dateValue, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  }

  if (typeof dateValue === 'string') {
    const s = dateValue.trim();
    if (!s) return '';

    // ISO-like: YYYY-MM-DDTHH:mm...
    const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (mIso) {
      const [, yyyy, mm, dd, hh, mi, ss = '00'] = mIso;
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${pad2(ss)}`;
    }

    // DD/MM/YYYY HH:mm
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) {
      const [, day, month, year, hour, minute] = m;
      return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00`;
    }

    // YYYY-MM-DD (date only)
    const mDateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (mDateOnly) {
      return `${mDateOnly[1]}-${mDateOnly[2]}-${mDateOnly[3]}T00:00:00`;
    }

    // Fallback parse -> formatear en BA
    const ms = Date.parse(s);
    if (!isNaN(ms)) {
      return Utilities.formatDate(new Date(ms), TZ, "yyyy-MM-dd'T'HH:mm:ss");
    }
  }

  return String(dateValue);
}

// Función auxiliar para extraer fecha y hora de un string ISO
function extractDateAndTime(isoString) {
  if (!isoString) return { date: '', time: '' };
  const TZ = 'America/Argentina/Buenos_Aires';

  // Date
  if (isoString instanceof Date && !isNaN(isoString.getTime())) {
    return {
      date: Utilities.formatDate(isoString, TZ, 'yyyy-MM-dd'),
      time: Utilities.formatDate(isoString, TZ, 'HH:mm')
    };
  }

  try {
    const s = String(isoString).trim();
    if (!s) return { date: '', time: '' };

    if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
      var msZ = Date.parse(s);
      if (!isNaN(msZ)) {
        var instZ = new Date(msZ);
        return {
          date: Utilities.formatDate(instZ, TZ, 'yyyy-MM-dd'),
          time: Utilities.formatDate(instZ, TZ, 'HH:mm')
        };
      }
    }

    if (s.includes('T')) {
      const [d, tRaw = ''] = s.split('T');
      const hhmm = (tRaw || '').replace(/\.\d+.*$/, '').replace(/[zZ].*$/, '').slice(0, 5);
      return { date: d.slice(0, 10), time: hhmm };
    }

    // DD/MM/YYYY HH:mm
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) {
      const [, day, month, year, hour, minute] = m;
      return { date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, time: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}` };
    }

    return { date: '', time: '' };
  } catch (e) {
    return { date: '', time: '' };
  }
}

// Normalizar campos de hora (HH:mm). Evita que Sheets exponga 1899-12-30...
function normalizeTimeValue(timeValue) {
  if (timeValue === null || timeValue === undefined || timeValue === '') return '';
  const TZ = 'America/Argentina/Buenos_Aires';
  const pad2 = (n) => String(n).padStart(2, '0');

  if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
    return Utilities.formatDate(timeValue, TZ, 'HH:mm');
  }

  const s = String(timeValue).trim();
  if (!s) return '';
  if (s.includes('T')) {
    const t = (s.split('T')[1] || '').slice(0, 5);
    return t;
  }
  if (s.includes(':')) {
    const [hRaw, mRaw = '00'] = s.split(':');
    const hh = pad2(parseInt(hRaw, 10) || 0);
    const mm = pad2(parseInt(mRaw, 10) || 0);
    return `${hh}:${mm}`;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 4) return `${digits.slice(0,2)}:${digits.slice(2,4)}`;
  if (digits.length === 3) return `0${digits.slice(0,1)}:${digits.slice(1,3)}`;
  if (digits.length <= 2) return `${pad2(parseInt(digits, 10) || 0)}:00`;
  return '';
}

function mapRowToObject_(table, headers, row) {
  var obj = {};
  headers.forEach(function (h, i) {
    var key = String(h).trim();
    var value = row[i];
    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('createdat')) {
      value = normalizeDate(value);
    }
    if (key.toLowerCase().includes('time')) {
      value = normalizeTimeValue(value);
    }
    if (table === 'Visits' && key === 'date' && value) {
      var normalized = normalizeDate(value);
      obj[key] = normalized;
      var dt = extractDateAndTime(normalized);
      obj.time = obj.time || dt.time;
    } else {
      if ((key === 'pestTypes' || key === 'pesttypes' || key === 'preferredDays' || key === 'preferredSlots')
          && typeof value === 'string') {
        value = value.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
      } else if (value !== null && value !== undefined) {
        value = value;
      } else {
        value = '';
      }
      obj[key] = value;
    }
  });
  return obj;
}

function readSheetTable_(ss, table, rowFilterFn) {
  return readSheetTableNamed_(ss, table, table, rowFilterFn);
}

function readSheetTableNamed_(ss, sheetName, logicalTable, rowFilterFn) {
  var out = [];
  if (!ss || !sheetName) return out;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return out;
  var logical = logicalTable || sheetName;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var usedRows = Math.min(lastRow, LIMITS.MAX_ROWS_PER_SHEET);
  var usedCols = Math.min(lastCol, LIMITS.MAX_COLS_PER_SHEET);
  if (lastRow <= 1 || lastCol <= 0) return out;
  var data = sheet.getRange(1, 1, usedRows, usedCols).getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  for (var i = 1; i < data.length; i++) {
    var obj = mapRowToObject_(logical, headers, data[i]);
    if (!Object.values(obj).some(function (v) { return v !== '' && v !== null && v !== undefined; })) continue;
    if (typeof rowFilterFn === 'function' && !rowFilterFn(obj)) continue;
    out.push(obj);
  }
  return out;
}

function isVisitArchiveSheetName_(name) {
  return /^Visits_\d{4}$/.test(String(name || ''));
}

function visitArchiveSheetForYear_(year) {
  return 'Visits_' + String(year);
}

function getCurrentBaYear_() {
  return parseInt(Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy'), 10);
}

function shortenErrorMessage_(e) {
  var s = e && e.toString ? e.toString() : String(e || '');
  s = s.replace(/^Error:\s*/i, '').replace(/^Exception:\s*/i, '').trim();
  if (s.indexOf('AUTH_FORBIDDEN:') >= 0) return s.split('AUTH_FORBIDDEN:').pop().trim() || 'Sin permiso.';
  if (s.indexOf('AUTH_REQUIRED:') >= 0) return 'Sesión expirada. Volvé a entrar.';
  var first = s.split('\n')[0] || s;
  if (first.length > 120) first = first.slice(0, 117) + '…';
  return first || 'No se pudo guardar.';
}

/** Primer año que permanece en la hoja activa Visits (ej. 2025 si hoy es 2026 y ACTIVE_YEARS=2). */
function getMinActiveVisitYear_() {
  var keep = parseInt(CONFIG.VISIT_ARCHIVE_ACTIVE_YEARS, 10);
  if (isNaN(keep) || keep < 1) keep = 2;
  return getCurrentBaYear_() - keep + 1;
}

function visitYearFromRow_(visit) {
  var ymd = visitDateYmd_(visit);
  if (!ymd || ymd.length < 4) return 0;
  return parseInt(ymd.slice(0, 4), 10) || 0;
}

function shouldKeepVisitInActiveSheet_(visit) {
  var y = visitYearFromRow_(visit);
  if (!y) return true;
  return y >= getMinActiveVisitYear_();
}

function resolveVisitStorageSheet_(visit) {
  var y = visitYearFromRow_(visit);
  if (!y || y >= getMinActiveVisitYear_()) return 'Visits';
  return visitArchiveSheetForYear_(y);
}

function readVisitsFromAllSheets_(ss, rowFilterFn, includeArchive) {
  var acc = readSheetTable_(ss, 'Visits', rowFilterFn);
  if (!includeArchive || !ss) return acc;
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (isVisitArchiveSheetName_(n)) {
      acc = mergeById_(acc, readSheetTableNamed_(ss, n, 'Visits', rowFilterFn));
    }
  });
  return acc;
}

function getVisitSheetHeaders_(ss) {
  var sh = ss.getSheetByName('Visits');
  if (!sh || sh.getLastColumn() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) {
    return String(h || '').trim();
  }).filter(Boolean);
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.appendRow(headers);
    return sh;
  }
  if (sh.getLastRow() < 1 && headers.length) {
    sh.appendRow(headers);
  }
  return sh;
}

function objectToSheetRow_(headers, dataObj) {
  return headers.map(function (h) {
    var key = String(h).trim();
    var value = dataObj[key];
    if (value === undefined || value === null) value = '';
    if (Array.isArray(value)) value = value.join(', ');
    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('createdat')) {
      if (value && typeof value === 'string') {
        var sVal = String(value).trim();
        if (sVal.includes('T') || /[zZ]$/.test(sVal) || /[+-]\d{2}:?\d{2}$/.test(sVal)) {
          var mIso = sVal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
          if (mIso && !/[zZ]$/.test(sVal) && !/[+-]\d{2}:?\d{2}$/.test(sVal)) {
            value = mIso[3] + '/' + mIso[2] + '/' + mIso[1] + ' ' + mIso[4] + ':' + mIso[5];
          } else {
            try {
              var ms = Date.parse(sVal);
              if (!isNaN(ms)) {
                value = Utilities.formatDate(new Date(ms), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
              }
            } catch (ignore) {}
          }
        }
      }
    }
    if (key.toLowerCase().includes('time')) {
      value = normalizeTimeValue(value);
    }
    return value;
  });
}

function appendVisitObjectsToSheet_(ss, sheetName, headers, visits) {
  if (!visits || !visits.length) return 0;
  var sh = ensureSheetWithHeaders_(ss, sheetName, headers);
  var existingIds = {};
  if (sh.getLastRow() > 1) {
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) {
      return String(x || '').trim();
    });
    var idIdx = hdr.indexOf('id');
    if (idIdx >= 0) {
      var ids = sh.getRange(2, idIdx + 1, sh.getLastRow(), idIdx + 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        existingIds[String(ids[i][0])] = true;
      }
    }
  }
  var rows = [];
  for (var j = 0; j < visits.length; j++) {
    var v = visits[j];
    if (v && v.id && existingIds[String(v.id)]) continue;
    rows.push(objectToSheetRow_(headers, v));
  }
  if (rows.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, start + rows.length - 1, headers.length).setValues(rows);
  }
  return rows.length;
}

function replaceActiveVisitsBody_(ss, headers, visits) {
  var sh = ss.getSheetByName('Visits');
  if (!sh) return;
  var lr = sh.getLastRow();
  if (lr > 1) sh.deleteRows(2, lr - 1);
  if (visits && visits.length) {
    var rows = visits.map(function (v) { return objectToSheetRow_(headers, v); });
    sh.getRange(2, 1, 1 + rows.length, headers.length).setValues(rows);
  }
}

/**
 * Mueve visitas con fecha de años viejos desde Visits hacia hojas Visits_AAAA.
 * Las sin fecha (pendientes) y los años recientes se quedan en Visits.
 */
function archiveVisitsByYear_() {
  var ss = getSpreadsheet_();
  if (!ss) throw new Error('No se pudo abrir la planilla.');
  var headers = getVisitSheetHeaders_(ss);
  if (!headers.length) throw new Error('La hoja Visits no tiene encabezados.');
  var minYear = getMinActiveVisitYear_();
  var all = readSheetTable_(ss, 'Visits', null);
  var toKeep = [];
  var byYear = {};

  all.forEach(function (v) {
    if (shouldKeepVisitInActiveSheet_(v)) {
      toKeep.push(v);
      return;
    }
    var y = visitYearFromRow_(v);
    if (!y) {
      toKeep.push(v);
      return;
    }
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(v);
  });

  var moved = 0;
  var yearCounts = {};
  var years = Object.keys(byYear).sort();
  years.forEach(function (yKey) {
    var sheetName = visitArchiveSheetForYear_(yKey);
    var n = appendVisitObjectsToSheet_(ss, sheetName, headers, byYear[yKey]);
    yearCounts[yKey] = n;
    moved += n;
  });

  replaceActiveVisitsBody_(ss, headers, toKeep);

  var destSheets = years.map(function (y) { return visitArchiveSheetForYear_(y); });

  return {
    success: true,
    minActiveYear: minYear,
    keptInVisits: toKeep.length,
    moved: moved,
    years: years,
    yearCounts: yearCounts,
    destSheets: destSheets,
    message: moved
      ? ('Se archivaron ' + moved + ' visitas en ' + destSheets.join(', ') + '. En Visits quedan desde ' + minYear + '.')
      : ('No había visitas para archivar (antes de ' + minYear + ').')
  };
}

function visitDateYmd_(visit) {
  if (!visit || !visit.date) return '';
  var norm = normalizeDate(visit.date);
  if (!norm) return '';
  return String(norm).split('T')[0];
}

function ymdAddDays_(ymd, days) {
  if (!ymd) return '';
  var p = String(ymd).split('-');
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10) - 1;
  var d = parseInt(p[2], 10);
  var dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + days);
  return Utilities.formatDate(dt, 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
}

function monthStartYmd_(ymd) {
  if (!ymd) return '';
  return String(ymd).slice(0, 7) + '-01';
}

function monthsAgoYmd_(months) {
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  return Utilities.formatDate(d, 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
}

function mergeById_(arr, extra, idKey) {
  idKey = idKey || 'id';
  var map = {};
  (arr || []).forEach(function (r) { map[String(r[idKey])] = r; });
  (extra || []).forEach(function (r) { map[String(r[idKey])] = r; });
  var keys = Object.keys(map);
  var out = [];
  for (var i = 0; i < keys.length; i++) out.push(map[keys[i]]);
  return out;
}

/** Visitas de un año calendario (hoja Visits + Visits_AAAA si existe). */
function readVisitsForYear_(ss, year) {
  year = parseInt(year, 10);
  if (!year || isNaN(year)) return [];
  var yStart = String(year) + '-01-01';
  var yEnd = String(year) + '-12-31';
  var filter = function (v) {
    if (v.deletedAt) return false;
    var ymd = visitDateYmd_(v);
    return !!(ymd && ymd >= yStart && ymd <= yEnd);
  };
  var acc = readSheetTable_(ss, 'Visits', filter);
  var archName = visitArchiveSheetForYear_(year);
  if (ss.getSheetByName(archName)) {
    acc = mergeById_(acc, readSheetTableNamed_(ss, archName, 'Visits', filter));
  }
  return acc;
}

/** Años con datos posibles: archivos Visits_AAAA + años aún en Visits activa. */
function listAvailableVisitYears_(ss) {
  var currentYear = getCurrentBaYear_();
  var years = {};
  years[currentYear] = true;
  var minActive = getMinActiveVisitYear_();
  for (var y = minActive; y < currentYear; y++) years[y] = true;
  if (ss) {
    ss.getSheets().forEach(function (sh) {
      var n = sh.getName();
      if (isVisitArchiveSheetName_(n)) {
        var ay = parseInt(String(n).replace('Visits_', ''), 10);
        if (ay) years[ay] = true;
      }
    });
  }
  return Object.keys(years).map(function (k) { return parseInt(k, 10); })
    .filter(function (n) { return !!n; })
    .sort(function (a, b) { return b - a; });
}

function collectRequestedVisitYears_(scopeList, options) {
  options = options || {};
  var out = [];
  var seen = {};
  function add(y) {
    y = parseInt(y, 10);
    if (!y || isNaN(y) || seen[y]) return;
    seen[y] = true;
    out.push(y);
  }
  if (options.visitsYear != null && options.visitsYear !== '') add(options.visitsYear);
  if (Array.isArray(options.visitsYears)) {
    options.visitsYears.forEach(add);
  }
  (scopeList || []).forEach(function (s) {
    var m = String(s || '').match(/^year[:_-]?(\d{4})$/i);
    if (m) add(m[1]);
  });
  return out;
}

/**
 * Carga parcial por scopes: core | agenda | finance | history
 * options.visitsYear / visitsYears: cargar un año extra bajo demanda (sin traer todo el histórico).
 */
function getDataForScopes_(scopes, options) {
  var scopeList = Array.isArray(scopes) ? scopes : ['core', 'agenda'];
  options = options || {};
  var want = {};
  scopeList.forEach(function (s) { want[String(s).toLowerCase()] = true; });

  var ss = getSpreadsheet_();
  if (!ss) {
    return {
      users: [],
      clients: [],
      visits: [],
      requests: [],
      transactions: [],
      notes: [],
      __error: 'No se pudo acceder al Spreadsheet. Configurá CONFIG.SPREADSHEET_ID en Code.gs (si el script es standalone).'
    };
  }

  var today = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  var currentYearStr = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy');
  var currentYear = parseInt(currentYearStr, 10);
  var agendaStart = currentYearStr + '-01-01';
  var agendaEnd = ymdAddDays_(today, DATA_SCOPES.AGENDA_DAYS_FUTURE);
  var financeStart = monthsAgoYmd_(DATA_SCOPES.FINANCE_MONTHS_BACK);
  var historyStart = currentYearStr + '-01-01';
  var requestsStart = monthsAgoYmd_(DATA_SCOPES.REQUESTS_MONTHS_BACK);
  var extraYears = collectRequestedVisitYears_(scopeList, options);

  var result = {};
  var visitsAcc = [];

  if (want.core) {
    result.clients = readSheetTable_(ss, 'Clients', null);
    result.users = readSheetTable_(ss, 'Users', null);
    result.notes = readSheetTable_(ss, 'Notes', function (n) {
      return !n.deletedAt;
    });
    result.requests = readSheetTable_(ss, 'Requests', function (r) {
      if (String(r.status || '').trim() === 'PENDIENTE') return true;
      var c = normalizeDate(r.createdAt);
      var ymd = c ? String(c).split('T')[0] : '';
      return ymd && ymd >= requestsStart;
    });
  }

  if (want.agenda) {
    visitsAcc = mergeById_(visitsAcc, readSheetTable_(ss, 'Visits', function (v) {
      if (v.deletedAt) return false;
      var ymd = visitDateYmd_(v);
      if (!ymd) return true;
      return ymd >= agendaStart && ymd <= agendaEnd;
    }));
  }

  if (want.finance) {
    result.transactions = readSheetTable_(ss, 'Transactions', function (t) {
      if (t.deletedAt) return false;
      var d = normalizeDate(t.date);
      var ymd = d ? String(d).split('T')[0] : '';
      return !ymd || ymd >= financeStart;
    });
    visitsAcc = mergeById_(visitsAcc, readVisitsFromAllSheets_(ss, function (v) {
      if (v.deletedAt) return false;
      var ymd = visitDateYmd_(v);
      if (!ymd || ymd < financeStart) return false;
      return String(v.status || '') === 'REALIZADA' || String(v.paymentStatus || '') === 'PAGADO';
    }, true));
  }

  if (want.history) {
    // Solo año actual por defecto (años viejos: botón / visitsYear).
    visitsAcc = mergeById_(visitsAcc, readSheetTable_(ss, 'Visits', function (v) {
      if (v.deletedAt) return false;
      var st = String(v.status || '');
      if (st !== 'REALIZADA' && st !== 'CANCELADA') return false;
      var ymd = visitDateYmd_(v);
      return !ymd || ymd >= historyStart;
    }));
  }

  for (var i = 0; i < extraYears.length; i++) {
    visitsAcc = mergeById_(visitsAcc, readVisitsForYear_(ss, extraYears[i]));
  }

  if (visitsAcc.length) result.visits = visitsAcc;

  var availableYears = listAvailableVisitYears_(ss);
  result.__meta = {
    fetchedAt: new Date().toISOString(),
    scopes: scopeList,
    currentYear: currentYear,
    requestedYears: extraYears,
    availableYears: availableYears,
    windows: {
      agendaStart: agendaStart,
      agendaEnd: agendaEnd,
      financeStart: financeStart,
      historyStart: historyStart
    }
  };
  return result;
}

function getData() {
  try {
    return getDataForScopes_(['core', 'agenda', 'finance', 'history']);
  } catch (e) {
    Logger.log('ERROR CRÍTICO en getData: ' + e.toString());
    return {
      users: [],
      clients: [],
      visits: [],
      requests: [],
      transactions: [],
      notes: [],
      __error: 'ERROR CRÍTICO en getData: ' + (e && e.toString ? e.toString() : String(e))
    };
  }
}

/**
 * API pública — requiere sesión (token devuelto por apiLogin).
 */
function apiGetData(sessionToken, options) {
  try {
    var session = requireSession_(sessionToken);
    options = options || {};
    var scopes = options.scopes || ['core', 'agenda'];
    var data = filterDataForSession_(getDataForScopes_(scopes, options), session);
    return data;
  } catch (e) {
    return {
      users: [],
      clients: [],
      visits: [],
      requests: [],
      transactions: [],
      notes: [],
      __error: String(e),
      __auth: String(e).indexOf('AUTH_') === 0 ? String(e).split(':')[0] : 'AUTH_REQUIRED'
    };
  }
}

// Alternativa robusta: devolver JSON string para evitar problemas de serialización en google.script.run
function apiGetDataJson(sessionToken, options) {
  try {
    var session = requireSession_(sessionToken);
    options = options || {};
    var scopes = options.scopes || ['core', 'agenda'];
    var data = filterDataForSession_(getDataForScopes_(scopes, options), session);
    return JSON.stringify(data);
  } catch (e) {
    var msg = e && e.toString ? e.toString() : String(e);
    var authCode = msg.indexOf('AUTH_') >= 0 ? (msg.match(/AUTH_[A-Z_]+/) || ['AUTH_REQUIRED'])[0] : 'AUTH_REQUIRED';
    return JSON.stringify({
      users: [],
      clients: [],
      visits: [],
      requests: [],
      transactions: [],
      notes: [],
      __error: msg,
      __auth: authCode
    });
  }
}

function saveData(payload) {
  try {
    const ss = getSpreadsheet_();
    if (!ss) {
      throw new Error('No se pudo acceder a la hoja de cálculo. Configurá CONFIG.SPREADSHEET_ID en Code.gs si el script es standalone.');
    }
    
    const table = payload.table;
    let dataObj = payload.data;
    
    if (!table || !dataObj) {
      throw new Error('Datos incompletos en el payload');
    }

    if (table === 'Users') {
      dataObj = preserveUserSecretsOnSave_(ss, dataObj);
      dataObj = prepareUserPinForSave_(dataObj);
    }
    
    var storageTable = table;
    if (table === 'Visits') {
      storageTable = resolveVisitStorageSheet_(dataObj);
    }

    let sheet = ss.getSheetByName(storageTable);
    if (!sheet) {
      sheet = ss.insertSheet(storageTable);
      // Crear cabeceras basadas en las llaves del objeto
      const headers = Object.keys(dataObj);
      sheet.appendRow(headers);
      Logger.log('Hoja ' + storageTable + ' creada con headers: ' + headers.join(', '));
    }

    // Obtener headers existentes o crear nuevos (usar lastRow/lastCol para evitar rangos enormes)
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const existingData = (lastRow >= 1 && lastCol >= 1)
      ? sheet.getRange(1, 1, lastRow, lastCol).getValues()
      : [];
    let headers = [];
    
    if (existingData.length > 0) {
      headers = existingData[0].map(h => String(h).trim());
    }
    
    // Agregar nuevos headers si faltan campos del objeto
    const newHeaders = [];
    Object.keys(dataObj).forEach(key => {
      if (headers.indexOf(key) === -1) {
        newHeaders.push(key);
        headers.push(key);
      }
    });
    
    // Si hay nuevos headers, agregarlos a la primera fila
    if (newHeaders.length > 0) {
      if (existingData.length === 0) {
        // Hoja vacía, crear toda la primera fila con headers
        sheet.appendRow(headers);
        Logger.log(`Headers creados en ${table}: ${headers.join(', ')}`);
      } else {
        // Agregar solo los nuevos headers a la derecha
        const lastCol = sheet.getLastColumn();
        const newHeaderRange = sheet.getRange(1, lastCol + 1, 1, newHeaders.length);
        newHeaderRange.setValues([newHeaders]);
        Logger.log(`Nuevos headers agregados a ${table}: ${newHeaders.join(', ')}`);
      }
    }
    
    // Visits: no pisar googleCalendarEventId si el cliente no lo envía (sincronizado solo en servidor).
    if (table === 'Visits' && dataObj.id) {
      const preservedGcal = readVisitGoogleCalendarEventIdFromSheet_(ss, dataObj.id);
      if (preservedGcal && (!dataObj.googleCalendarEventId || String(dataObj.googleCalendarEventId).trim() === '')) {
        dataObj.googleCalendarEventId = preservedGcal;
      }
    }

    // Preparar los datos de la fila según los headers
    const rowData = headers.map(h => {
      const key = String(h).trim();
      let value = dataObj[key];
      
      // Si el valor es undefined o null, usar string vacío
      if (value === undefined || value === null) {
        value = '';
      }
      
      // Convertir arrays a string separado por comas (ej: pestTypes)
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
      
      // Normalizar fechas antes de guardar (siempre hora Buenos Aires en la planilla)
      if (key.toLowerCase().includes('date') || key.toLowerCase().includes('createdat')) {
        if (value && typeof value === 'string') {
          const sVal = String(value).trim();
          // Transacciones: solo fecha YYYY-MM-DD (evita que Sheets cambie el mes por zona horaria)
          if (table === 'Transactions' && key.toLowerCase() === 'date') {
            var txNorm = normalizeDate(sVal);
            if (txNorm) {
              var txParts = extractDateAndTime(txNorm);
              value = txParts.date || String(txNorm).substring(0, 10);
            }
          } else if (sVal.includes('T') || /[zZ]$/.test(sVal) || /[+-]\d{2}:?\d{2}$/.test(sVal)) {
            const mIso = sVal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
            if (mIso && !/[zZ]$/.test(sVal) && !/[+-]\d{2}:?\d{2}$/.test(sVal)) {
              const [, yyyy, mm, dd, hh, mi] = mIso;
              value = `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
            } else {
              try {
                const ms = Date.parse(sVal);
                if (!isNaN(ms)) {
                  value = Utilities.formatDate(new Date(ms), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
                }
              } catch (e) {
                Logger.log('Error normalizando fecha ' + value + ': ' + e.toString());
              }
            }
          }
        }
      }

      // Normalizar horarios antes de guardar (dejar siempre HH:mm)
      if (key.toLowerCase().includes('time')) {
        value = normalizeTimeValue(value);
      }
      
      return value;
    });

    // Buscar por ID para actualizar
    const idIndex = headers.indexOf('id');
    let updated = false;

    if (idIndex !== -1 && dataObj.id) {
      const lr = sheet.getLastRow();
      const lc = sheet.getLastColumn();
      const allData = (lr >= 1 && lc >= 1) ? sheet.getRange(1, 1, lr, lc).getValues() : [];
      
      for (let i = 1; i < allData.length; i++) {
        if (allData.length > 0 && allData[0].length > idIndex && 
            String(allData[i][idIndex]) === String(dataObj.id)) {
          // Encontramos la fila, actualizamos todas las celdas
          const range = sheet.getRange(i + 1, 1, 1, headers.length);
          range.setValues([rowData]);
          updated = true;
          Logger.log(`Registro actualizado en ${table} con ID: ${dataObj.id}`);
          break;
        }
      }
    }

    if (!updated) {
      sheet.appendRow(rowData);
      Logger.log(`Nuevo registro agregado a ${table} con ID: ${dataObj.id || 'N/A'}`);
    }

    const result = { success: true, message: updated ? 'Actualizado' : 'Creado' };

    if (table === 'Visits' && result.success) {
      try {
        result.calendar = afterVisitRowSavedCalendarSync_(dataObj);
      } catch (calErr) {
        Logger.log('afterVisitRowSavedCalendarSync_: ' + (calErr && calErr.toString ? calErr.toString() : String(calErr)));
        result.calendar = { ok: false, error: String(calErr) };
      }
    }

    return result;
  } catch (e) {
    Logger.log(`ERROR en saveData: ${e.toString()}`);
    // Importante: devolver un objeto (no null) para que el frontend pueda mostrar error estable
    return { success: false, message: shortenErrorMessage_(e) };
  }
}

function apiSaveData(payload) {
  try {
    if (!payload || !payload.sessionToken) {
      return { success: false, message: 'AUTH_REQUIRED: Sesión requerida.' };
    }
    var session = requireSession_(payload.sessionToken);
    if (!payload.table || !payload.data) {
      return { success: false, message: 'Datos incompletos.' };
    }
    assertSavePermission_(session, payload.table, payload.data);
    var row = payload.data;
    if (payload.table === 'Visits' && String(session.role) === 'ADMIN2') {
      row = restrictVisitSaveForAdmin2_(session, row);
    }
    return saveData({ table: payload.table, data: row });
  } catch (e) {
    return { success: false, message: shortenErrorMessage_(e) };
  }
}

// --- EMAIL: Los correos se envían SIEMPRE desde la cuenta con la que está creado/ejecutado el proyecto.
// Para que lleguen "de javiernoriega0@gmail.com" a javiernoriega0@gmail.com, el proyecto de Apps Script
// tiene que estar en la cuenta de Javier y ejecutarse con esa cuenta:
// 1) Entrá a script.google.com con javiernoriega0@gmail.com.
// 2) Si el proyecto estaba en otro usuario: compartí el proyecto con javier, luego "Archivo" > "Crear una copia"
//    con la cuenta de javier y usá esa copia (y actualizá CONFIG.SPREADSHEET_ID si hace falta).
// 3) Al autorizar o ejecutar, elegí siempre la cuenta javiernoriega0@gmail.com.
const ADMIN_EMAIL = 'javiernoriega0@gmail.com';

function notifyNewRequest(req) {
  try {
    if (req && req.sessionToken) {
      requireSession_(req.sessionToken);
    } else {
      return;
    }
    if (!req || !req.clientId) return;
    const clientName = (typeof req.clientName === 'string') ? req.clientName : (req.clientName || 'Cliente');
    const pests = Array.isArray(req.pestTypes) ? req.pestTypes.join(', ') : (req.pestType || req.pestTypes || '');
    const subject = 'Lozanor: Nueva solicitud';
    const body = 'Nueva solicitud en Lozanor App.\n\nCliente: ' + clientName + '\nPlagas: ' + pests + '\nUrgencia: ' + (req.urgency || 'Media') + '\nComentario: ' + (req.comment || '') + '\n\nRevisá la pestaña Solicitudes para agendar.';
    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch (e) {
    Logger.log('Error enviando email nueva solicitud: ' + e.toString());
  }
}

// Envía emails de recordatorio el día y hora de la alarma (no al crear la nota).
// Ejecutar runReminderEmails() cada 15 min mediante un trigger: en el editor de Apps Script
// Ejecutar una vez installReminderTrigger() para crear el trigger automáticamente.
function runReminderEmails() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    const sheet = ss.getSheetByName('Notes');
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    if (lastRow < 2) return;

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0].map(function(h) { return String(h || '').trim(); });
    let colId = headers.indexOf('id');
    let colReminderAt = headers.indexOf('reminderAt');
    let colText = headers.indexOf('text');
    let colSentAt = headers.indexOf('reminderEmailSentAt');
    if (colId === -1 || colReminderAt === -1 || colText === -1) return;

    if (colSentAt === -1) {
      colSentAt = headers.length;
      sheet.getRange(1, colSentAt + 1).setValue('reminderEmailSentAt');
    }

    const now = new Date();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var sentAt = row[colSentAt];
      if (sentAt) continue;
      var reminderAt = row[colReminderAt];
      var text = row[colText];
      if (!text) continue;
      var reminderDate = null;
      if (reminderAt instanceof Date && !isNaN(reminderAt.getTime())) {
        reminderDate = reminderAt;
      } else if (typeof reminderAt === 'string' && reminderAt.trim()) {
        reminderDate = new Date(reminderAt.trim());
      }
      if (!reminderDate || isNaN(reminderDate.getTime()) || reminderDate > now) continue;

      try {
        var subject = 'Lozanor: Alarma / Recordatorio';
        var body = 'Recordatorio en Lozanor App.\n\n' + (text || '') + '\n\nFecha/hora del recordatorio: ' + (reminderAt ? (reminderAt instanceof Date ? reminderAt.toISOString() : reminderAt) : '');
        MailApp.sendEmail(ADMIN_EMAIL, subject, body);
        sheet.getRange(i + 1, colSentAt + 1).setValue(Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"));
      } catch (mailErr) {
        Logger.log('Error enviando email recordatorio fila ' + (i + 1) + ': ' + mailErr.toString());
      }
    }
  } catch (e) {
    Logger.log('Error runReminderEmails: ' + e.toString());
  }
}

// Ejecutá esta función UNA VEZ desde el editor (Ejecutar > installReminderTrigger) para que los recordatorios se envíen solos cada 15 minutos.
function installReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runReminderEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('runReminderEmails').timeBased().everyMinutes(15).create();
  Logger.log('Trigger instalado: runReminderEmails cada 15 minutos.');
}

// --- RECOMENDADOR: GEMINI o GROQ (ambos con plan gratuito) ---
// Distancia en km entre dos puntos (Haversine). Si tenés lat/lng en clientes, la IA puede ordenar por proximidad real.
function haversineKm_(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  var la1 = Number(lat1), lo1 = Number(lon1), la2 = Number(lat2), lo2 = Number(lon2);
  if (isNaN(la1) || isNaN(lo1) || isNaN(la2) || isNaN(lo2)) return null;
  var R = 6371;
  var dLat = (la2 - la1) * Math.PI / 180;
  var dLon = (lo2 - lo1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Arma bloque de distancias para el prompt. baseCoords opcional: { lat, lng } = punto de partida/regreso.
function buildDistanceBlock_(pendientes, visitasProgramadas, baseCoords) {
  var items = [];
  (pendientes || []).forEach(function(p, i) {
    items.push({ label: 'P' + (i + 1), name: p.clientName || 'Cliente', lat: p.lat, lng: p.lng });
  });
  (visitasProgramadas || []).forEach(function(v, i) {
    items.push({ label: 'V' + (i + 1), name: v.clientName || 'Cliente', lat: v.lat, lng: v.lng });
  });
  var withCoord = [];
  for (var i = 0; i < items.length; i++) {
    var lat = items[i].lat != null ? Number(items[i].lat) : NaN;
    var lng = items[i].lng != null ? Number(items[i].lng) : NaN;
    if (!isNaN(lat) && !isNaN(lng)) withCoord.push({ index: i, label: items[i].label, name: items[i].name, lat: lat, lng: lng });
  }
  var baseLat = baseCoords && (baseCoords.lat != null) ? Number(baseCoords.lat) : NaN;
  var baseLng = baseCoords && (baseCoords.lng != null) ? Number(baseCoords.lng) : NaN;
  var hasBase = !isNaN(baseLat) && !isNaN(baseLng);
  var lines = [];
  if (hasBase && withCoord.length >= 1) {
    for (var i = 0; i < withCoord.length; i++) {
      var km = haversineKm_(baseLat, baseLng, withCoord[i].lat, withCoord[i].lng);
      if (km != null) lines.push('Base-' + withCoord[i].label + ': ' + km + ' km');
    }
  }
  if (withCoord.length >= 2) {
    for (var i = 0; i < withCoord.length; i++) {
      for (var j = i + 1; j < withCoord.length; j++) {
        var km = haversineKm_(withCoord[i].lat, withCoord[i].lng, withCoord[j].lat, withCoord[j].lng);
        if (km != null) lines.push(withCoord[i].label + '-' + withCoord[j].label + ': ' + km + ' km');
      }
    }
  }
  if (lines.length === 0) return '';
  var intro = 'DISTANCIAS (km, en línea recta).';
  if (hasBase) intro += ' Base = punto de partida y regreso del fumigador.';
  intro += ' P1,P2,... = pendientes; V1,V2,... = ya programadas:\n';
  return intro + lines.join('; ') + '\n\nUsá estas distancias para sugerir el orden real por proximidad (salir de Base, hacer visitas, volver a Base).';
}
// Proveedor: CONFIG.AI_PROVIDER = 'gemini' | 'groq' (o propiedad de script AI_PROVIDER)
function getAiProvider_() {
  var p = (CONFIG.AI_PROVIDER || '').toString().toLowerCase();
  if (p === 'groq' || p === 'gemini') return p;
  try {
    p = PropertiesService.getScriptProperties().getProperty('AI_PROVIDER') || '';
    if ((p = p.toString().toLowerCase()) === 'groq' || p === 'gemini') return p;
  } catch (e) {}
  return 'gemini';
}

function getGeminiApiKey_() {
  if (CONFIG.GEMINI_API_KEY && String(CONFIG.GEMINI_API_KEY).trim()) {
    return String(CONFIG.GEMINI_API_KEY).trim();
  }
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    return key ? String(key).trim() : '';
  } catch (e) {
    return '';
  }
}

function getGroqApiKey_() {
  if (CONFIG.GROQ_API_KEY && String(CONFIG.GROQ_API_KEY).trim()) {
    return String(CONFIG.GROQ_API_KEY).trim();
  }
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
    return key ? String(key).trim() : '';
  } catch (e) {
    return '';
  }
}

// Llama a Groq (OpenAI-compatible). messages: [{ role: 'user', content: '...' }]. Devuelve { text, finishReason }.
function callGroq_(messages, maxCompletionTokens) {
  var apiKey = getGroqApiKey_();
  if (!apiKey) return { text: '', finishReason: '', error: 'No está configurada GROQ_API_KEY.' };
  var url = 'https://api.groq.com/openai/v1/chat/completions';
  var body = {
    model: 'llama-3.3-70b-versatile',
    messages: messages,
    temperature: 0.3,
    max_completion_tokens: maxCompletionTokens || 8192
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + apiKey },
    fetchTimeoutSeconds: 120
  };
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) {
    try {
      var err = JSON.parse(text);
      return { text: '', finishReason: '', error: 'Groq (' + code + '): ' + (err.error && err.error.message ? err.error.message : text) };
    } catch (e) {
      return { text: '', finishReason: '', error: 'Groq (' + code + '): ' + text };
    }
  }
  try {
    var data = JSON.parse(text);
    var choice = data.choices && data.choices[0];
    var content = (choice && choice.message && choice.message.content) ? choice.message.content : '';
    var finishReason = (choice && choice.finish_reason) ? choice.finish_reason : '';
    return { text: content || 'Sin respuesta.', finishReason: finishReason, error: '' };
  } catch (e) {
    return { text: '', finishReason: '', error: 'Error parseando respuesta Groq: ' + e.toString() };
  }
}

function isGroqPayloadTooLargeError_(errorText) {
  var msg = (errorText || '').toString().toLowerCase();
  return msg.indexOf('413') !== -1 || msg.indexOf('request too large') !== -1 || msg.indexOf('tokens per minute') !== -1;
}

function truncatePromptForGroq_(prompt, maxChars) {
  var txt = (prompt || '').toString();
  if (!maxChars || txt.length <= maxChars) return txt;
  var keep = Math.max(1200, maxChars - 180);
  return txt.slice(0, keep) + '\n\n[Contexto resumido automáticamente para cumplir límites de Groq.]';
}

function callGroqPromptWithFallback_(prompt, maxCompletionTokens) {
  var requested = Number(maxCompletionTokens) || 2048;
  var attempts = [
    { maxTokens: Math.min(requested, 4096), maxChars: 26000 },
    { maxTokens: 2048, maxChars: 18000 },
    { maxTokens: 1024, maxChars: 12000 },
    { maxTokens: 768, maxChars: 9000 }
  ];
  var last = null;
  for (var i = 0; i < attempts.length; i++) {
    var a = attempts[i];
    var compactPrompt = truncatePromptForGroq_(prompt, a.maxChars);
    last = callGroq_([{ role: 'user', content: compactPrompt }], a.maxTokens);
    last.usedPrompt = compactPrompt;
    last.usedMaxTokens = a.maxTokens;
    if (!last.error) return last;
    if (!isGroqPayloadTooLargeError_(last.error)) return last;
  }
  if (last && last.error && isGroqPayloadTooLargeError_(last.error)) {
    last.error += '. Probá desmarcando una de las opciones ("pendientes" o "visitas programadas") para enviar menos contexto.';
  }
  return last || { text: '', finishReason: '', error: 'No se pudo obtener respuesta de Groq.' };
}

function buildRecommendationPrompt_(payload) {
  var p = payload || {};
  var pendientes = p.pendientes || [];
  var visitasProgramadas = p.visitasProgramadas || [];
  var aplicacionesRecientes = p.aplicacionesRecientes || [];
  var nonWorkingDays = Array.isArray(p.nonWorkingDays) ? p.nonWorkingDays : [];
  var lines = [];
  if (pendientes.length > 0) {
    lines.push('VISITAS PENDIENTES (sin fecha aun, hay que agendarlas):');
    pendientes.forEach(function(item, i) {
      lines.push((i + 1) + '. ' + (item.clientName || 'Cliente') + ' | ' + (item.address || 'Sin direccion') + ' | ' + (item.type || ''));
    });
  }
  if (visitasProgramadas.length > 0) {
    lines.push('');
    lines.push('VISITAS YA PROGRAMADAS (a partir de manana):');
    visitasProgramadas.forEach(function(v, i) {
      lines.push((i + 1) + '. ' + (v.clientName || 'Cliente') + ' | ' + (v.address || '') + ' | ' + (v.date || '') + ' ' + (v.time || ''));
    });
  }
  if (aplicacionesRecientes.length > 0) {
    lines.push('');
    lines.push('ULTIMA APLICACION REALIZADA (por cliente/tratamiento) - la siguiente aplicacion no puede ser antes de ~15 dias:');
    aplicacionesRecientes.forEach(function(a, i) {
      lines.push((i + 1) + '. ' + (a.clientName || 'Cliente') + ' | ' + (a.address || '') + ' | ultima aplicacion realizada el ' + (a.lastApplicationDate || '') + ' -> la proxima es aplicacion ' + (a.nextApplicationNumber || '') + ' de ' + (a.totalApplications || ''));
    });
  }
  if (lines.length === 0) {
    return { error: 'No hay datos para recomendar. Marca al menos "Pendientes del mes" o "Visitas programadas desde manana".', prompt: '' };
  }
  var baseAddress = (CONFIG.BASE_ADDRESS || '').toString().trim();
  if (baseAddress) {
    lines.unshift('PUNTO DE PARTIDA Y DE REGRESO (el fumigador sale y vuelve aca cada dia): ' + baseAddress);
    lines.unshift('');
  }
  var baseCoords = null;
  var blat = CONFIG.BASE_LAT != null ? Number(CONFIG.BASE_LAT) : NaN;
  var blng = CONFIG.BASE_LNG != null ? Number(CONFIG.BASE_LNG) : NaN;
  if (!isNaN(blat) && !isNaN(blng)) baseCoords = { lat: blat, lng: blng };
  var dataBlock = lines.join('\n');
  var distanceBlock = buildDistanceBlock_(pendientes, visitasProgramadas, baseCoords);
  if (distanceBlock) dataBlock = dataBlock + '\n\n' + distanceBlock;
  var tz = 'America/Argentina/Buenos_Aires';
  var now = new Date();
  var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  var tomorrowStr = Utilities.formatDate(tomorrowDate, tz, 'yyyy-MM-dd');
  var fechaRef = 'FECHA DE REFERENCIA: Hoy es ' + todayStr + '. Manana es ' + tomorrowStr + '. Las sugerencias de dias deben ser A PARTIR DE MANANA (incluyendo manana si aplica), no empezar recien el lunes. Si manana es jueves, sugeri visitas para jueves, viernes, sabado, etc. segun convenga.';
  var reglaAplicaciones = aplicacionesRecientes.length > 0
    ? ' REGLA IMPORTANTE: Entre una aplicacion y la siguiente del mismo tratamiento debe haber aproximadamente 15 dias. Para los clientes listados en "ULTIMA APLICACION REALIZADA", no sugerir la siguiente aplicacion antes de 15 dias desde esa fecha (contando desde el dia siguiente a la fecha indicada).'
    : '';
  var reglaNoLaborables = nonWorkingDays.length > 0
    ? (' DIAS NO LABORABLES: ' + nonWorkingDays.join(', ') + '. NO programes visitas en esas fechas.')
    : '';
  var prompt = 'Sos un asistente que ayuda a planificar rutas de visitas a domicilio en Argentina. ' +
    fechaRef + '\n\n' +
    'Tenes esta informacion (nombre cliente, direccion, tipo de visita).\n\n' + dataBlock + '\n\n' +
    'Restricciones: ventana horaria de 7:00 a 15:00, aproximadamente 45 minutos por visita. Cada dia el recorrido sale desde el punto de partida/regreso y debe volver ahi.' + reglaAplicaciones + reglaNoLaborables + ' ' +
    (distanceBlock ? 'Si aparecen DISTANCIAS en km (incluyendo Base), usa esas distancias para ordenar por proximidad real. ' : '') +
    'Recomenda un orden por proximidad geografica (agrupando por zona/barrio/localidad cuando sea posible) y sugeri a partir de manana que dia conviene hacer cada PENDIENTE y en que orden ese dia, considerando las visitas ya programadas. ' +
    'Responde en espanol, de forma clara y directa, con dias (Lunes, Martes, etc.) y horarios sugeridos (ej. 7:00, 7:45, 8:30...). Da la respuesta COMPLETA de punta a punta; no la cortes a la mitad.';
  return { error: '', prompt: prompt };
}

function getGroqRecommendation(payload) {
  if (payload && payload.sessionToken) requireSession_(payload.sessionToken);
  var apiKey = getGroqApiKey_();
  if (!apiKey) {
    return 'Error: Para usar Groq configurá GROQ_API_KEY (Propiedades de script o CONFIG.GROQ_API_KEY) y CONFIG.AI_PROVIDER = "groq". Clave gratis en https://console.groq.com';
  }
  var built = buildRecommendationPrompt_(payload);
  if (built.error) return built.error;
  var result = callGroqPromptWithFallback_(built.prompt, 4096);
  if (result.error) return 'Error: ' + result.error;
  var out = result.text || 'Sin respuesta.';
  if (result.finishReason === 'length') {
    out += '\n\n[La respuesta pudo cortarse por longitud. Podés pedir "continuá desde donde quedó" en el chat.]';
  }
  return out;
}

function getGroqChatReply(payload) {
  if (payload && payload.sessionToken) requireSession_(payload.sessionToken);
  var apiKey = getGroqApiKey_();
  if (!apiKey) {
    return 'Error: Para usar Groq configurá GROQ_API_KEY y CONFIG.AI_PROVIDER = "groq".';
  }
  var conversationText = payload.conversationText || '';
  var userMessage = (payload.userMessage || '').trim();
  if (!userMessage) return 'Escribí una pregunta o pedido.';
  var prompt = 'Sos un asistente que ayuda a planificar visitas a domicilio (rutas, horarios 7-15, ~45 min por visita). ' +
    'El usuario ya recibió una recomendación y ahora hace una pregunta de seguimiento.\n\n';
  if (conversationText) {
    prompt += 'Contexto de la conversación anterior:\n' + conversationText + '\n\n';
  }
  prompt += 'Pregunta o pedido del usuario: ' + userMessage + '\n\nRespondé en español, de forma clara y directa. Dá la respuesta COMPLETA; no la cortes a la mitad.';
  var result = callGroqPromptWithFallback_(prompt, 2048);
  if (result.error) return 'Error: ' + result.error;
  var out = result.text || 'Sin respuesta.';
  if (result.finishReason === 'length') {
    out += '\n\n[La respuesta pudo cortarse. Podés pedir "continuá" en el siguiente mensaje.]';
  }
  return out;
}

/**
 * Recibe payload: { pendientes, visitasProgramadas, aplicacionesRecientes }
 * aplicacionesRecientes: [{ clientName, address, lastApplicationDate, nextApplicationNumber, totalApplications }]
 * Devuelve texto con la recomendación. Usa Groq si AI_PROVIDER es 'groq', sino Gemini.
 */
function getGeminiRecommendation(payload) {
  if (payload && payload.sessionToken) requireSession_(payload.sessionToken);
  if (getAiProvider_() === 'groq') {
    return getGroqRecommendation(payload);
  }
  var apiKey = getGeminiApiKey_();
  if (!apiKey) {
    return 'Error: No está configurada la API key de Gemini. En el editor de Apps Script: Proyecto > Propiedades del proyecto > Propiedades de script > agregar GEMINI_API_KEY con tu clave de https://aistudio.google.com/app/apikey (gratis).';
  }
  var built = buildRecommendationPrompt_(payload);
  if (built.error) return built.error;
  var prompt = built.prompt;
  try {
    // Modelo con cuota gratuita (Gemini 2.5 Flash). Límite salida hasta 65536 tokens en free tier; usamos 16384 para respuestas largas.
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: 'text/plain'
      }
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      fetchTimeoutSeconds: 120
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    if (code !== 200) {
      try {
        var err = JSON.parse(text);
        return 'Error de la API Gemini (' + code + '): ' + (err.error && err.error.message ? err.error.message : text);
      } catch (e) {
        return 'Error de la API Gemini (' + code + '): ' + text;
      }
    }
    var data = JSON.parse(text);
    var candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      return 'La API no devolvió texto. Respuesta: ' + JSON.stringify(data);
    }
    var out = candidate.content.parts[0].text || 'Sin respuesta.';
    if (candidate.finishReason === 'MAX_TOKENS') {
      out += '\n\n[La respuesta pudo cortarse por longitud. Podés pedir "continuá desde donde quedó" en el chat.]';
    }
    return out;
  } catch (e) {
    Logger.log('getGeminiRecommendation error: ' + e.toString());
    return 'Error al llamar a Gemini: ' + (e.message || e.toString());
  }
}

function getRecommendationWithDebug(payload) {
  if (payload && payload.sessionToken) requireSession_(payload.sessionToken);
  var provider = getAiProvider_();
  var built = buildRecommendationPrompt_(payload);
  if (built.error) {
    return { text: built.error, prompt: '', provider: provider, error: '' };
  }

  if (provider === 'groq') {
    var apiKey = getGroqApiKey_();
    if (!apiKey) {
      return {
        text: 'Error: Para usar Groq configurá GROQ_API_KEY (Propiedades de script o CONFIG.GROQ_API_KEY) y CONFIG.AI_PROVIDER = "groq". Clave gratis en https://console.groq.com',
        prompt: built.prompt,
        provider: provider,
        error: 'missing_api_key'
      };
    }
    var groqResult = callGroqPromptWithFallback_(built.prompt, 4096);
    if (groqResult.error) {
      return { text: 'Error: ' + groqResult.error, prompt: groqResult.usedPrompt || built.prompt, provider: provider, error: groqResult.error };
    }
    var out = groqResult.text || 'Sin respuesta.';
    if (groqResult.finishReason === 'length') {
      out += '\n\n[La respuesta pudo cortarse por longitud. Podés pedir "continuá desde donde quedó" en el chat.]';
    }
    return { text: out, prompt: groqResult.usedPrompt || built.prompt, provider: provider, error: '' };
  }

  var text = getGeminiRecommendation(payload);
  return { text: text, prompt: built.prompt, provider: provider, error: '' };
}

/**
 * Chat de seguimiento: recibe el historial de conversación (texto) y el mensaje nuevo del usuario.
 * payload: { conversationText: string, userMessage: string }
 * Usa Groq si AI_PROVIDER es 'groq', sino Gemini.
 */
function getGeminiChatReply(payload) {
  if (payload && payload.sessionToken) requireSession_(payload.sessionToken);
  if (getAiProvider_() === 'groq') {
    return getGroqChatReply(payload);
  }
  var apiKey = getGeminiApiKey_();
  if (!apiKey) {
    return 'Error: No está configurada la API key de Gemini.';
  }
  var conversationText = payload.conversationText || '';
  var userMessage = (payload.userMessage || '').trim();
  if (!userMessage) {
    return 'Escribí una pregunta o pedido.';
  }
  var prompt = 'Sos un asistente que ayuda a planificar visitas a domicilio (rutas, horarios 7-15, ~45 min por visita). ' +
    'El usuario ya recibió una recomendación y ahora hace una pregunta de seguimiento.\n\n';
  if (conversationText) {
    prompt += 'Contexto de la conversación anterior:\n' + conversationText + '\n\n';
  }
  prompt += 'Pregunta o pedido del usuario: ' + userMessage + '\n\nRespondé en español, de forma clara y directa. Dá la respuesta COMPLETA; no la cortes a la mitad.';
  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'text/plain'
      }
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      fetchTimeoutSeconds: 120
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    if (code !== 200) {
      try {
        var err = JSON.parse(text);
        return 'Error de la API (' + code + '): ' + (err.error && err.error.message ? err.error.message : text);
      } catch (e) {
        return 'Error de la API (' + code + '): ' + text;
      }
    }
    var data = JSON.parse(text);
    var candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      return 'La API no devolvió texto.';
    }
    var out = candidate.content.parts[0].text || 'Sin respuesta.';
    if (candidate.finishReason === 'MAX_TOKENS') {
      out += '\n\n[La respuesta pudo cortarse. Podés pedir "continuá" en el siguiente mensaje.]';
    }
    return out;
  } catch (e) {
    Logger.log('getGeminiChatReply error: ' + e.toString());
    return 'Error: ' + (e.message || e.toString());
  }
}

// =============================================================================
// Google Calendar: bloques genéricos "Lozanor" (misma cuenta que ejecuta el script)
// =============================================================================

function readVisitGoogleCalendarEventIdFromSheet_(ss, visitId) {
  if (!visitId || !ss) return '';
  var names = ['Visits'];
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (isVisitArchiveSheetName_(n)) names.push(n);
  });
  for (var s = 0; s < names.length; s++) {
    var sheet = ss.getSheetByName(names[s]);
    if (!sheet) continue;
    var lr = sheet.getLastRow();
    var lc = sheet.getLastColumn();
    if (lr < 2 || lc < 1) continue;
    var headers = sheet.getRange(1, 1, 1, lc).getValues()[0].map(function (h) {
      return String(h || '').trim();
    });
    var idCol = headers.indexOf('id');
    var gCol = headers.indexOf('googleCalendarEventId');
    if (idCol === -1 || gCol === -1) continue;
    var ids = sheet.getRange(2, idCol + 1, lr, idCol + 1).getValues();
    var vals = sheet.getRange(2, gCol + 1, lr, gCol + 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(visitId)) return String(vals[i][0] || '').trim();
    }
  }
  return '';
}

function readClientNameById_(ss, clientId) {
  if (!ss || clientId === null || clientId === undefined) return '';
  var cid = String(clientId).trim();
  if (!cid) return '';
  var sh = ss.getSheetByName('Clients');
  if (!sh) return '';
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return '';
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var idCol = headers.indexOf('id');
  var nameCol = headers.indexOf('name');
  if (nameCol === -1) nameCol = headers.indexOf('clientName');
  if (idCol === -1 || nameCol === -1) return '';
  var idCol1 = idCol + 1;
  var nameCol1 = nameCol + 1;
  var ids = sh.getRange(2, idCol1, lr, idCol1).getValues();
  var names = sh.getRange(2, nameCol1, lr, nameCol1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === cid) return String(names[i][0] || '').trim();
  }
  return '';
}

function sanitizeCalendarEventTitle_(s) {
  return String(s || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

function buildLozanorCalendarEventTitle_(visit) {
  var prefix = (CONFIG.LOZANOR_CALENDAR_EVENT_TITLE || 'Lozanor').toString().trim() || 'Lozanor';
  var cn = '';
  if (visit && visit.clientName && String(visit.clientName).trim()) {
    cn = String(visit.clientName).trim();
  } else if (visit && visit.clientId) {
    try {
      cn = readClientNameById_(getSpreadsheet_(), visit.clientId);
    } catch (e) {
      Logger.log('buildLozanorCalendarEventTitle_: ' + e);
    }
  }
  if (!cn) cn = 'Cliente';
  return sanitizeCalendarEventTitle_(prefix + ': ' + cn);
}

function visitHasTruthyDeletedAt_(visit) {
  var d = visit && visit.deletedAt;
  if (d === null || d === undefined) return false;
  return String(d).trim().length > 0;
}

function visitStartAndEndDates_(visit) {
  var v = visit || {};
  if (!v.date) return null;
  var norm = normalizeDate(v.date);
  if (!norm) return null;
  var ex = extractDateAndTime(norm);
  if (!ex || !ex.date) return null;
  var timeStr = normalizeTimeValue(v.time || ex.time || '09:00');
  var hm = String(timeStr).split(':');
  var hh = parseInt(hm[0], 10);
  var mm = parseInt(hm[1], 10) || 0;
  if (isNaN(hh)) hh = 9;
  if (isNaN(mm)) mm = 0;
  var ymd = ex.date.split('-');
  var y = parseInt(ymd[0], 10);
  var mo = parseInt(ymd[1], 10) - 1;
  var d = parseInt(ymd[2], 10);
  if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
  var start = new Date(y, mo, d, hh, mm, 0, 0);
  var dur = parseInt(CONFIG.CALENDAR_EVENT_DURATION_MINUTES, 10);
  if (isNaN(dur) || dur < 10) dur = 45;
  if (dur > 24 * 60) dur = 24 * 60;
  var end = new Date(start.getTime() + dur * 60 * 1000);
  return { start: start, end: end };
}

function visitShouldBlockGoogleCalendar_(visit) {
  if (!visit) return false;
  if (visitHasTruthyDeletedAt_(visit)) return false;
  var st = String(visit.status || '').trim();
  if (st === 'CANCELADA' || st === 'REALIZADA' || st === 'OMITIDA_MES') return false;
  var bounds = visitStartAndEndDates_(visit);
  return !!(bounds && bounds.start && !isNaN(bounds.start.getTime()));
}

function safeDeleteCalendarEventById_(calendar, eventId) {
  if (!calendar || !eventId) return;
  try {
    var ev = calendar.getEventById(String(eventId));
    if (ev) ev.deleteEvent();
  } catch (e) {
    Logger.log('safeDeleteCalendarEventById_: ' + e);
  }
}

function syncVisitRowToGoogleCalendar_(visit) {
  var calId = (CONFIG.GOOGLE_CALENDAR_ID || '').toString().trim();
  if (!calId) {
    return { ok: true, skipped: true, googleCalendarEventId: String((visit && visit.googleCalendarEventId) || '') };
  }
  var calendar = null;
  try {
    calendar = CalendarApp.getCalendarById(calId);
  } catch (e) {
    Logger.log('CalendarApp.getCalendarById: ' + e);
  }
  if (!calendar) {
    Logger.log('Lozanor Calendar: no se pudo abrir el calendario con ID: ' + calId);
    return { ok: false, error: 'calendar_not_found', googleCalendarEventId: String((visit && visit.googleCalendarEventId) || '') };
  }

  var prevId = String((visit && visit.googleCalendarEventId) || '').trim();
  var title = buildLozanorCalendarEventTitle_(visit);
  var wants = visitShouldBlockGoogleCalendar_(visit);
  var bounds = wants ? visitStartAndEndDates_(visit) : null;

  if (!wants || !bounds) {
    if (prevId) safeDeleteCalendarEventById_(calendar, prevId);
    return { ok: true, googleCalendarEventId: '' };
  }

  var start = bounds.start;
  var end = bounds.end;
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    if (prevId) safeDeleteCalendarEventById_(calendar, prevId);
    return { ok: true, googleCalendarEventId: '' };
  }

  if (prevId) {
    var ev = null;
    try {
      ev = calendar.getEventById(prevId);
    } catch (e2) {
      ev = null;
    }
    if (ev) {
      try {
        ev.setTitle(title);
        ev.setTime(start, end);
        if (typeof ev.setDescription === 'function') ev.setDescription('');
      } catch (e3) {
        Logger.log('Error actualizando evento Calendar: ' + e3);
      }
      try {
        ev.setTransparency(CalendarApp.EventTransparency.OPAQUE);
      } catch (ignore) {}
      return { ok: true, googleCalendarEventId: prevId };
    }
  }

  var created = calendar.createEvent(title, start, end, { description: '' });
  var newId = created.getId();
  try {
    created.setTransparency(CalendarApp.EventTransparency.OPAQUE);
  } catch (ignore2) {}
  return { ok: true, googleCalendarEventId: newId };
}

function patchVisitGoogleCalendarEventId_(visitId, googleCalendarEventId) {
  if (!visitId) return;
  var ss = getSpreadsheet_();
  if (!ss) return;
  var sh = ss.getSheetByName('Visits');
  if (!sh) return;
  var lr = sh.getLastRow();
  if (lr < 2) return;
  var lc = sh.getLastColumn();
  if (lc < 1) return;
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var idCol = headers.indexOf('id');
  if (idCol === -1) return;
  var gCol = headers.indexOf('googleCalendarEventId');
  if (gCol === -1) {
    sh.getRange(1, lc + 1).setValue('googleCalendarEventId');
    gCol = lc;
  }
  var idCol1 = idCol + 1;
  var gCol1 = gCol + 1;
  var idMatrix = sh.getRange(2, idCol1, lr, idCol1).getValues();
  for (var i = 0; i < idMatrix.length; i++) {
    if (String(idMatrix[i][0]) === String(visitId)) {
      sh.getRange(i + 2, gCol1).setValue(googleCalendarEventId || '');
      return;
    }
  }
}

function afterVisitRowSavedCalendarSync_(dataObj) {
  var ss = getSpreadsheet_();
  var visit = dataObj;
  if (ss && dataObj && dataObj.id) {
    try {
      var fromSheet = readVisitRowFromSheet_(ss, dataObj.id);
      if (fromSheet) {
        visit = {};
        Object.keys(fromSheet).forEach(function (k) { visit[k] = fromSheet[k]; });
        Object.keys(dataObj).forEach(function (k) {
          var v = dataObj[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            visit[k] = v;
          }
        });
      }
    } catch (mergeErr) {
      Logger.log('afterVisitRowSavedCalendarSync_ merge: ' + mergeErr);
    }
  }
  var syn = syncVisitRowToGoogleCalendar_(visit);
  var nextId = syn.googleCalendarEventId !== undefined ? String(syn.googleCalendarEventId || '') : String(visit.googleCalendarEventId || '');
  var prevId = String(visit.googleCalendarEventId || '');
  if (nextId !== prevId) {
    patchVisitGoogleCalendarEventId_(visit.id, nextId);
  }
  return syn;
}

/**
 * Ejecutar UNA VEZ desde el editor (▶) después de pegar GOOGLE_CALENDAR_ID.
 * Crea y borra un evento de prueba; si falla, revisá ID y permisos.
 */
function testLozanorCalendarAccess() {
  var id = (CONFIG.GOOGLE_CALENDAR_ID || '').toString().trim();
  if (!id) return 'Configurá CONFIG.GOOGLE_CALENDAR_ID en Code.gs (ID del calendario secundario).';
  var cal = CalendarApp.getCalendarById(id);
  if (!cal) return 'No se pudo abrir el calendario. Revisá el ID y que este proyecto use la cuenta que es dueña del calendario (o que esté compartido con permiso de hacer cambios).';
  var now = new Date();
  var start = new Date(now.getTime() + 3 * 60 * 1000);
  var end = new Date(start.getTime() + 15 * 60 * 1000);
  var ev = cal.createEvent('Lozanor — prueba (podés borrar)', start, end);
  ev.deleteEvent();
  return 'OK: Calendar responde. Ya podés usar la app; al guardar visitas se crearán bloques "Lozanor".';
}

/**
 * Opcional: re-sincroniza todas las filas de Visits (útil la primera vez o si hubo errores).
 * Ejecutar desde el editor Apps Script.
 */
function repairLozanorCalendarAllVisits() {
  var data = getData();
  var visits = data.visits || [];
  var ok = 0;
  visits.forEach(function (v) {
    try {
      afterVisitRowSavedCalendarSync_(v);
      ok++;
    } catch (e) {
      Logger.log('repair visit ' + (v && v.id) + ': ' + e);
    }
  });
  Logger.log('repairLozanorCalendarAllVisits visitas procesadas: ' + ok);
  return ok;
}

/*
  ---------- PASOS MANUALES (vos) ----------

  1) Google Calendar (web) con la MISMA cuenta con la que publicás / ejecutás esta app (p. ej. la cuenta dueña del Apps Script).
  2) Crear calendario nuevo: "+" junto a "Otros calendarios" > Crear calendario. Nombre sugerido: "Lozanor".
  3) Abrir ese calendario > engranaje "Configuración y uso" > desplazá hasta "Integrar calendario" y copiá el "ID de calendario".
  4) En Code.gs, pegá ese valor en CONFIG.GOOGLE_CALENDAR_ID (entre comillas).
  5) Copiá el archivo appsscript.json de este proyecto al proyecto en script.google.com (o en el editor: Proyecto > Ajustes del proyecto > ver manifest), para que figuren los permisos de Calendar, Sheets, etc.
  6) En Apps Script: seleccioná la función testLozanorCalendarAccess > Ejecutar. Aceptá el permiso de Google Calendar.
  7) Volvé a desplegar la aplicación web si hace falta (Implementar > Gestionar implementaciones > Editar > Versión nueva).
  8) En la app, al guardar una visita con fecha/hora (no cancelada, no realizada, no borrada), aparece un bloque con el título configurado (por defecto "Lozanor"). Al cancelar, realizar, borrar o quitar la fecha, el bloque se borra o deja de actualizarse según corresponda.
  9) Opcional: en el editor ejecutá repairLozanorCalendarAllVisits() una vez para alinear visitas viejas.

  Nota: la Web App debe ejecutarse como "Yo" (la cuenta donde está el calendario) para que CalendarApp pueda escribir ahí.
*/