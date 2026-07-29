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
