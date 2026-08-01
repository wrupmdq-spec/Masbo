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

    // Valores de estado (se guardan en español en la base de datos; esto es solo para mostrar)
    st_Confirmada: "Confirmada", st_Cancelada: "Cancelada", st_Reservado: "Reservado", st_Alojado: "Alojado", st_Salida: "Salida",
    "st_Próxima": "Próxima", "st_En curso": "En curso", st_Finalizada: "Finalizada",
    cl_Limpia: "Limpia", cl_Sucia: "Sucia", "cl_En Progreso": "En Progreso", "cl_Inspección Necesaria": "Inspección Necesaria",
    mp_Ninguno: "Ninguno", "mp_Desayuno incluido": "Desayuno incluido", "mp_Todo incluido": "Todo incluido",
    pr_Baja: "Baja", pr_Media: "Media", pr_Alta: "Alta",
    tk_Pendiente: "Pendiente", "tk_En Progreso": "En Progreso", tk_Resuelto: "Resuelto",
    ev_Programado: "Programado", ev_Confirmado: "Confirmado", ev_Finalizado: "Finalizado", ev_Cancelado: "Cancelado",
    shift_Desayuno: "Desayuno", shift_Almuerzo: "Almuerzo / Calçotada", shift_Cena: "Cena",

    // Huéspedes y Alojamientos
    guests_title: "Huéspedes y Alojamientos",
    guests_subtitle: "Cada unidad puede tener varias reservas: pasadas, en curso y futuras",
    guests_search: "Buscar alojamiento o huésped",
    guests_all_types: "Todos",
    guests_group_booking: "Reserva de grupo (varias unidades)",
    guests_new_stay: "Nueva reserva",
    guests_hotel_closed: "Hotel cerrado",
    guests_no_stays: "Sin reservas.",
    guests_occupied_today: "Ocupada",
    guests_free_today: "Libre",
    guests_capacity: "Cap.",
    common_edit: "Editar",
    common_delete: "Eliminar",
    common_save: "Guardar",
    common_cancel: "Cancelar",
    common_close: "Cerrar",
    common_guest_name: "Nombre del huésped",
    common_checkin: "Fecha de entrada",
    common_checkout: "Fecha de salida",
    common_guests_count: "Número de huéspedes",
    common_meal_plan: "Régimen",
    common_status: "Estado",
    common_paid_before: "Cobrado antes de la estancia",
    common_paid_after: "Cobrado al finalizar",
    common_save_reservation: "Guardar reserva",

    // Restaurante
    restaurant_title: "Restaurante Mas Boronat",
    restaurant_subtitle: "Cocina mediterránea de temporada · Calçotades (enero–abril)",
    restaurant_new_booking: "Nueva reserva",
    restaurant_no_bookings: "Todavía no hay reservas.",
    restaurant_client_hotel: "Resort",
    restaurant_client_external: "Externo",
    restaurant_paid_before: "Cobrado antes del servicio",
    restaurant_paid_after: "Cobrado al finalizar",

    field_no_name: "Sin nombre",
    field_capacity: "capacidad",
    field_num_guests_max: "Número de huéspedes (máx. {n})",
    field_conflict_one: "Esta unidad ya tiene otra reserva que se solapa en estas fechas:",
    field_conflict_many: "Esta unidad ya tiene otras reservas que se solapan en estas fechas:",
    field_conflict_note: "Puedes guardar igualmente si es intencionado (p. ej. overbooking controlado).",
    field_reservation_status: "Estado de la reserva",
    restaurant_since: "desde las",
    restaurant_client_default: "Cliente",
    restaurant_menu_label: "Menú:",
    restaurant_allergens_label: "Alérgenos:",
    restaurant_notes_label: "Otras peticiones:",
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

    st_Confirmada: "Confirmed", st_Cancelada: "Cancelled", st_Reservado: "Reserved", st_Alojado: "Checked in", st_Salida: "Checked out",
    "st_Próxima": "Upcoming", "st_En curso": "Ongoing", st_Finalizada: "Finished",
    cl_Limpia: "Clean", cl_Sucia: "Dirty", "cl_En Progreso": "In Progress", "cl_Inspección Necesaria": "Inspection Needed",
    mp_Ninguno: "None", "mp_Desayuno incluido": "Breakfast included", "mp_Todo incluido": "All-inclusive",
    pr_Baja: "Low", pr_Media: "Medium", pr_Alta: "High",
    tk_Pendiente: "Pending", "tk_En Progreso": "In Progress", tk_Resuelto: "Resolved",
    ev_Programado: "Scheduled", ev_Confirmado: "Confirmed", ev_Finalizado: "Finished", ev_Cancelado: "Cancelled",
    shift_Desayuno: "Breakfast", shift_Almuerzo: "Lunch / Calçotada", shift_Cena: "Dinner",

    guests_title: "Guests & Rooms",
    guests_subtitle: "Each unit can have several bookings: past, current and future",
    guests_search: "Search room or guest",
    guests_all_types: "All",
    guests_group_booking: "Group booking (multiple units)",
    guests_new_stay: "New booking",
    guests_hotel_closed: "Hotel closed",
    guests_no_stays: "No bookings.",
    guests_occupied_today: "Occupied",
    guests_free_today: "Free",
    guests_capacity: "Cap.",
    common_edit: "Edit",
    common_delete: "Delete",
    common_save: "Save",
    common_cancel: "Cancel",
    common_close: "Close",
    common_guest_name: "Guest name",
    common_checkin: "Check-in date",
    common_checkout: "Check-out date",
    common_guests_count: "Number of guests",
    common_meal_plan: "Meal plan",
    common_status: "Status",
    common_paid_before: "Paid before the stay",
    common_paid_after: "Paid at checkout",
    common_save_reservation: "Save booking",

    restaurant_title: "Mas Boronat Restaurant",
    restaurant_subtitle: "Seasonal Mediterranean cuisine · Calçotades (January–April)",
    restaurant_new_booking: "New booking",
    restaurant_no_bookings: "No bookings yet.",
    restaurant_client_hotel: "Resort",
    restaurant_client_external: "External",
    restaurant_paid_before: "Paid before service",
    restaurant_paid_after: "Paid at the end",

    field_no_name: "No name",
    field_capacity: "capacity",
    field_num_guests_max: "Number of guests (max. {n})",
    field_conflict_one: "This unit already has another booking overlapping these dates:",
    field_conflict_many: "This unit already has other bookings overlapping these dates:",
    field_conflict_note: "You can still save if this is intentional (e.g. controlled overbooking).",
    field_reservation_status: "Booking status",
    restaurant_since: "from",
    restaurant_client_default: "Guest",
    restaurant_menu_label: "Menu:",
    restaurant_allergens_label: "Allergens:",
    restaurant_notes_label: "Other requests:",
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

    st_Confirmada: "Bevestigd", st_Cancelada: "Geannuleerd", st_Reservado: "Gereserveerd", st_Alojado: "Ingecheckt", st_Salida: "Uitgecheckt",
    "st_Próxima": "Aankomend", "st_En curso": "Actief", st_Finalizada: "Afgerond",
    cl_Limpia: "Schoon", cl_Sucia: "Vies", "cl_En Progreso": "Bezig", "cl_Inspección Necesaria": "Inspectie nodig",
    mp_Ninguno: "Geen", "mp_Desayuno incluido": "Ontbijt inbegrepen", "mp_Todo incluido": "All-inclusive",
    pr_Baja: "Laag", pr_Media: "Gemiddeld", pr_Alta: "Hoog",
    tk_Pendiente: "In afwachting", "tk_En Progreso": "Bezig", tk_Resuelto: "Opgelost",
    ev_Programado: "Gepland", ev_Confirmado: "Bevestigd", ev_Finalizado: "Afgerond", ev_Cancelado: "Geannuleerd",
    shift_Desayuno: "Ontbijt", shift_Almuerzo: "Lunch / Calçotada", shift_Cena: "Diner",

    guests_title: "Gasten & Kamers",
    guests_subtitle: "Elke eenheid kan meerdere boekingen hebben: verleden, huidig en toekomstig",
    guests_search: "Zoek kamer of gast",
    guests_all_types: "Alle",
    guests_group_booking: "Groepsboeking (meerdere eenheden)",
    guests_new_stay: "Nieuwe boeking",
    guests_hotel_closed: "Hotel gesloten",
    guests_no_stays: "Geen boekingen.",
    guests_occupied_today: "Bezet",
    guests_free_today: "Vrij",
    guests_capacity: "Cap.",
    common_edit: "Bewerken",
    common_delete: "Verwijderen",
    common_save: "Opslaan",
    common_cancel: "Annuleren",
    common_close: "Sluiten",
    common_guest_name: "Naam gast",
    common_checkin: "Inchecken",
    common_checkout: "Uitchecken",
    common_guests_count: "Aantal gasten",
    common_meal_plan: "Maaltijdplan",
    common_status: "Status",
    common_paid_before: "Betaald vóór verblijf",
    common_paid_after: "Betaald bij vertrek",
    common_save_reservation: "Boeking opslaan",

    restaurant_title: "Restaurant Mas Boronat",
    restaurant_subtitle: "Seizoensgebonden mediterrane keuken · Calçotades (januari–april)",
    restaurant_new_booking: "Nieuwe boeking",
    restaurant_no_bookings: "Nog geen boekingen.",
    restaurant_client_hotel: "Resortgast",
    restaurant_client_external: "Extern",
    restaurant_paid_before: "Betaald vóór de service",
    restaurant_paid_after: "Betaald aan het einde",

    field_no_name: "Geen naam",
    field_capacity: "capaciteit",
    field_num_guests_max: "Aantal gasten (max. {n})",
    field_conflict_one: "Deze eenheid heeft al een andere boeking die overlapt met deze data:",
    field_conflict_many: "Deze eenheid heeft al andere boekingen die overlappen met deze data:",
    field_conflict_note: "Je kunt toch opslaan als dit bewust is (bijv. gecontroleerde overboeking).",
    field_reservation_status: "Boekingsstatus",
    restaurant_since: "vanaf",
    restaurant_client_default: "Gast",
    restaurant_menu_label: "Menu:",
    restaurant_allergens_label: "Allergenen:",
    restaurant_notes_label: "Overige verzoeken:",
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
