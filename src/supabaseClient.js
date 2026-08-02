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

export async function fetchFullBackup() {
  const [kvRes, logRes] = await Promise.all([
    supabase.from("hotelops_kv").select("*"),
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }),
  ]);
  if (kvRes.error) throw kvRes.error;
  if (logRes.error) throw logRes.error;
  return {
    exportedAt: new Date().toISOString(),
    data: kvRes.data,
    auditLog: logRes.data,
  };
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
