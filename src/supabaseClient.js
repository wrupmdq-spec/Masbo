import { createClient } from "@supabase/supabase-js";

// Tus datos de proyecto Mas Boronat en Supabase
const SUPABASE_URL = "https://qzlemfnhmhesxiqvltxg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QQiMgDTJbkjphD2WLWWHeg_R49phF7p";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Estas dos funciones sustituyen a window.storage.get / window.storage.set
// que solo existían dentro del entorno de artefactos de Claude.
// La tabla "hotelops_kv" es la que creaste con el SQL del paso 1.

export async function loadShared(key, fallback) {
  const { data, error } = await supabase
    .from("hotelops_kv")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  // Un error de red/permiso NO es lo mismo que "todavía no existe esta clave".
  // Si lo tratáramos igual, un fallo temporal podría hacer que la app piense
  // que no hay datos y los sobrescriba con valores en blanco. Por eso aquí
  // SIEMPRE lanzamos el error real, y solo devolvemos "fallback" cuando
  // Supabase confirma que sencillamente no existe esa fila todavía.
  if (error) throw error;
  if (!data) return fallback;
  return JSON.parse(data.value);
}

export async function saveShared(key, value) {
  try {
    const { error } = await supabase
      .from("hotelops_kv")
      .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
    if (error) console.error("Error al guardar", key, error);
  } catch (e) {
    console.error("Error al guardar", key, e);
  }
}

/* ---------------------------------------------------------------------- */
/* Autenticación y perfil (rol) del usuario                                 */
/* ---------------------------------------------------------------------- */

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// Lee el rol asignado al usuario logueado desde la tabla "profiles".
// Esa tabla la rellena el Administrador manualmente (Supabase → Table Editor).
export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, full_name, must_change_password")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error("Error al leer el perfil", e);
    return null;
  }
}

// Cambia la contraseña del usuario logueado (usado tanto en el primer login
// obligatorio como si en el futuro se añade un "cambiar mi contraseña" libre).
export async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

// Marca la cuenta propia como "ya no usa la contraseña genérica"
export async function markPasswordChanged() {
  try {
    const { error } = await supabase.rpc("mark_password_changed");
    if (error) console.error("Error marcando cambio de contraseña", error);
  } catch (e) {
    console.error("Error marcando cambio de contraseña", e);
  }
}

/* ---------------------------------------------------------------------- */
/* Registro de auditoría (quién hizo qué, y cuándo)                        */
/* ---------------------------------------------------------------------- */

export async function logAction({ email, role, module, action }) {
  try {
    await supabase.from("audit_log").insert({ user_email: email, role, module, action });
  } catch (e) {
    // Un fallo al registrar la auditoría no debe romper la acción principal del usuario
    console.error("Error al registrar auditoría", e);
  }
}

export async function fetchAuditLog(limit = 200) {
  try {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return data;
  } catch (e) {
    console.error("Error al leer auditoría", e);
    return [];
  }
}

/* ---------------------------------------------------------------------- */
/* Copia de seguridad manual (exporta todo a un archivo descargable)        */
/* ---------------------------------------------------------------------- */

// Pide la copia de seguridad al servidor, que comprueba allí mismo la contraseña
// (nunca viaja al navegador) y solo entrega los datos si es correcta y quien
// pregunta es administrador.
export async function requestBackup(password) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sesión no válida");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/download-backup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "No se pudo descargar la copia de seguridad");
  return json;
}

/* ---------------------------------------------------------------------- */
/* Directorio de personal y restablecimiento de contraseña (solo admin)     */
/* ---------------------------------------------------------------------- */

export async function fetchStaffDirectory() {
  try {
    const { data, error } = await supabase.rpc("get_staff_directory");
    if (error) {
      console.error("Error al leer el directorio de personal", error);
      return { items: [], error: error.message || String(error) };
    }
    return { items: data || [], error: null };
  } catch (e) {
    console.error("Error al leer el directorio de personal", e);
    return { items: [], error: String(e) };
  }
}

// Llama a la Edge Function "reset-password". Solo funciona si quien está
// logueado tiene rol admin (la función lo comprueba también en el servidor).
export async function adminResetPassword(targetUserId, newPassword) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sesión no válida");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ targetUserId, newPassword }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error al restablecer la contraseña");
  return json;
}

/* ---------------------------------------------------------------------- */
/* Asistencia diaria (¿quién abrió la app hoy?)                             */
/* ---------------------------------------------------------------------- */

// Se llama una vez por sesión al entrar. Marca "hoy ya entré" para el usuario logueado.
export async function recordDailyLogin() {
  try {
    const { error } = await supabase.rpc("record_daily_login");
    if (error) console.error("Error registrando asistencia", error);
  } catch (e) {
    console.error("Error registrando asistencia", e);
  }
}

// Solo funciona si quien llama es admin (comprobado también en el servidor)
export async function fetchDailyLogins(dateStr) {
  try {
    const { data, error } = await supabase.rpc("get_daily_logins", { target_date: dateStr });
    if (error) { console.error("Error leyendo asistencia", error); return { items: [], error: error.message || String(error) }; }
    return { items: data || [], error: null };
  } catch (e) {
    console.error("Error leyendo asistencia", e);
    return { items: [], error: String(e) };
  }
}

/* ---------------------------------------------------------------------- */
/* Tablas reales — una fila por registro (sustituye al sistema de bloques)  */
/* ---------------------------------------------------------------------- */

// Límite de seguridad (no es paginación real): evita que un token comprometido
// pueda volcar una tabla sin fin de una sola vez. 20.000 filas es una cifra muy
// por encima de lo que este hotel generará en años de uso normal (ni siquiera
// el histórico de reservas de restaurante, que es lo que más crece, se acerca
// a eso a corto/medio plazo) — así que no debería truncar nunca datos reales.
// Si algún día una tabla se acerca a este número, es la señal de implementar
// paginación real (y probablemente también de revisar el rendimiento, porque
// cargar 20.000 filas en el navegador ya sería lento antes de ser un problema
// de seguridad).
const SAFETY_ROW_LIMIT = 20000;

async function fetchTable(table, fromDb, orderBy) {
  let query = supabase.from(table).select("*").limit(SAFETY_ROW_LIMIT);
  if (orderBy) query = query.order(orderBy);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(fromDb);
}

async function syncTable(table, prevArr, nextArr, toDb, idKey = "id") {
  const prevById = Object.fromEntries((prevArr || []).map((r) => [r[idKey], r]));
  const nextIds = new Set((nextArr || []).map((r) => r[idKey]));
  const toUpsert = (nextArr || []).filter((r) => JSON.stringify(r) !== JSON.stringify(prevById[r[idKey]]));
  const toDelete = (prevArr || []).filter((r) => !nextIds.has(r[idKey]));

  if (toUpsert.length > 0) {
    const { error } = await supabase.from(table).upsert(toUpsert.map(toDb));
    if (error) throw error;
  }
  if (toDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in(idKey, toDelete.map((r) => r[idKey]));
    if (error) throw error;
  }
}

const roomToDb = (r) => ({
  id: r.id, type: r.type, number: r.number, capacity: r.capacity,
  cleaning_status: r.cleaningStatus, cleaning_notes: r.cleaningNotes,
  processed_checkouts: r.processedCheckouts || [],
});
const roomFromDb = (row) => ({
  id: row.id, type: row.type, number: row.number, capacity: row.capacity,
  cleaningStatus: row.cleaning_status, cleaningNotes: row.cleaning_notes,
  processedCheckouts: row.processed_checkouts || [],
});
export const fetchRooms = () => fetchTable("rooms", roomFromDb);
export const syncRooms = (prev, next) => syncTable("rooms", prev, next, roomToDb);

const guestFromDb = (row) => ({
  id: row.id, fullName: row.full_name, email: row.email, phone: row.phone,
  notes: row.notes, createdAt: row.created_at,
});
export const fetchGuests = () => fetchTable("guests", guestFromDb);

// Busca (o crea) el perfil de huésped correspondiente a este nombre.
// Se resuelve en una sola operación atómica en el servidor (función
// find_or_create_guest), por lo que es seguro aunque dos personas lo
// llamen al mismo tiempo para el mismo nombre nuevo: nunca crea duplicados.
export async function resolveGuestId(guestName) {
  const name = (guestName || "").trim();
  if (!name) return null;
  const { data, error } = await supabase.rpc("find_or_create_guest", { p_name: name });
  if (error) {
    console.error("Error resolviendo huésped", error);
    return null;
  }
  return data;
}

/* ---------------------------------------------------------------------- */
/* Directivas al personal (mensajes dirigidos + seguimiento de cumplimiento) */
/* ---------------------------------------------------------------------- */

// Directivas dirigidas a MÍ (el usuario logueado). Se filtra SIEMPRE aquí también,
// por el id exacto de mi cuenta — así, aunque el administrador vea más filas por
// permisos (para el registro), su propia campana nunca mezcla lo de los demás.
export async function fetchMyNotifications(myUserId) {
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("staff_notifications")
    .select("*")
    .eq("target_user_id", myUserId)
    .order("created_at", { ascending: false })
    .limit(SAFETY_ROW_LIMIT);
  if (error) { console.error("Error leyendo directivas", error); return []; }
  return data || [];
}

// Todas las directivas enviadas (solo admin la puede usar de verdad, por RLS)
export async function fetchAllNotifications() {
  const { data, error } = await supabase
    .from("staff_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(SAFETY_ROW_LIMIT);
  if (error) { console.error("Error leyendo el registro de directivas", error); return []; }
  return data || [];
}

export async function sendNotification(targetUserId, targetEmail, message, sentBy) {
  const id = "n-" + Math.random().toString(36).slice(2, 10);
  const { error } = await supabase.from("staff_notifications").insert({
    id, target_user_id: targetUserId, target_email: targetEmail, message, sent_by: sentBy, status: "Pendiente",
  });
  if (error) throw error;
  return id;
}

export async function updateNotificationStatus(id, status) {
  const { error } = await supabase
    .from("staff_notifications")
    .update({ status, completed_at: status === "Cumplido" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function askAssistant(message, context, history) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sesión no válida");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/assistant-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, context, history }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error al consultar al asistente");
  return json; // { reply, action }
}

export async function fetchGuestById(id) {
  const { data, error } = await supabase.from("guests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? guestFromDb(data) : null;
}

export async function saveGuestNotes(guestId, notes) {
  const { error } = await supabase.from("guests").update({ notes }).eq("id", guestId);
  if (error) throw error;
}

const stayToDb = (s) => ({
  id: s.id, room_id: s.roomId, guest_id: s.guestId || null, guest_name: s.guestName || "",
  check_in: s.checkIn, check_out: s.checkOut, num_guests: s.numGuests, meal_plan: s.mealPlan,
  status: s.status, amount_paid_before: s.amountPaidBefore || 0, amount_paid_after: s.amountPaidAfter || 0,
  group_id: s.groupId || null, checkout_processed: !!s.checkoutProcessed,
});
const stayFromDb = (row) => ({
  id: row.id, roomId: row.room_id, guestId: row.guest_id, guestName: row.guest_name,
  checkIn: row.check_in, checkOut: row.check_out, numGuests: row.num_guests, mealPlan: row.meal_plan,
  status: row.status, amountPaidBefore: Number(row.amount_paid_before) || 0, amountPaidAfter: Number(row.amount_paid_after) || 0,
  groupId: row.group_id, checkoutProcessed: row.checkout_processed,
});
export const fetchStays = () => fetchTable("stays", stayFromDb);
export const syncStays = (prev, next) => syncTable("stays", prev, next, stayToDb);

const bookingToDb = (b) => ({
  id: b.id, stay_id: b.stayId || null, guest_id: b.guestId || null, date: b.date, time_slot: b.timeSlot,
  time: b.time, client_type: b.clientType, room_label: b.roomLabel, guest_name: b.guestName || "",
  num_people: b.numPeople, contact: b.contact, menu_notes: b.menuNotes, allergens: b.allergens,
  notes: b.notes, amount_paid_before: b.amountPaidBefore || 0, amount_paid_after: b.amountPaidAfter || 0,
});
const bookingFromDb = (row) => ({
  id: row.id, stayId: row.stay_id, guestId: row.guest_id, date: row.date, timeSlot: row.time_slot,
  time: row.time, clientType: row.client_type, roomLabel: row.room_label, guestName: row.guest_name,
  numPeople: row.num_people, contact: row.contact, menuNotes: row.menu_notes, allergens: row.allergens,
  notes: row.notes, amountPaidBefore: Number(row.amount_paid_before) || 0, amountPaidAfter: Number(row.amount_paid_after) || 0,
});
export const fetchBookings = () => fetchTable("bookings", bookingFromDb);
export const syncBookings = (prev, next) => syncTable("bookings", prev, next, bookingToDb);

const ticketToDb = (t) => ({
  id: t.id, location: t.location, issue: t.issue, priority: t.priority, status: t.status,
  assigned_to: t.assignedTo, ticket_timestamp: t.timestamp, resolved_at: t.resolvedAt || null,
});
const ticketFromDb = (row) => ({
  id: row.id, location: row.location, issue: row.issue, priority: row.priority, status: row.status,
  assignedTo: row.assigned_to, timestamp: row.ticket_timestamp, resolvedAt: row.resolved_at,
});
export const fetchTickets = () => fetchTable("tickets", ticketFromDb);
export const syncTickets = (prev, next) => syncTable("tickets", prev, next, ticketToDb);

const eventToDb = (e) => ({
  id: e.id, title: e.title, event_type: e.eventType, date: e.date, start_time: e.startTime,
  end_time: e.endTime || null, space: e.space, expected_guests: e.expectedGuests ? Number(e.expectedGuests) : null,
  responsible: e.responsible, status: e.status, menu_notes: e.menuNotes, allergens: e.allergens, notes: e.notes,
});
const eventFromDb = (row) => ({
  id: row.id, title: row.title, eventType: row.event_type, date: row.date, startTime: row.start_time,
  endTime: row.end_time, space: row.space, expectedGuests: row.expected_guests, responsible: row.responsible,
  status: row.status, menuNotes: row.menu_notes, allergens: row.allergens, notes: row.notes,
});
export const fetchEvents = () => fetchTable("events", eventFromDb);
export const syncEvents = (prev, next) => syncTable("events", prev, next, eventToDb);

const salonToDb = (s) => ({
  id: s.id, name: s.name, category: s.category, color: s.color,
  cleaning_status: s.cleaningStatus, cleaning_notes: s.cleaningNotes,
  processed_event_ids: s.processedEventIds || [],
});
const salonFromDb = (row) => ({
  id: row.id, name: row.name, category: row.category, color: row.color,
  cleaningStatus: row.cleaning_status, cleaningNotes: row.cleaning_notes,
  processedEventIds: row.processed_event_ids || [],
});
export const fetchSalones = () => fetchTable("salones", salonFromDb);
export const syncSalones = (prev, next) => syncTable("salones", prev, next, salonToDb);

const expenseToDb = (e) => ({
  id: e.id, date: e.date, category: e.category, description: e.description,
  amount: e.amount || 0, registered_by: e.registeredBy,
});
const expenseFromDb = (row) => ({
  id: row.id, date: row.date, category: row.category, description: row.description,
  amount: Number(row.amount) || 0, registeredBy: row.registered_by,
});
export const fetchExpenses = () => fetchTable("expenses", expenseFromDb);
export const syncExpenses = (prev, next) => syncTable("expenses", prev, next, expenseToDb);

export async function fetchHotelStatus() {
  const { data, error } = await supabase.from("hotel_status").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return { closed: false };
  return {
    closed: data.closed, closedAt: data.closed_at, closedBy: data.closed_by,
    reopenedAt: data.reopened_at, reopenedBy: data.reopened_by,
  };
}
export async function saveHotelStatus(status) {
  const { error } = await supabase.from("hotel_status").update({
    closed: status.closed, closed_at: status.closedAt || null, closed_by: status.closedBy || null,
    reopened_at: status.reopenedAt || null, reopened_by: status.reopenedBy || null,
  }).eq("id", 1);
  if (error) throw error;
}
