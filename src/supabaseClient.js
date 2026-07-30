import { createClient } from "@supabase/supabase-js";

// Tus datos de proyecto Mas Boronat en Supabase
const SUPABASE_URL = "https://qzlemfnhmhesxiqvltxg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QQiMgDTJbkjphD2WLWWHeg_R49phF7p";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Estas dos funciones sustituyen a window.storage.get / window.storage.set
// que solo existían dentro del entorno de artefactos de Claude.
// La tabla "hotelops_kv" es la que creaste con el SQL del paso 1.

export async function loadShared(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("hotelops_kv")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return JSON.parse(data.value);
  } catch (e) {
    console.error("Error al cargar", key, e);
    return fallback;
  }
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
      .select("role, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error("Error al leer el perfil", e);
    return null;
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

