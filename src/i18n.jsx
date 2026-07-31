import React, { createContext, useContext, useState, useEffect } from "react";

export const LANGUAGES = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
];

const STORAGE_KEY = "masboronat-lang";

// Fase 1 de traducción: menú, login, resumen y panel de administrador.
// El resto de módulos (huéspedes, restaurante, limpieza, mantenimiento,
// eventos) se traducen en una siguiente pasada.
export const TRANSLATIONS = {
  es: {
    tagline: "Masía s. XVII · Salomó, Tarragona — Gestión operativa",
    live: "En vivo",
    lastUpdate: "última actualización",
    refresh: "Actualizar ahora",
    logout: "Cerrar sesión",
    language: "Idioma",

    tab_dashboard: "Resumen",
    tab_guests: "Alojamientos",
    tab_restaurant: "Restaurante",
    tab_housekeeping: "Limpieza",
    tab_maintenance: "Mantenim.",
    tab_events: "Eventos",
    tab_planning: "Planning",
    tab_planningGeneral: "Plan. General",
    tab_admin: "Admin",

    role_admin: "Administrador",
    role_reception: "Recepción",
    role_restaurant: "Personal de Restaurante",
    role_housekeeping: "Personal de Limpieza",
    role_maintenance: "Personal de Mantenimiento",

    dash_units_occupied: "Unidades ocupadas hoy",
    dash_occupancy_people: "Ocupación total (personas)",
    dash_units_to_clean: "Unidades por limpiar",
    dash_restaurant_today: "Reservas de hoy en restaurante",
    dash_open_tickets: "Tickets de mantenimiento abiertos",
    dash_events_today: "Eventos de hoy",
    dash_high_priority: "Mantenimiento de alta prioridad",
    dash_nothing_urgent: "Nada urgente por ahora.",
    dash_upcoming_events: "Próximos eventos",
    dash_no_upcoming: "No hay eventos próximos.",

    login_email: "Email",
    login_password: "Contraseña",
    login_button: "Iniciar sesión",
    login_loading: "Entrando…",
    login_no_account: "¿No tienes cuenta? Pídesela al administrador — las cuentas del personal se crean manualmente.",
    login_error_invalid: "Email o contraseña incorrectos.",

    setpw_title: "Crea tu contraseña",
    setpw_subtitle: "inició sesión con una contraseña genérica. Por seguridad, crea una nueva antes de continuar.",
    setpw_new: "Nueva contraseña",
    setpw_repeat: "Repite la contraseña",
    setpw_min: "Mínimo 8 caracteres",
    setpw_mismatch: "Las dos contraseñas no coinciden.",
    setpw_tooshort: "La contraseña debe tener al menos 8 caracteres.",
    setpw_save: "Guardar y entrar",
    setpw_saving: "Guardando…",

    admintab_resumen: "Estado del hotel",
    admintab_personal: "Personal",
    admintab_finanzas: "Finanzas",
    admintab_hospedaje: "Hospedaje",
    admintab_restaurante: "Restaurante",
    admintab_limpieza: "Limpieza",
    admintab_mantenimiento: "Mantenimiento",
    admintab_actividad: "Actividad",

    admin_panel_title: "Panel de Administrador",
    admin_panel_subtitle: "Visible solo para tu cuenta. Aquí ves la actividad de todo el personal, las estadísticas del negocio, y controlas el estado general del hotel.",

    hotel_status_title: "Estado del hotel",
    hotel_open: "Abierto",
    hotel_closed: "Cerrado",
    close_hotel_btn: "Cerrar el hotel",
    open_hotel_btn: "Abrir el hotel",

    backup_title: "Copia de seguridad",
    backup_desc: "Descarga un archivo con todos los datos de la app tal como están ahora mismo. Guárdalo en un sitio seguro.",
    backup_button: "Descargar copia de seguridad",
  },

  en: {
    tagline: "17th-century farmhouse · Salomó, Tarragona — Operations Management",
    live: "Live",
    lastUpdate: "last updated",
    refresh: "Refresh now",
    logout: "Log out",
    language: "Language",

    tab_dashboard: "Overview",
    tab_guests: "Rooms",
    tab_restaurant: "Restaurant",
    tab_housekeeping: "Housekeeping",
    tab_maintenance: "Maint.",
    tab_events: "Events",
    tab_planning: "Planning",
    tab_planningGeneral: "Full Plan",
    tab_admin: "Admin",

    role_admin: "Administrator",
    role_reception: "Reception",
    role_restaurant: "Restaurant Staff",
    role_housekeeping: "Housekeeping Staff",
    role_maintenance: "Maintenance Staff",

    dash_units_occupied: "Units occupied today",
    dash_occupancy_people: "Total occupancy (guests)",
    dash_units_to_clean: "Units to clean",
    dash_restaurant_today: "Today's restaurant bookings",
    dash_open_tickets: "Open maintenance tickets",
    dash_events_today: "Today's events",
    dash_high_priority: "High-priority maintenance",
    dash_nothing_urgent: "Nothing urgent right now.",
    dash_upcoming_events: "Upcoming events",
    dash_no_upcoming: "No upcoming events.",

    login_email: "Email",
    login_password: "Password",
    login_button: "Log in",
    login_loading: "Signing in…",
    login_no_account: "Don't have an account? Ask your administrator — staff accounts are created manually.",
    login_error_invalid: "Incorrect email or password.",

    setpw_title: "Create your password",
    setpw_subtitle: "logged in with a generic password. For security, please create a new one before continuing.",
    setpw_new: "New password",
    setpw_repeat: "Repeat password",
    setpw_min: "Minimum 8 characters",
    setpw_mismatch: "The two passwords don't match.",
    setpw_tooshort: "Password must be at least 8 characters.",
    setpw_save: "Save and continue",
    setpw_saving: "Saving…",

    admintab_resumen: "Hotel Status",
    admintab_personal: "Staff",
    admintab_finanzas: "Finance",
    admintab_hospedaje: "Accommodation",
    admintab_restaurante: "Restaurant",
    admintab_limpieza: "Housekeeping",
    admintab_mantenimiento: "Maintenance",
    admintab_actividad: "Activity",

    admin_panel_title: "Administrator Panel",
    admin_panel_subtitle: "Only visible to your account. Here you can see all staff activity, business statistics, and control the hotel's overall status.",

    hotel_status_title: "Hotel Status",
    hotel_open: "Open",
    hotel_closed: "Closed",
    close_hotel_btn: "Close the hotel",
    open_hotel_btn: "Open the hotel",

    backup_title: "Backup",
    backup_desc: "Download a file with all the app's data as it stands right now. Keep it somewhere safe.",
    backup_button: "Download backup",
  },

  nl: {
    tagline: "17e-eeuwse hoeve · Salomó, Tarragona — Operationeel beheer",
    live: "Live",
    lastUpdate: "laatst bijgewerkt",
    refresh: "Nu vernieuwen",
    logout: "Uitloggen",
    language: "Taal",

    tab_dashboard: "Overzicht",
    tab_guests: "Kamers",
    tab_restaurant: "Restaurant",
    tab_housekeeping: "Schoonmaak",
    tab_maintenance: "Onderh.",
    tab_events: "Evenementen",
    tab_planning: "Planning",
    tab_planningGeneral: "Volledige Pl.",
    tab_admin: "Beheer",

    role_admin: "Beheerder",
    role_reception: "Receptie",
    role_restaurant: "Restaurantpersoneel",
    role_housekeeping: "Schoonmaakpersoneel",
    role_maintenance: "Onderhoudspersoneel",

    dash_units_occupied: "Bezette eenheden vandaag",
    dash_occupancy_people: "Totale bezetting (gasten)",
    dash_units_to_clean: "Te reinigen eenheden",
    dash_restaurant_today: "Restaurantreserveringen vandaag",
    dash_open_tickets: "Openstaande onderhoudstickets",
    dash_events_today: "Evenementen vandaag",
    dash_high_priority: "Onderhoud met hoge prioriteit",
    dash_nothing_urgent: "Niets dringends op dit moment.",
    dash_upcoming_events: "Aankomende evenementen",
    dash_no_upcoming: "Geen aankomende evenementen.",

    login_email: "E-mail",
    login_password: "Wachtwoord",
    login_button: "Inloggen",
    login_loading: "Bezig met inloggen…",
    login_no_account: "Heb je geen account? Vraag het je beheerder — accounts worden handmatig aangemaakt.",
    login_error_invalid: "Onjuiste e-mail of wachtwoord.",

    setpw_title: "Maak je wachtwoord aan",
    setpw_subtitle: "is ingelogd met een algemeen wachtwoord. Maak voor de veiligheid eerst een nieuw wachtwoord aan.",
    setpw_new: "Nieuw wachtwoord",
    setpw_repeat: "Herhaal wachtwoord",
    setpw_min: "Minimaal 8 tekens",
    setpw_mismatch: "De twee wachtwoorden komen niet overeen.",
    setpw_tooshort: "Wachtwoord moet minimaal 8 tekens bevatten.",
    setpw_save: "Opslaan en doorgaan",
    setpw_saving: "Opslaan…",

    admintab_resumen: "Hotelstatus",
    admintab_personal: "Personeel",
    admintab_finanzas: "Financiën",
    admintab_hospedaje: "Verblijf",
    admintab_restaurante: "Restaurant",
    admintab_limpieza: "Schoonmaak",
    admintab_mantenimiento: "Onderhoud",
    admintab_actividad: "Activiteit",

    admin_panel_title: "Beheerderspaneel",
    admin_panel_subtitle: "Alleen zichtbaar voor jouw account. Hier zie je alle personeelsactiviteit, bedrijfsstatistieken, en beheer je de algemene status van het hotel.",

    hotel_status_title: "Hotelstatus",
    hotel_open: "Open",
    hotel_closed: "Gesloten",
    close_hotel_btn: "Hotel sluiten",
    open_hotel_btn: "Hotel openen",

    backup_title: "Back-up",
    backup_desc: "Download een bestand met alle gegevens van de app zoals ze er nu voor staan. Bewaar het op een veilige plek.",
    backup_button: "Back-up downloaden",
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "es";
    } catch (e) {
      return "es";
    }
  });

  const setLang = (code) => {
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* noop */ }
  };

  const t = (key) => (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.es[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation debe usarse dentro de <LanguageProvider>");
  return ctx;
}
