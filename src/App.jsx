import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, BedDouble, UtensilsCrossed, Sparkles, Wrench,
  Plus, X, RefreshCw, Users, Phone, StickyNote, Clock, ChevronDown,
  CheckCircle2, AlertTriangle, Circle, Search, CalendarDays, MapPin,
  CalendarRange, ChevronLeft, ChevronRight, ShieldAlert, Rows3, ChevronsLeft, ChevronsRight,
  BarChart3, TrendingUp, Timer, Award
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { loadShared, saveShared, supabase, getProfile, logAction, fetchAuditLog, fetchFullBackup, fetchStaffDirectory, adminResetPassword, recordDailyLogin, fetchDailyLogins } from "./supabaseClient";
import Login from "./Login";
import SetPassword from "./SetPassword";
import { useTranslation, LANGUAGES } from "./i18n.jsx";

/* ---------------------------------------------------------------------- */
/* Identidad Mas Boronat — masía del s. XVII, Salomó (Tarragona)          */
/* ---------------------------------------------------------------------- */

// Tipos de alquiler reales de Mas Boronat, con capacidad máxima de huéspedes por unidad
const CATEGORIAS = [
  { type: "Cataluña", numbers: Array.from({ length: 10 }, (_, i) => i + 1), capacity: 4, color: "#d97706" },
  { type: "Flandes", numbers: Array.from({ length: 8 }, (_, i) => i + 1), capacity: 4, color: "#0891b2" },
  { type: "Hotel", numbers: Array.from({ length: 11 }, (_, i) => i + 1), capacity: 2, color: "#16a34a" },
  { type: "Mercator", numbers: [null], capacity: 12, color: "#7c3aed" },
  { type: "Amberes", numbers: [2, 3, 4], capacity: 4, color: "#be123c" },
  { type: "Masía Suites", numbers: Array.from({ length: 9 }, (_, i) => i + 1), capacity: 2, color: "#4338ca" },
  { type: "Masía Aparts", numbers: [1, 2], capacity: 4, color: "#78716c" },
];

const CATEGORY_COLOR = Object.fromEntries(CATEGORIAS.map((c) => [c.type, c.color]));

const UNIDADES = CATEGORIAS.flatMap((c) =>
  c.numbers.map((n) => ({ id: n ? `${c.type}-${n}` : c.type, type: c.type, number: n, capacity: c.capacity }))
);

const TIPOS_ALOJAMIENTO = CATEGORIAS.map((c) => c.type);

// Capacidad total del resort: 144 huéspedes
const TOTAL_CAPACITY = UNIDADES.reduce((sum, u) => sum + u.capacity, 0);

const MEAL_PLANS = ["Ninguno", "Desayuno incluido", "Todo incluido"];
const CLEAN_STATUSES = ["Limpia", "Sucia", "En Progreso", "Inspección Necesaria"];
const SHIFTS = [
  { key: "Desayuno", label: "Desayuno", time: "08:00" },
  { key: "Almuerzo", label: "Almuerzo / Calçotada", time: "14:00" },
  { key: "Cena", label: "Cena", time: "21:00" },
];
const PRIORITIES = ["Baja", "Media", "Alta"];
const TICKET_STATUSES = ["Pendiente", "En Progreso", "Resuelto"];
const EVENT_STATUSES = ["Programado", "Confirmado", "Finalizado", "Cancelado"];
const EVENT_TYPES = [
  "Boda", "Reunión de empresa", "Retiro de bienestar", "Taller o Seminario",
  "Team Building", "Evento de networking", "Celebración especial", "Otro",
];
// Salones y espacios exteriores: se reservan para eventos y, al finalizar,
// pasan automáticamente a "Sucia" para que limpieza los revise.
const SALONES_BASE = [
  { id: "salon-noble", name: "Salón Noble", category: "Salones", color: "#0891b2" },
  { id: "salon-restaurante", name: "Restaurante (salón)", category: "Salones", color: "#0891b2" },
  { id: "salon-baloon", name: "Salón Baloon", category: "Salones", color: "#0891b2" },
  { id: "ext-bar-piscina", name: "Bar Piscina", category: "Espacios Exteriores", color: "#16a34a" },
  { id: "ext-moreras", name: "Moreras", category: "Espacios Exteriores", color: "#16a34a" },
  { id: "ext-plaza", name: "Plaza", category: "Espacios Exteriores", color: "#16a34a" },
];
const SALON_CATEGORIAS = ["Salones", "Espacios Exteriores"];
const EVENT_SPACES = [...SALONES_BASE.map((s) => s.name), "Otro"];

function seedSalones() {
  return SALONES_BASE.map((s) => ({ ...s, cleaningStatus: "Limpia", cleaningNotes: "" }));
}

const PLANNING_MIN = "2026-07";
const PLANNING_MAX = "2030-12";

const ROLES = {
  admin: {
    label: "Administrador",
    tabs: ["dashboard", "guests", "restaurant", "housekeeping", "maintenance", "events", "planning", "planningGeneral", "admin"],
    edit: ["guests", "restaurant", "housekeeping", "maintenance", "events"],
  },
  reception: {
    label: "Recepción",
    tabs: ["dashboard", "guests", "restaurant", "housekeeping", "maintenance", "events", "planning", "planningGeneral"],
    edit: ["guests", "restaurant", "housekeeping", "maintenance", "events"],
  },
  restaurant: {
    label: "Personal de Restaurante",
    tabs: ["restaurant", "guests", "events", "planning"],
    edit: ["restaurant"],
  },
  housekeeping: {
    label: "Personal de Limpieza",
    tabs: ["housekeeping", "planning"],
    edit: ["housekeeping"],
  },
  maintenance: {
    label: "Personal de Mantenimiento",
    tabs: ["maintenance", "planning"],
    edit: ["maintenance"],
  },
};

// Eliminar es la acción "profunda": solo el Administrador puede borrar en cualquier módulo,
// salvo Mantenimiento, donde el propio personal de mantenimiento borra sus propios tickets.
function canDelete(role, module) {
  if (role === "admin") return true;
  if (module === "maintenance" && role === "maintenance") return true;
  return false;
}

const TAB_META = {
  dashboard: { label: "Resumen", navLabel: "Resumen", icon: LayoutDashboard },
  guests: { label: "Huéspedes y Alojamientos", navLabel: "Alojamientos", icon: BedDouble },
  restaurant: { label: "Restaurante", navLabel: "Restaurante", icon: UtensilsCrossed },
  housekeeping: { label: "Limpieza", navLabel: "Limpieza", icon: Sparkles },
  maintenance: { label: "Mantenimiento", navLabel: "Mantenim.", icon: Wrench },
  events: { label: "Eventos", navLabel: "Eventos", icon: CalendarDays },
  planning: { label: "Planning", navLabel: "Planning", icon: CalendarRange },
  planningGeneral: { label: "Planning General", navLabel: "Plan. General", icon: Rows3 },
  admin: { label: "Administrador", navLabel: "Admin", icon: ShieldAlert },
};

// Describe en una frase corta qué tipo de cambio se hizo, comparando el array antes/después.
// "label" es un sustantivo en singular sin artículo, p. ej. "reserva de alojamiento".
function summarizeChange(prevArr, nextArr, label) {
  const diff = nextArr.length - prevArr.length;
  if (diff > 1) return `Creó ${diff} ${label}s de una vez`;
  if (diff === 1) return `Creó una ${label}`;
  if (diff < 0) return `Eliminó una ${label}`;
  return `Editó una ${label}`;
}

// Alojamientos "en blanco": solo su estado de limpieza, sin reservas precargadas
function seedRooms() {
  return UNIDADES.map((u) => ({
    id: u.id,
    type: u.type,
    number: u.number,
    capacity: u.capacity,
    cleaningStatus: "Limpia",
    cleaningNotes: "",
  }));
}

const uid = () => Math.random().toString(36).slice(2, 10);

// Pequeño "bip" generado con Web Audio API (no necesita ningún archivo de sonido).
// Suena dos veces para que sea más difícil de pasar por alto.
function playAlertSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (delay) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      const t0 = ctx.currentTime + delay;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0);
      o.stop(t0 + 0.4);
    };
    beep(0);
    beep(0.45);
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {
    console.error("No se pudo reproducir el sonido de alerta", e);
  }
}
const unitLabel = (r) => (r.number ? `${r.type} ${r.number}` : r.type);
const todayStr = () => new Date().toISOString().slice(0, 10);

// Solapamiento de dos rangos de fechas (inclusivo)
const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

// Estado temporal de una estancia según las fechas (independiente de si está cancelada)
function stayTiming(stay) {
  const t = todayStr();
  if (t < stay.checkIn) return "Próxima";
  if (t > stay.checkOut) return "Finalizada";
  return "En curso";
}
function stayTone(stay) {
  if (stay.status === "Cancelada") return "red";
  const timing = stayTiming(stay);
  if (timing === "En curso") return "green";
  if (timing === "Próxima") return "blue";
  return "slate";
}

/* ---------------------------------------------------------------------- */
/* Almacenamiento compartido                                               */
/* ---------------------------------------------------------------------- */

const KEYS = {
  rooms: "masboronat:v3:unidades",
  stays: "masboronat:v3:estancias",
  bookings: "masboronat:v3:reservas-restaurante",
  tickets: "masboronat:v3:tickets-mantenimiento",
  events: "masboronat:v3:eventos",
  hotelStatus: "masboronat:v3:estado-hotel",
  salones: "masboronat:v3:salones",
  expenses: "masboronat:v3:gastos",
};

/* ---------------------------------------------------------------------- */
/* Componentes básicos                                                     */
/* ---------------------------------------------------------------------- */

function Badge({ children, tone = "slate" }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-800 border-emerald-300",
    red: "bg-rose-100 text-rose-800 border-rose-300",
    yellow: "bg-amber-100 text-amber-800 border-amber-300",
    blue: "bg-sky-100 text-sky-800 border-sky-300",
    slate: "bg-stone-100 text-stone-700 border-stone-300",
    purple: "bg-violet-100 text-violet-800 border-violet-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
}

function cleanTone(s) { return s === "Limpia" ? "green" : s === "Sucia" ? "red" : s === "En Progreso" ? "yellow" : "purple"; }
function priorityTone(p) { return p === "Alta" ? "red" : p === "Media" ? "yellow" : "slate"; }
function ticketStatusTone(s) { return s === "Resuelto" ? "green" : s === "En Progreso" ? "yellow" : "slate"; }
function eventStatusTone(s) {
  if (s === "Confirmado") return "green";
  if (s === "Programado") return "blue";
  if (s === "Cancelado") return "red";
  return "slate";
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-stone-800 text-base">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-stone-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ab9574] focus:border-[#ab9574]";
const primaryBtn = "bg-[#806c4d] hover:bg-[#6d5c42] text-white font-medium rounded-xl text-sm";
const selectedToggle = "bg-[#806c4d] text-white border-[#806c4d]";
const unselectedToggle = "border-stone-300 text-stone-600";

// Campo de importe en euros: sin decimales forzados, admite cualquier número,
// y arranca vacío en vez de mostrar "0" (así se puede escribir directamente).
function MoneyField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">€</span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          className={inputCls + " pl-7"}
          value={value === 0 || value === undefined || value === null ? "" : value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          placeholder="0"
        />
      </div>
    </Field>
  );
}

/* ---------------------------------------------------------------------- */
/* Aplicación principal                                                    */
/* ---------------------------------------------------------------------- */

export default function MasBoronatOps() {
  const [session, setSession] = useState(undefined); // undefined = comprobando, null = sin sesión
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [tab, setTab] = useState("dashboard");
  const [rooms, setRooms] = useState(null);
  const [stays, setStays] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [events, setEvents] = useState(null);
  const [hotelStatus, setHotelStatus] = useState(null);
  const [salones, setSalones] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [alertToast, setAlertToast] = useState(null);
  const failCountRef = useRef(0);

  // Sesión de autenticación
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Perfil (rol) del usuario logueado
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    setProfileLoading(true);
    getProfile(session.user.id).then((p) => { setProfile(p); setProfileLoading(false); });
  }, [session]);

  // Registra "hoy ya entré" una vez por sesión, para el control de asistencia del Administrador
  const attendanceLoggedRef = useRef(false);
  useEffect(() => {
    if (profile && profile.role && !attendanceLoggedRef.current) {
      attendanceLoggedRef.current = true;
      recordDailyLogin();
    }
    if (!profile) attendanceLoggedRef.current = false;
  }, [profile]);

  const refreshAll = useCallback(async (initial = false) => {
    setSyncing(true);
    try {
      const [r, st, b, t, ev, hs, sal, exp] = await Promise.all([
        loadShared(KEYS.rooms, null),
        loadShared(KEYS.stays, null),
        loadShared(KEYS.bookings, null),
        loadShared(KEYS.tickets, null),
        loadShared(KEYS.events, null),
        loadShared(KEYS.hotelStatus, null),
        loadShared(KEYS.salones, null),
        loadShared(KEYS.expenses, null),
      ]);
      if (initial) {
        const seededRooms = r || seedRooms();
        const seededSalones = sal || seedSalones();
        setRooms(seededRooms);
        setStays(st || []);
        setBookings(b || []);
        setTickets(t || []);
        setEvents(ev || []);
        setHotelStatus(hs || { closed: false });
        setSalones(seededSalones);
        setExpenses(exp || []);
        if (!r) await saveShared(KEYS.rooms, seededRooms);
        if (!st) await saveShared(KEYS.stays, []);
        if (!b) await saveShared(KEYS.bookings, []);
        if (!t) await saveShared(KEYS.tickets, []);
        if (!ev) await saveShared(KEYS.events, []);
        if (!hs) await saveShared(KEYS.hotelStatus, { closed: false });
        if (!sal) await saveShared(KEYS.salones, seededSalones);
        if (!exp) await saveShared(KEYS.expenses, []);
      } else {
        if (r) setRooms(r);
        if (st) setStays(st);
        if (b) setBookings(b);
        if (t) setTickets(t);
        if (ev) setEvents(ev);
        if (hs) setHotelStatus(hs);
        if (sal) setSalones(sal);
        if (exp) setExpenses(exp);
      }
      failCountRef.current = 0;
      setConnectionIssue(false);
      setLastSync(new Date());
    } catch (e) {
      console.error("Error al sincronizar", e);
      failCountRef.current += 1;
      if (failCountRef.current >= 2) setConnectionIssue(true);
    }
    setSyncing(false);
  }, []);

  useEffect(() => {
    if (!session || !profile) return;
    refreshAll(true);
    const iv = setInterval(() => refreshAll(false), 2500);
    const onVisible = () => { if (document.visibilityState === "visible") refreshAll(false); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshAll, session, profile]);

  const role = profile?.role;
  const cfg = role ? ROLES[role] : null;

  useEffect(() => {
    if (cfg && !cfg.tabs.includes(tab)) setTab(cfg.tabs[0]);
  }, [cfg]); // eslint-disable-line

  const persistRooms = async (next) => {
    setRooms(next);
    await saveShared(KEYS.rooms, next);
    logAction({ email: session.user.email, role, module: "Limpieza / Alojamientos", action: "Actualizó el estado de una unidad" });
  };
  const persistStays = async (next) => {
    const action = summarizeChange(stays, next, "reserva de alojamiento");
    setStays(next);
    await saveShared(KEYS.stays, next);
    logAction({ email: session.user.email, role, module: "Hospedaje", action });
  };
  const persistBookings = async (next) => {
    const action = summarizeChange(bookings, next, "reserva de restaurante");
    setBookings(next);
    await saveShared(KEYS.bookings, next);
    logAction({ email: session.user.email, role, module: "Restaurante", action });
  };
  const persistTickets = async (next) => {
    const action = summarizeChange(tickets, next, "ticket de mantenimiento");
    setTickets(next);
    await saveShared(KEYS.tickets, next);
    logAction({ email: session.user.email, role, module: "Mantenimiento", action });
  };
  const persistEvents = async (next) => {
    const action = summarizeChange(events, next, "evento");
    setEvents(next);
    await saveShared(KEYS.events, next);
    logAction({ email: session.user.email, role, module: "Eventos", action });
  };
  const persistHotelStatus = async (next, action) => {
    setHotelStatus(next);
    await saveShared(KEYS.hotelStatus, next);
    logAction({ email: session.user.email, role, module: "Sistema", action });
  };
  const persistSalones = async (next, actionOverride) => {
    const action = actionOverride || summarizeChange(salones, next, "salón/espacio");
    setSalones(next);
    await saveShared(KEYS.salones, next);
    logAction({ email: session.user.email, role, module: "Limpieza / Salones", action });
  };
  const persistExpenses = async (next) => {
    const action = summarizeChange(expenses, next, "gasto");
    setExpenses(next);
    await saveShared(KEYS.expenses, next);
    logAction({ email: session.user.email, role, module: "Finanzas", action });
  };

  // Al pasar la fecha de un evento, lo marca "Finalizado" automáticamente y
  // ensucia el salón/espacio usado, para que limpieza lo revise.
  // Solo lo ejecutan los roles que pueden escribir en Eventos y Salones (admin/recepción),
  // para respetar los mismos permisos que ya existen a nivel de base de datos.
  useEffect(() => {
    if (!events || !salones) return;
    if (role !== "admin" && role !== "reception") return;
    const today = todayStr();
    const toFinalize = events.filter((e) => e.date < today && e.status !== "Finalizado" && e.status !== "Cancelado");
    if (toFinalize.length === 0) return;
    const finalizingIds = new Set(toFinalize.map((e) => e.id));
    const spaceNames = new Set(toFinalize.map((e) => e.space));
    const updatedEvents = events.map((e) => (finalizingIds.has(e.id) ? { ...e, status: "Finalizado" } : e));
    const updatedSalones = salones.map((s) => (spaceNames.has(s.name) ? { ...s, cleaningStatus: "Sucia" } : s));
    persistEvents(updatedEvents);
    persistSalones(updatedSalones, `Finalizó automáticamente ${toFinalize.length} evento(s) y marcó su(s) espacio(s) como sucio(s)`);
  }, [events, salones, role]); // eslint-disable-line

  // Alerta con sonido: avisa a Limpieza/Mantenimiento en cuanto aparece una tarea nueva en su sección
  const prevPendingRef = useRef(null);
  useEffect(() => {
    if (!role || !tickets || !rooms || !salones) return;
    if (role !== "maintenance" && role !== "housekeeping") return;

    let pending = 0;
    let label = "";
    if (role === "maintenance") {
      pending = tickets.filter((t) => t.status !== "Resuelto").length
        + salones.filter((s) => s.category === "Espacios Exteriores" && s.cleaningStatus !== "Limpia").length;
      label = "Mantenimiento";
    } else {
      pending = rooms.filter((r) => r.cleaningStatus !== "Limpia").length
        + salones.filter((s) => s.category === "Salones" && s.cleaningStatus !== "Limpia").length;
      label = "Limpieza";
    }

    if (prevPendingRef.current !== null && pending > prevPendingRef.current) {
      playAlertSound();
      setAlertToast(`🔔 Hay una tarea nueva en ${label}`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification("Mas Boronat", { body: `Nueva tarea pendiente en ${label}`, icon: "/icon-192.png" }); } catch (e) { /* noop */ }
      }
      const t = setTimeout(() => setAlertToast(null), 6000);
      return () => clearTimeout(t);
    }
    prevPendingRef.current = pending;
  }, [role, tickets, rooms, salones]);

  // Pide permiso de notificaciones una vez, para el personal de limpieza/mantenimiento
  useEffect(() => {
    if ((role === "maintenance" || role === "housekeeping") && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [role]);

  // --- Pantallas de autenticación ---
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex items-center gap-2 text-stone-500">
          <RefreshCw className="animate-spin" size={18} /> Comprobando sesión…
        </div>
      </div>
    );
  }
  if (session === null) {
    return <Login />;
  }
  if (profileLoading || profile === null) {
    if (profileLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50">
          <div className="flex items-center gap-2 text-stone-500">
            <RefreshCw className="animate-spin" size={18} /> Cargando tu perfil…
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
        <div className="max-w-sm text-center bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-semibold text-stone-800 mb-2">Cuenta sin rol asignado</h2>
          <p className="text-sm text-stone-500 mb-4">Tu cuenta existe pero todavía no tiene un rol de acceso. Pide al administrador que te lo asigne.</p>
          <button onClick={() => supabase.auth.signOut()} className={`px-4 py-2 ${primaryBtn}`}>Cerrar sesión</button>
        </div>
      </div>
    );
  }
  if (profile.must_change_password) {
    return (
      <SetPassword
        email={session.user.email}
        onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))}
      />
    );
  }
  if (!cfg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
        <div className="max-w-sm text-center bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="font-semibold text-stone-800 mb-2">Rol desconocido</h2>
          <p className="text-sm text-stone-500 mb-4">El rol "{role}" no existe en la aplicación. Contacta con el administrador.</p>
          <button onClick={() => supabase.auth.signOut()} className={`px-4 py-2 ${primaryBtn}`}>Cerrar sesión</button>
        </div>
      </div>
    );
  }
  const canEdit = (module) => cfg.edit.includes(module);

  if (!rooms || !stays || !bookings || !tickets || !events || !hotelStatus || !salones || !expenses) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex items-center gap-2 text-stone-500">
          <RefreshCw className="animate-spin" size={18} /> Cargando Mas Boronat…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <TopBar role={role} email={session.user.email} lastSync={lastSync} syncing={syncing} onRefresh={() => refreshAll(false)} />
      <TabNav tabs={cfg.tabs} tab={tab} setTab={setTab} />

      {connectionIssue && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-700 text-xs text-center py-1.5 px-3">
          Problema de conexión — reintentando automáticamente…
        </div>
      )}
      {hotelStatus.closed && (
        <div className="bg-stone-800 text-white text-xs text-center py-1.5 px-3">
          🔒 El hotel está cerrado temporalmente. No se pueden crear nuevas reservas de alojamiento ni de restaurante.
        </div>
      )}
      {alertToast && (
        <div className="bg-amber-500 text-white text-xs text-center py-2 px-3 font-medium animate-pulse">
          {alertToast}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-5 pb-16">
        {tab === "dashboard" && <Dashboard rooms={rooms} stays={stays} bookings={bookings} tickets={tickets} events={events} setTab={setTab} />}
        {tab === "guests" && <GuestsModule rooms={rooms} stays={stays} persistStays={persistStays} editable={canEdit("guests")} deletable={canDelete(role, "guests")} hotelClosed={hotelStatus.closed && role !== "admin"} />}
        {tab === "restaurant" && <RestaurantModule stays={stays} bookings={bookings} persistBookings={persistBookings} editable={canEdit("restaurant")} deletable={canDelete(role, "restaurant")} hotelClosed={hotelStatus.closed && role !== "admin"} />}
        {tab === "housekeeping" && <HousekeepingModule rooms={rooms} persistRooms={persistRooms} salones={salones} persistSalones={persistSalones} editable={canEdit("housekeeping")} />}
        {tab === "maintenance" && <MaintenanceModule tickets={tickets} persistTickets={persistTickets} rooms={rooms} salones={salones} persistSalones={persistSalones} editable={canEdit("maintenance")} deletable={canDelete(role, "maintenance")} />}
        {tab === "events" && <EventsModule events={events} persistEvents={persistEvents} editable={canEdit("events")} deletable={canDelete(role, "events")} />}
        {tab === "planning" && <PlanningModule stays={stays} bookings={bookings} events={events} />}
        {tab === "planningGeneral" && <PlanningGeneralModule rooms={rooms} stays={stays} />}
        {tab === "admin" && role === "admin" && (
          <AdminModule rooms={rooms} stays={stays} bookings={bookings} tickets={tickets} expenses={expenses} persistExpenses={persistExpenses} persistStays={persistStays} hotelStatus={hotelStatus} persistHotelStatus={persistHotelStatus} email={session.user.email} />
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Barra superior y navegación                                             */
/* ---------------------------------------------------------------------- */

function TopBar({ role, email, lastSync, syncing, onRefresh }) {
  const { t, lang, setLang } = useTranslation();
  const roleLabel = t(`role_${role}`);
  return (
    <header className="bg-[#332b1f] text-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 border border-[#ab9574]/40 p-1">
            <img src="/logo-gold.svg" alt="Mas Boronat" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight text-sm sm:text-base truncate tracking-wide">Mas Boronat</h1>
            <p className="text-[#c4baab] text-[11px] leading-tight hidden sm:block">{t("tagline")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-0.5 mr-1" title={t("language")}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`text-sm px-1.5 py-1 rounded-md ${lang === l.code ? "bg-[#463b2a]" : "opacity-50 hover:opacity-100"}`}
              >
                {l.flag}
              </button>
            ))}
          </div>
          <button onClick={onRefresh} className="p-2 rounded-full hover:bg-[#463b2a] text-[#c4baab]" title={t("refresh")}>
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          </button>
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium">{roleLabel}</div>
            <div className="text-[10px] text-[#c4baab] truncate max-w-[160px]">{email}</div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="bg-[#463b2a] hover:bg-[#584a35] text-white text-xs font-medium rounded-lg px-3 py-2"
          >
            {t("logout")}
          </button>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-1.5 flex items-center justify-between gap-1.5 sm:hidden">
        <span className="text-[10px] text-[#c4baab]">{roleLabel} · {email}</span>
        <div className="flex items-center gap-0.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`text-xs px-1 py-0.5 rounded ${lang === l.code ? "bg-[#463b2a]" : "opacity-50"}`}
            >
              {l.flag}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-1.5 -mt-1 text-[10px] text-[#c4baab] flex items-center gap-1.5">
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ab9574] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ab9574]" />
        </span>
        {t("live")}{lastSync ? ` · ${t("lastUpdate")} ${lastSync.toLocaleTimeString()}` : ""}
      </div>
    </header>
  );
}

function TabNav({ tabs, tab, setTab }) {
  const { t } = useTranslation();
  return (
    <nav className="bg-white border-b border-stone-200 sticky top-[57px] sm:top-[61px] z-20 overflow-x-auto">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 flex gap-0.5">
        {tabs.map((tabKey) => {
          const meta = TAB_META[tabKey];
          const Icon = meta.icon;
          const active = tab === tabKey;
          return (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-2.5 text-[11px] sm:text-xs font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                active ? "border-[#ab9574] text-[#6d5c42]" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              <Icon size={14} />
              {t(`tab_${tabKey}`)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------------- */
/* Resumen                                                                  */
/* ---------------------------------------------------------------------- */

function Dashboard({ rooms, stays, bookings, tickets, events, setTab }) {
  const { t } = useTranslation();
  const today = todayStr();
  const staysToday = stays.filter((s) => s.status !== "Cancelada" && s.checkIn <= today && today <= s.checkOut);
  const unidadesOcupadas = new Set(staysToday.map((s) => s.roomId)).size;
  const personasAlojadas = staysToday.reduce((sum, s) => sum + (Number(s.numGuests) || 0), 0);
  const sucias = rooms.filter((r) => r.cleaningStatus === "Sucia").length;
  const inspeccion = rooms.filter((r) => r.cleaningStatus === "Inspección Necesaria").length;
  const ticketsAbiertos = tickets.filter((tk) => tk.status !== "Resuelto").length;
  const ticketsAltos = tickets.filter((tk) => tk.status !== "Resuelto" && tk.priority === "Alta").length;
  const reservasHoy = bookings.filter((b) => b.date === today).length;
  const eventosHoy = events.filter((e) => e.date === today && e.status !== "Cancelado").length;

  const cards = [
    { label: t("dash_units_occupied"), value: `${unidadesOcupadas}/${rooms.length}`, tone: "green", icon: BedDouble, onClick: () => setTab("guests") },
    { label: t("dash_occupancy_people"), value: `${personasAlojadas}/${TOTAL_CAPACITY}`, tone: "blue", icon: Users, onClick: () => setTab("guests") },
    { label: t("dash_units_to_clean"), value: sucias + inspeccion, tone: sucias + inspeccion > 0 ? "yellow" : "green", icon: Sparkles, onClick: () => setTab("housekeeping") },
    { label: t("dash_restaurant_today"), value: reservasHoy, tone: "blue", icon: UtensilsCrossed, onClick: () => setTab("restaurant") },
    { label: t("dash_open_tickets"), value: ticketsAbiertos, tone: ticketsAltos > 0 ? "red" : "slate", icon: Wrench, onClick: () => setTab("maintenance") },
    { label: t("dash_events_today"), value: eventosHoy, tone: "purple", icon: CalendarDays, onClick: () => setTab("events") },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {cards.map((c, i) => (
          <button key={i} onClick={c.onClick} className="bg-white rounded-2xl p-4 text-left border border-stone-200 hover:border-[#ab9574] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <c.icon size={18} className="text-stone-400" />
              <Badge tone={c.tone}>&nbsp;</Badge>
            </div>
            <div className="text-2xl font-semibold text-stone-800">{c.value}</div>
            <div className="text-xs text-stone-500 mt-0.5">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <h3 className="font-semibold text-stone-700 mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-rose-500" /> {t("dash_high_priority")}</h3>
          {tickets.filter((tk) => tk.priority === "Alta" && tk.status !== "Resuelto").length === 0 ? (
            <p className="text-sm text-stone-400">{t("dash_nothing_urgent")}</p>
          ) : (
            <ul className="space-y-2">
              {tickets.filter((tk) => tk.priority === "Alta" && tk.status !== "Resuelto").map((tk) => (
                <li key={tk.id} className="text-sm flex items-center justify-between">
                  <span className="text-stone-700">{tk.location} — {tk.issue}</span>
                  <Badge tone={ticketStatusTone(tk.status)}>{tk.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <h3 className="font-semibold text-stone-700 mb-3 flex items-center gap-2"><CalendarDays size={16} className="text-violet-500" /> {t("dash_upcoming_events")}</h3>
          {events.filter((e) => e.date >= today && e.status !== "Cancelado").length === 0 ? (
            <p className="text-sm text-stone-400">{t("dash_no_upcoming")}</p>
          ) : (
            <ul className="space-y-2">
              {events.filter((e) => e.date >= today && e.status !== "Cancelado").sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6).map((e) => (
                <li key={e.id} className="text-sm flex items-center justify-between">
                  <span className="text-stone-700">{e.title} · {e.date}</span>
                  <Badge tone="slate">{e.space}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Huéspedes / Alojamientos — reservas múltiples por unidad                 */
/* ---------------------------------------------------------------------- */

function GuestsModule({ rooms, stays, persistStays, editable, deletable, hotelClosed }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [newStayFor, setNewStayFor] = useState(null); // roomId
  const [editingStay, setEditingStay] = useState(null); // stay object
  const [showGroupModal, setShowGroupModal] = useState(false);

  const filtered = rooms.filter((r) => {
    const matchesType = typeFilter === "Todos" || r.type === typeFilter;
    if (!matchesType) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    if (unitLabel(r).toLowerCase().includes(q)) return true;
    return stays.some((s) => s.roomId === r.id && (s.guestName || "").toLowerCase().includes(q));
  });

  const groups = CATEGORIAS.map((c) => ({ ...c, rooms: filtered.filter((r) => r.type === c.type) })).filter(
    (g) => g.rooms.length > 0
  );

  const upsert = async (stay) => {
    let next;
    if (stay.id) next = stays.map((s) => (s.id === stay.id ? stay : s));
    else next = [...stays, { ...stay, id: uid() }];
    await persistStays(next);
    setNewStayFor(null);
    setEditingStay(null);
  };
  const remove = async (id) => { await persistStays(stays.filter((s) => s.id !== id)); };

  const saveGroup = async (newStays) => {
    await persistStays([...stays, ...newStays]);
    setShowGroupModal(false);
  };

  const stayModalRoom = newStayFor ? rooms.find((r) => r.id === newStayFor) : editingStay ? rooms.find((r) => r.id === editingStay.roomId) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Huéspedes y Alojamientos</h2>
          <p className="text-xs text-stone-400">Cada unidad puede tener varias reservas: pasadas, en curso y futuras</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
            {["Todos", ...TIPOS_ALOJAMIENTO].map((t) => <option key={t}>{t}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar alojamiento o huésped"
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#ab9574] w-40 sm:w-56"
            />
          </div>
          {editable && !hotelClosed && (
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-[#ab9574] text-[#6d5c42] hover:bg-[#ab9574]/10"
            >
              <Users size={14} /> Reserva de grupo (varias unidades)
            </button>
          )}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.type} className="mb-5">
          <div className="flex items-center gap-2 mb-2 sticky top-[105px] sm:top-[113px] z-10">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: g.color }}>{g.type}</h3>
            <span className="text-[11px] text-stone-400">({g.rooms.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {g.rooms.map((r) => {
              const roomStays = stays
                .filter((s) => s.roomId === r.id)
                .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
              const current = roomStays.find((s) => s.status !== "Cancelada" && stayTiming(s) === "En curso");

              return (
                <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-2.5">
                  <div className="flex items-center justify-between mb-1.5 gap-1">
                    <span className="font-semibold text-stone-800 text-sm truncate">{unitLabel(r)}</span>
                    <Badge tone={current ? "green" : "slate"}>{current ? "Ocupada" : "Libre"}</Badge>
                  </div>
                  <p className="text-[10px] text-stone-400 mb-1.5">Cap. {r.capacity} pers.</p>

                  {roomStays.length === 0 ? (
                    <p className="text-xs text-stone-400 italic mb-1.5">Sin reservas.</p>
                  ) : (
                    <ul className="space-y-1 mb-1.5 max-h-28 overflow-y-auto pr-0.5">
                      {roomStays.map((s) => (
                        <li key={s.id} className="text-[11px] border border-stone-100 rounded-lg px-2 py-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-stone-700 truncate">{s.guestName || "Sin nombre"}</span>
                            <Badge tone={stayTone(s)}>{s.status === "Cancelada" ? "Canc." : stayTiming(s)}</Badge>
                          </div>
                          <div className="text-stone-400 mt-0.5 truncate">{s.checkIn} → {s.checkOut}{(s.amountPaidBefore || s.amountPaidAfter) ? ` · ${(Number(s.amountPaidBefore || 0) + Number(s.amountPaidAfter || 0)).toFixed(2)} €` : ""}</div>
                          {(editable || deletable) && (
                            <div className="flex gap-2 mt-0.5">
                              {editable && <button onClick={() => setEditingStay(s)} className="text-[#6d5c42] font-medium">Editar</button>}
                              {deletable && <button onClick={() => remove(s.id)} className="text-rose-600 font-medium">Eliminar</button>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {editable && !hotelClosed && (
                    <button onClick={() => setNewStayFor(r.id)} className="w-full flex items-center justify-center gap-1 text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg py-1.5">
                      <Plus size={11} /> Nueva reserva
                    </button>
                  )}
                  {editable && hotelClosed && (
                    <p className="text-[10px] text-stone-400 text-center italic">Hotel cerrado</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-stone-400 italic">No hay alojamientos que coincidan con la búsqueda.</p>}

      {(newStayFor || editingStay) && stayModalRoom && (
        <StayModal
          room={stayModalRoom}
          stay={editingStay}
          otherStays={stays.filter((s) => s.roomId === stayModalRoom.id && s.id !== editingStay?.id)}
          onClose={() => { setNewStayFor(null); setEditingStay(null); }}
          onSave={upsert}
        />
      )}

      {showGroupModal && (
        <GroupBookingModal rooms={rooms} onClose={() => setShowGroupModal(false)} onSave={saveGroup} />
      )}
    </div>
  );
}

function GroupBookingModal({ rooms, onClose, onSave }) {
  const [guestName, setGuestName] = useState("");
  const [checkIn, setCheckIn] = useState(todayStr());
  const [checkOut, setCheckOut] = useState(todayStr());
  const [mealPlan, setMealPlan] = useState("Ninguno");
  const [guestsPerUnit, setGuestsPerUnit] = useState(2);
  const [pricePerUnit, setPricePerUnit] = useState(0);
  const [selected, setSelected] = useState({}); // { roomId: true }

  const groups = CATEGORIAS.map((c) => ({ ...c, rooms: rooms.filter((r) => r.type === c.type) }));
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allSelected = selectedIds.length === rooms.length && rooms.length > 0;

  const toggleRoom = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleCategory = (cat) => {
    const ids = groups.find((g) => g.type === cat).rooms.map((r) => r.id);
    const allOn = ids.every((id) => selected[id]);
    setSelected((s) => {
      const next = { ...s };
      ids.forEach((id) => { next[id] = !allOn; });
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(rooms.map((r) => [r.id, true])));
  };

  const totalCapacity = rooms.filter((r) => selected[r.id]).reduce((sum, r) => sum + r.capacity, 0);

  const submit = () => {
    if (!guestName.trim() || selectedIds.length === 0) return;
    const newStays = selectedIds.map((roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      return {
        id: uid(),
        roomId,
        roomLabel: unitLabel(room),
        guestName: guestName.trim(),
        checkIn,
        checkOut,
        numGuests: Math.min(guestsPerUnit, room.capacity),
        mealPlan,
        status: "Confirmada",
        amountPaidBefore: Number(pricePerUnit) || 0,
        amountPaidAfter: 0,
      };
    });
    onSave(newStays);
  };

  return (
    <Modal title="Reserva de grupo — varias unidades a la vez" onClose={onClose}>
      <p className="text-xs text-stone-500 mb-3">
        Ideal para bodas, retiros o grupos grandes: crea una reserva para todas las unidades que necesites en un solo paso, con el mismo huésped/grupo y las mismas fechas.
      </p>

      <Field label="Nombre del grupo / huésped principal">
        <input className={inputCls} maxLength={120} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="p. ej. Boda García-Ruiz, Retiro Acme" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de entrada">
          <input type="date" className={inputCls} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Fecha de salida">
          <input type="date" className={inputCls} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Huéspedes por unidad (aprox.)">
          <input type="number" min="1" className={inputCls} value={guestsPerUnit} onChange={(e) => setGuestsPerUnit(Number(e.target.value))} />
        </Field>
        <Field label="Régimen">
          <select className={inputCls} value={mealPlan} onChange={(e) => setMealPlan(e.target.value)}>
            {MEAL_PLANS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
      </div>
      <MoneyField label="Importe cobrado por unidad al confirmar (opcional)" value={pricePerUnit} onChange={setPricePerUnit} />

      <div className="flex items-center justify-between mb-2 mt-1">
        <span className="text-xs font-medium text-stone-500">Unidades a incluir</span>
        <button onClick={toggleAll} className="text-xs font-medium text-[#6d5c42]">
          {allSelected ? "Quitar todas" : "Seleccionar todo el complejo"}
        </button>
      </div>

      <div className="border border-stone-200 rounded-xl max-h-56 overflow-y-auto p-2 space-y-2 mb-2">
        {groups.map((g) => {
          const ids = g.rooms.map((r) => r.id);
          const allOn = ids.length > 0 && ids.every((id) => selected[id]);
          return (
            <div key={g.type}>
              <label className="flex items-center gap-2 mb-1 cursor-pointer">
                <input type="checkbox" checked={allOn} onChange={() => toggleCategory(g.type)} />
                <span className="text-xs font-semibold" style={{ color: g.color }}>{g.type}</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 pl-5">
                {g.rooms.map((r) => (
                  <label key={r.id} className="flex items-center gap-1 text-[11px] text-stone-600 cursor-pointer">
                    <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleRoom(r.id)} />
                    {r.number || r.type}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-stone-500 mb-4">
        {selectedIds.length} unidad{selectedIds.length !== 1 ? "es" : ""} seleccionada{selectedIds.length !== 1 ? "s" : ""} · capacidad total {totalCapacity} pers.
      </p>

      <button
        onClick={submit}
        disabled={!guestName.trim() || selectedIds.length === 0}
        className={`w-full py-2.5 ${primaryBtn} disabled:opacity-50`}
      >
        Crear {selectedIds.length || ""} reserva{selectedIds.length !== 1 ? "s" : ""}
      </button>
    </Modal>
  );
}

function StayModal({ room, stay, otherStays, onClose, onSave }) {
  const [form, setForm] = useState(
    stay || { roomId: room.id, roomLabel: unitLabel(room), guestName: "", checkIn: todayStr(), checkOut: todayStr(), numGuests: 1, mealPlan: "Ninguno", status: "Confirmada", amountPaidBefore: 0, amountPaidAfter: 0 }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const conflicts = otherStays.filter(
    (s) => s.status !== "Cancelada" && form.checkIn && form.checkOut && rangesOverlap(form.checkIn, form.checkOut, s.checkIn, s.checkOut)
  );

  return (
    <Modal title={`${unitLabel(room)} · capacidad ${room.capacity} pers.`} onClose={onClose}>
      <Field label="Nombre del huésped">
        <input className={inputCls} maxLength={120} value={form.guestName} onChange={(e) => set("guestName", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de entrada">
          <input type="date" className={inputCls} value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} />
        </Field>
        <Field label="Fecha de salida">
          <input type="date" className={inputCls} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} />
        </Field>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-3 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Esta unidad ya tiene {conflicts.length === 1 ? "otra reserva" : "otras reservas"} que se solapa{conflicts.length === 1 ? "" : "n"} en estas fechas:{" "}
            {conflicts.map((c) => `${c.guestName || "sin nombre"} (${c.checkIn} → ${c.checkOut})`).join(", ")}. Puedes guardar igualmente si es intencionado (p. ej. overbooking controlado).
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Número de huéspedes (máx. ${room.capacity})`}>
          <input type="number" min="0" max={room.capacity} className={inputCls} value={form.numGuests} onChange={(e) => set("numGuests", Math.min(Number(e.target.value), room.capacity))} />
        </Field>
        <Field label="Régimen">
          <select className={inputCls} value={form.mealPlan} onChange={(e) => set("mealPlan", e.target.value)}>
            {MEAL_PLANS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MoneyField label="Cobrado antes de la estancia" value={form.amountPaidBefore} onChange={(v) => set("amountPaidBefore", v)} />
        <MoneyField label="Cobrado al finalizar" value={form.amountPaidAfter} onChange={(v) => set("amountPaidAfter", v)} />
      </div>
      <Field label="Estado de la reserva">
        <div className="flex gap-2">
          {["Confirmada", "Cancelada"].map((s) => (
            <button key={s} onClick={() => set("status", s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.status === s ? selectedToggle : unselectedToggle}`}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <button onClick={() => onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Guardar reserva</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Restaurante                                                              */
/* ---------------------------------------------------------------------- */

function RestaurantModule({ stays, bookings, persistBookings, editable, deletable, hotelClosed }) {
  const [date, setDate] = useState(todayStr());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const dayBookings = bookings.filter((b) => b.date === date);

  const upsert = async (booking) => {
    let next;
    if (booking.id) next = bookings.map((b) => (b.id === booking.id ? booking : b));
    else next = [...bookings, { ...booking, id: uid() }];
    await persistBookings(next);
    setShowForm(false);
    setEditingId(null);
  };
  const remove = async (id) => { await persistBookings(bookings.filter((b) => b.id !== id)); };
  const editingBooking = editingId ? bookings.find((b) => b.id === editingId) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Restaurante Mas Boronat</h2>
          <p className="text-xs text-stone-400">Cocina mediterránea de temporada · Calçotades (enero–abril)</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " w-auto"} />
          {editable && !hotelClosed && (
            <button onClick={() => setShowForm(true)} className={`flex items-center gap-1.5 px-3 py-2 ${primaryBtn}`}>
              <Plus size={16} /> Nueva reserva
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {SHIFTS.map((shift) => {
          const shiftBookings = dayBookings.filter((b) => b.timeSlot === shift.key).sort((a, b) => a.time?.localeCompare?.(b.time));
          return (
            <div key={shift.key} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={15} className="text-stone-400" />
                <h3 className="font-semibold text-stone-700 text-sm">{shift.label}</h3>
                <span className="text-xs text-stone-400">desde las {shift.time}</span>
              </div>
              {shiftBookings.length === 0 ? (
                <p className="text-xs text-stone-400 italic">Todavía no hay reservas.</p>
              ) : (
                <ul className="space-y-2">
                  {shiftBookings.map((b) => (
                    <li key={b.id} className="border border-stone-100 rounded-xl p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-800">{b.time} · {b.guestName || "Cliente"}</span>
                        <Badge tone={b.clientType === "Huésped del Resort" ? "green" : "red"}>{b.clientType === "Huésped del Resort" ? "Resort" : "Externo"}</Badge>
                      </div>
                      <div className="text-xs text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Users size={11} /> {b.numPeople}</span>
                        {b.roomLabel && <span>{b.roomLabel}</span>}
                        {b.contact && <span className="flex items-center gap-1"><Phone size={11} /> {b.contact}</span>}
                        {(b.amountPaidBefore || b.amountPaidAfter) ? <span className="font-medium text-stone-700">{(Number(b.amountPaidBefore || 0) + Number(b.amountPaidAfter || 0)).toFixed(2)} €</span> : null}
                      </div>
                      {b.menuNotes && (
                        <div className="text-xs text-[#6d5c42] bg-[#ab9574]/10 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                          <StickyNote size={11} className="mt-0.5 shrink-0" /> <span><strong>Menú:</strong> {b.menuNotes}</span>
                        </div>
                      )}
                      {b.allergens && (
                        <div className="text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                          <ShieldAlert size={11} className="mt-0.5 shrink-0" /> <span><strong>Alérgenos:</strong> {b.allergens}</span>
                        </div>
                      )}
                      {b.notes && (
                        <div className="text-xs text-stone-600 bg-stone-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                          <StickyNote size={11} className="mt-0.5 shrink-0" /> {b.notes}
                        </div>
                      )}
                      {(editable || deletable) && (
                        <div className="flex gap-3 mt-2">
                          {editable && <button onClick={() => setEditingId(b.id)} className="text-xs text-[#6d5c42] font-medium">Editar</button>}
                          {deletable && <button onClick={() => remove(b.id)} className="text-xs text-rose-600 font-medium">Eliminar</button>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {(showForm || editingBooking) && (
        <BookingModal stays={stays} date={date} booking={editingBooking} onClose={() => { setShowForm(false); setEditingId(null); }} onSave={upsert} />
      )}
    </div>
  );
}

function BookingModal({ stays, date, booking, onClose, onSave }) {
  const [form, setForm] = useState(
    booking || {
      date, timeSlot: "Desayuno", time: "08:00", clientType: "Huésped del Resort",
      stayId: "", roomLabel: "", guestName: "", numPeople: 2, contact: "",
      menuNotes: "", allergens: "", notes: "", amountPaidBefore: 0, amountPaidAfter: 0,
    }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Huéspedes con estancia activa en la fecha de la reserva
  const activeStays = stays.filter((s) => s.status !== "Cancelada" && s.checkIn <= form.date && form.date <= s.checkOut);

  const onStaySelect = (stayId) => {
    const stay = activeStays.find((s) => s.id === stayId);
    setForm((f) => ({ ...f, stayId, roomLabel: stay?.roomLabel || "", guestName: stay?.guestName || "" }));
  };

  return (
    <Modal title={booking ? "Editar reserva" : "Nueva reserva de comida"} onClose={onClose}>
      <Field label="Fecha">
        <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Turno">
          <select className={inputCls} value={form.timeSlot} onChange={(e) => set("timeSlot", e.target.value)}>
            {SHIFTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Hora">
          <input type="time" className={inputCls} value={form.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
      </div>

      <Field label="Tipo de cliente">
        <div className="flex gap-2">
          {["Huésped del Resort", "Cliente Externo"].map((t) => (
            <button key={t} onClick={() => set("clientType", t)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.clientType === t ? selectedToggle : unselectedToggle}`}>
              {t}
            </button>
          ))}
        </div>
      </Field>

      {form.clientType === "Huésped del Resort" ? (
        <Field label="Alojamiento (huéspedes con estancia esa fecha)">
          <select className={inputCls} value={form.stayId} onChange={(e) => onStaySelect(e.target.value)}>
            <option value="">Seleccionar huésped…</option>
            {activeStays.map((s) => (
              <option key={s.id} value={s.id}>{s.roomLabel} — {s.guestName || "Sin nombre"}</option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Nombre del cliente">
            <input className={inputCls} maxLength={120} value={form.guestName} onChange={(e) => set("guestName", e.target.value)} />
          </Field>
          <Field label="Datos de contacto">
            <input className={inputCls} maxLength={120} value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Teléfono o email" />
          </Field>
        </>
      )}

      <Field label="Número de personas">
        <input type="number" min="1" className={inputCls} value={form.numPeople} onChange={(e) => set("numPeople", Number(e.target.value))} />
      </Field>
      <Field label="Menú / platos previstos">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.menuNotes} onChange={(e) => set("menuNotes", e.target.value)} placeholder="p. ej. Calçotada completa, menú degustación…" />
      </Field>
      <Field label="Alérgenos / restricciones alimentarias">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="p. ej. alergia a frutos secos, sin gluten…" />
      </Field>
      <Field label="Otras peticiones (mesa, ocasión especial…)">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="p. ej. mesa junto al patio, aniversario…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <MoneyField label="Cobrado antes del servicio" value={form.amountPaidBefore} onChange={(v) => set("amountPaidBefore", v)} />
        <MoneyField label="Cobrado al finalizar" value={form.amountPaidAfter} onChange={(v) => set("amountPaidAfter", v)} />
      </div>

      <button onClick={() => onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Guardar reserva</button>
    </Modal>
  );
}

function cleanStatusIcon(status) {
  if (status === "Limpia") return <CheckCircle2 size={13} />;
  if (status === "Sucia") return <AlertTriangle size={13} />;
  if (status === "En Progreso") return <RefreshCw size={13} />;
  return <Circle size={13} />;
}

function CleaningStatusCard({ id, label, cleaningStatus, cleaningNotes, onCycle, onSaveNote, noteKind, editable, noteEditing, setNoteEditing }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className="font-semibold text-stone-800 text-sm truncate">{label}</span>
        <Badge tone={cleanTone(cleaningStatus)}>
          <span className="flex items-center gap-1">{cleanStatusIcon(cleaningStatus)} {cleaningStatus}</span>
        </Badge>
      </div>
      {editable ? (
        <button onClick={() => onCycle(id)} className="w-full text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg py-1.5 mb-1.5">
          Toca para actualizar →
        </button>
      ) : null}
      {cleaningNotes && (
        <div className="text-[11px] text-stone-500 bg-stone-50 rounded-md px-2 py-1 mb-1.5 flex items-start gap-1">
          <StickyNote size={10} className="mt-0.5 shrink-0" /> {cleaningNotes}
        </div>
      )}
      {editable && (
        noteEditing && noteEditing.kind === noteKind && noteEditing.id === id ? (
          <NoteInline initial={cleaningNotes} onSave={(v) => onSaveNote(id, v)} onCancel={() => setNoteEditing(null)} />
        ) : (
          <button onClick={() => setNoteEditing({ kind: noteKind, id })} className="text-[11px] text-[#6d5c42] font-medium">
            {cleaningNotes ? "Editar nota" : "+ Añadir nota"}
          </button>
        )
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Limpieza                                                                 */
/* ---------------------------------------------------------------------- */

function HousekeepingModule({ rooms, persistRooms, salones, persistSalones, editable }) {
  const [noteEditing, setNoteEditing] = useState(null); // { kind: "room"|"salon", id }
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [onlyPending, setOnlyPending] = useState(false);

  const cycleRoomStatus = async (id) => {
    const current = rooms.find((r) => r.id === id);
    const nextStatus = CLEAN_STATUSES[(CLEAN_STATUSES.indexOf(current.cleaningStatus) + 1) % CLEAN_STATUSES.length];
    await persistRooms(rooms.map((r) => (r.id === id ? { ...r, cleaningStatus: nextStatus } : r)));
  };
  const saveRoomNote = async (id, note) => {
    await persistRooms(rooms.map((r) => (r.id === id ? { ...r, cleaningNotes: note } : r)));
    setNoteEditing(null);
  };
  const cycleSalonStatus = async (id) => {
    const current = salones.find((s) => s.id === id);
    const nextStatus = CLEAN_STATUSES[(CLEAN_STATUSES.indexOf(current.cleaningStatus) + 1) % CLEAN_STATUSES.length];
    await persistSalones(salones.map((s) => (s.id === id ? { ...s, cleaningStatus: nextStatus } : s)));
  };
  const saveSalonNote = async (id, note) => {
    await persistSalones(salones.map((s) => (s.id === id ? { ...s, cleaningNotes: note } : s)));
    setNoteEditing(null);
  };

  const filteredRooms = rooms.filter((r) => {
    if (typeFilter !== "Todos" && r.type !== typeFilter) return false;
    if (onlyPending && r.cleaningStatus === "Limpia") return false;
    return true;
  });
  const roomGroups = CATEGORIAS.map((c) => ({ ...c, rooms: filteredRooms.filter((r) => r.type === c.type) })).filter(
    (g) => g.rooms.length > 0
  );

  // Los espacios exteriores son solo de Mantenimiento; aquí solo se gestionan los salones interiores.
  const interiorSalones = salones.filter((s) => s.category === "Salones");
  const filteredSalones = interiorSalones.filter((s) => (onlyPending ? s.cleaningStatus !== "Limpia" : true));
  const salonGroups = filteredSalones.length > 0
    ? [{ type: "Salones", color: SALONES_BASE.find((s) => s.category === "Salones")?.color || "#0891b2", items: filteredSalones }]
    : [];

  const pendingCount = rooms.filter((r) => r.cleaningStatus !== "Limpia").length + interiorSalones.filter((s) => s.cleaningStatus !== "Limpia").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Limpieza — Alojamientos, Salones y Espacios</h2>
          <p className="text-xs text-stone-400">{pendingCount === 0 ? "Todo limpio ahora mismo" : `${pendingCount} unidad${pendingCount !== 1 ? "es" : ""} por revisar`}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
            {["Todos", ...TIPOS_ALOJAMIENTO].map((t) => <option key={t}>{t}</option>)}
          </select>
          <button
            onClick={() => setOnlyPending((v) => !v)}
            className={`text-xs font-medium px-3 py-2 rounded-lg border ${onlyPending ? selectedToggle : unselectedToggle}`}
          >
            Solo pendientes
          </button>
        </div>
      </div>

      {roomGroups.map((g) => (
        <div key={g.type} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: g.color }}>{g.type}</h3>
            <span className="text-[11px] text-stone-400">({g.rooms.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {g.rooms.map((r) => (
              <CleaningStatusCard
                key={r.id}
                id={r.id}
                label={unitLabel(r)}
                cleaningStatus={r.cleaningStatus}
                cleaningNotes={r.cleaningNotes}
                onCycle={cycleRoomStatus}
                onSaveNote={saveRoomNote}
                noteKind="room"
                editable={editable}
                noteEditing={noteEditing}
                setNoteEditing={setNoteEditing}
              />
            ))}
          </div>
        </div>
      ))}

      {salonGroups.map((g) => (
        <div key={g.type} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: g.color }}>{g.type}</h3>
            <span className="text-[11px] text-stone-400">({g.items.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {g.items.map((s) => (
              <CleaningStatusCard
                key={s.id}
                id={s.id}
                label={s.name}
                cleaningStatus={s.cleaningStatus}
                cleaningNotes={s.cleaningNotes}
                onCycle={cycleSalonStatus}
                onSaveNote={saveSalonNote}
                noteKind="salon"
                editable={editable}
                noteEditing={noteEditing}
                setNoteEditing={setNoteEditing}
              />
            ))}
          </div>
        </div>
      ))}

      {roomGroups.length === 0 && salonGroups.length === 0 && (
        <p className="text-sm text-stone-400 italic">No hay unidades que coincidan con el filtro.</p>
      )}
      <p className="text-[11px] text-stone-400 mt-2">Los salones se marcan "Sucia" automáticamente en cuanto pasa la fecha de un evento confirmado en ese espacio.</p>
    </div>
  );
}

function NoteInline({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial || "");
  return (
    <div>
      <textarea className={inputCls} maxLength={400} rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder="p. ej. toallas extra, petición del huésped" />
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => onSave(v)} className="text-xs font-medium bg-[#806c4d] text-white rounded-md px-2.5 py-1">Guardar</button>
        <button onClick={onCancel} className="text-xs font-medium text-stone-500">Cancelar</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mantenimiento                                                             */
/* ---------------------------------------------------------------------- */

function MaintenanceModule({ tickets, persistTickets, rooms, salones, persistSalones, editable, deletable }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("Todos");
  const [noteEditing, setNoteEditing] = useState(null);

  const exteriorSalones = salones.filter((s) => s.category === "Espacios Exteriores");

  const cycleExteriorStatus = async (id) => {
    const current = salones.find((s) => s.id === id);
    const nextStatus = CLEAN_STATUSES[(CLEAN_STATUSES.indexOf(current.cleaningStatus) + 1) % CLEAN_STATUSES.length];
    await persistSalones(salones.map((s) => (s.id === id ? { ...s, cleaningStatus: nextStatus } : s)));
  };
  const saveExteriorNote = async (id, note) => {
    await persistSalones(salones.map((s) => (s.id === id ? { ...s, cleaningNotes: note } : s)));
    setNoteEditing(null);
  };

  const create = async (ticket) => {
    await persistTickets([{ ...ticket, id: uid(), timestamp: new Date().toISOString() }, ...tickets]);
    setShowForm(false);
  };
  const updateStatus = async (id, status) => {
    await persistTickets(
      tickets.map((t) =>
        t.id === id
          ? { ...t, status, resolvedAt: status === "Resuelto" ? new Date().toISOString() : null }
          : t
      )
    );
  };
  const remove = async (id) => { await persistTickets(tickets.filter((t) => t.id !== id)); };

  const sorted = [...tickets].sort((a, b) => {
    const order = { Alta: 0, Media: 1, Baja: 2 };
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  const filtered = filter === "Todos" ? sorted : sorted.filter((t) => t.status === filter);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-stone-800 mb-1">Espacios Exteriores</h2>
        <p className="text-xs text-stone-400 mb-2">Bar Piscina, Moreras y Plaza — se marcan solos como "Sucia" al terminar un evento ahí</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {exteriorSalones.map((s) => (
            <CleaningStatusCard
              key={s.id}
              id={s.id}
              label={s.name}
              cleaningStatus={s.cleaningStatus}
              cleaningNotes={s.cleaningNotes}
              onCycle={cycleExteriorStatus}
              onSaveNote={saveExteriorNote}
              noteKind="ext-salon"
              editable={editable}
              noteEditing={noteEditing}
              setNoteEditing={setNoteEditing}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-stone-800">Tickets de Mantenimiento</h2>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputCls + " w-auto"}>
            {["Todos", ...TICKET_STATUSES].map((s) => <option key={s}>{s}</option>)}
          </select>
          {editable && (
            <button onClick={() => setShowForm(true)} className={`flex items-center gap-1.5 px-3 py-2 ${primaryBtn}`}>
              <Plus size={16} /> Nuevo ticket
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400 italic">Ningún ticket coincide con este filtro.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                <span className="font-semibold text-stone-800">{t.location}</span>
                <div className="flex gap-2">
                  <Badge tone={priorityTone(t.priority)}>Prioridad {t.priority}</Badge>
                  <Badge tone={ticketStatusTone(t.status)}>{t.status}</Badge>
                </div>
              </div>
              <p className="text-sm text-stone-600 mb-2">{t.issue}</p>
              <div className="text-xs text-stone-400 flex flex-wrap gap-3 mb-2">
                {t.assignedTo && <span>Asignado: {t.assignedTo}</span>}
                <span>{new Date(t.timestamp).toLocaleString()}</span>
              </div>
              {(editable || deletable) && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {editable && (
                    <div className="flex gap-2">
                      {TICKET_STATUSES.map((s) => (
                        <button key={s} onClick={() => updateStatus(t.id, s)} className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${t.status === s ? selectedToggle : unselectedToggle}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {deletable && <button onClick={() => remove(t.id)} className="text-xs text-rose-600 font-medium">Eliminar</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && <TicketModal rooms={rooms} salones={salones} onClose={() => setShowForm(false)} onSave={create} />}
    </div>
  );
}

function TicketModal({ rooms, salones, onClose, onSave }) {
  const [form, setForm] = useState({ location: "", issue: "", priority: "Media", status: "Pendiente", assignedTo: "" });
  const [customLocation, setCustomLocation] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onLocationSelect = (value) => {
    if (value === "__otro__") { setCustomLocation(true); set("location", ""); }
    else { setCustomLocation(false); set("location", value); }
  };

  return (
    <Modal title="Nuevo ticket de mantenimiento" onClose={onClose}>
      <Field label="Alojamiento / salón / espacio">
        {!customLocation ? (
          <select className={inputCls} value={form.location} onChange={(e) => onLocationSelect(e.target.value)}>
            <option value="">Seleccionar…</option>
            {TIPOS_ALOJAMIENTO.map((t) => (
              <optgroup key={t} label={t}>
                {rooms.filter((r) => r.type === t).map((r) => (
                  <option key={r.id} value={unitLabel(r)}>{unitLabel(r)}</option>
                ))}
              </optgroup>
            ))}
            {SALON_CATEGORIAS.map((cat) => (
              <optgroup key={cat} label={cat}>
                {salones.filter((s) => s.category === cat).map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </optgroup>
            ))}
            <option value="__otro__">Otro (especificar)…</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input className={inputCls} maxLength={120} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Escribe la ubicación" autoFocus />
            <button onClick={() => setCustomLocation(false)} className="text-xs text-stone-500 shrink-0">Elegir de la lista</button>
          </div>
        )}
      </Field>
      <Field label="Descripción del problema">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.issue} onChange={(e) => set("issue", e.target.value)} placeholder="p. ej. aire acondicionado gotea, luz fundida" />
      </Field>
      <Field label="Prioridad">
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => set("priority", p)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.priority === p ? selectedToggle : unselectedToggle}`}>
              {p}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Empleado asignado (opcional)">
        <input className={inputCls} maxLength={120} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} />
      </Field>
      <button onClick={() => form.location && form.issue && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Crear ticket</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Eventos                                                                   */
/* ---------------------------------------------------------------------- */

function EventsModule({ events, persistEvents, editable, deletable }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  const upsert = async (ev) => {
    let next;
    if (ev.id) next = events.map((e) => (e.id === ev.id ? ev : e));
    else next = [...events, { ...ev, id: uid() }];
    await persistEvents(next);
    setShowForm(false);
    setEditingId(null);
  };
  const remove = async (id) => { await persistEvents(events.filter((e) => e.id !== id)); };

  const filtered = events.filter((e) => e.date.startsWith(monthFilter)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const editingEvent = editingId ? events.find((e) => e.id === editingId) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Eventos</h2>
          <p className="text-xs text-stone-400">Bodas, retiros corporativos, bienestar y celebraciones en la masía</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={inputCls + " w-auto"} />
          {editable && (
            <button onClick={() => setShowForm(true)} className={`flex items-center gap-1.5 px-3 py-2 ${primaryBtn}`}>
              <Plus size={16} /> Nuevo evento
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400 italic">No hay eventos este mes.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((e) => (
            <div key={e.id} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div>
                  <span className="font-semibold text-stone-800">{e.title}</span>
                  <span className="block text-[11px] text-stone-400">{e.eventType}</span>
                </div>
                <Badge tone={eventStatusTone(e.status)}>{e.status}</Badge>
              </div>
              <div className="text-sm text-stone-600 space-y-1">
                <div className="flex items-center gap-1.5"><CalendarDays size={13} className="text-stone-400" /> {e.date} · {e.startTime}{e.endTime ? ` – ${e.endTime}` : ""}</div>
                <div className="flex items-center gap-1.5"><MapPin size={13} className="text-stone-400" /> {e.space}</div>
                {e.expectedGuests ? (
                  <div className="flex items-center gap-1.5"><Users size={13} className="text-stone-400" /> {e.expectedGuests} personas esperadas</div>
                ) : null}
                {e.responsible && <div className="text-xs text-stone-400">Responsable: {e.responsible}</div>}
              </div>
              {e.menuNotes && (
                <div className="text-xs text-[#6d5c42] bg-[#ab9574]/10 rounded-md px-2 py-1 mt-2 flex items-start gap-1">
                  <StickyNote size={11} className="mt-0.5 shrink-0" /> <span><strong>Menú/catering:</strong> {e.menuNotes}</span>
                </div>
              )}
              {e.allergens && (
                <div className="text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                  <ShieldAlert size={11} className="mt-0.5 shrink-0" /> <span><strong>Alérgenos:</strong> {e.allergens}</span>
                </div>
              )}
              {e.notes && (
                <div className="text-xs text-stone-600 bg-stone-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                  <StickyNote size={11} className="mt-0.5 shrink-0" /> {e.notes}
                </div>
              )}
              {(editable || deletable) && (
                <div className="flex gap-3 mt-2">
                  {editable && <button onClick={() => setEditingId(e.id)} className="text-xs text-[#6d5c42] font-medium">Editar</button>}
                  {deletable && <button onClick={() => remove(e.id)} className="text-xs text-rose-600 font-medium">Eliminar</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(showForm || editingEvent) && (
        <EventModal event={editingEvent} onClose={() => { setShowForm(false); setEditingId(null); }} onSave={upsert} />
      )}
    </div>
  );
}

function EventModal({ event, onClose, onSave }) {
  const [form, setForm] = useState(
    event || {
      title: "", eventType: "Boda", date: todayStr(), startTime: "18:00", endTime: "",
      space: "Patio Central (Masía s. XVII)", expectedGuests: "", responsible: "", status: "Programado",
      menuNotes: "", allergens: "", notes: "",
    }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={event ? "Editar evento" : "Nuevo evento"} onClose={onClose}>
      <Field label="Título del evento">
        <input className={inputCls} maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="p. ej. Boda García-Ruiz, Retiro corporativo Acme" />
      </Field>
      <Field label="Tipo de evento">
        <select className={inputCls} value={form.eventType} onChange={(e) => set("eventType", e.target.value)}>
          {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Espacio utilizado">
          <select className={inputCls} value={form.space} onChange={(e) => set("space", e.target.value)}>
            {EVENT_SPACES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hora de inicio">
          <input type="time" className={inputCls} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
        </Field>
        <Field label="Hora de fin (opcional)">
          <input type="time" className={inputCls} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Personas esperadas">
          <input type="number" min="0" className={inputCls} value={form.expectedGuests} onChange={(e) => set("expectedGuests", e.target.value)} />
        </Field>
        <Field label="Responsable">
          <input className={inputCls} maxLength={120} value={form.responsible} onChange={(e) => set("responsible", e.target.value)} placeholder="Nombre del encargado" />
        </Field>
      </div>
      <Field label="Estado">
        <div className="flex gap-2 flex-wrap">
          {EVENT_STATUSES.map((s) => (
            <button key={s} onClick={() => set("status", s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.status === s ? selectedToggle : unselectedToggle}`}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Menú / catering previsto">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.menuNotes} onChange={(e) => set("menuNotes", e.target.value)} placeholder="p. ej. Menú degustación 4 platos, cóctel de bienvenida…" />
      </Field>
      <Field label="Alérgenos / restricciones alimentarias">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="p. ej. 2 comensales sin gluten, alergia a marisco…" />
      </Field>
      <Field label="Notas logísticas">
        <textarea className={inputCls} maxLength={400} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Montaje, equipo audiovisual, decoración…" />
      </Field>
      <button onClick={() => form.title && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Guardar evento</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Planning — calendario compartido hasta 2030                              */
/* ---------------------------------------------------------------------- */

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PlanningModule({ stays, bookings, events }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(null);

  const [year, mon] = month.split("-").map(Number);
  const firstOfMonth = new Date(year, mon - 1, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, mon, 0).getDate();
  const monthName = firstOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const today = todayStr();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

  const staysOn = (dateStr) => stays.filter((s) => s.status !== "Cancelada" && s.checkIn <= dateStr && dateStr <= s.checkOut);

  const countsFor = (dateStr) => ({
    stays: staysOn(dateStr).length,
    bookings: bookings.filter((b) => b.date === dateStr).length,
    events: events.filter((e) => e.date === dateStr && e.status !== "Cancelado").length,
  });

  const selStays = selectedDate ? staysOn(selectedDate) : [];
  const selBookings = selectedDate ? bookings.filter((b) => b.date === selectedDate).sort((a, b) => a.time?.localeCompare?.(b.time)) : [];
  const selEvents = selectedDate ? events.filter((e) => e.date === selectedDate) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Planning</h2>
          <p className="text-xs text-stone-400">Vista compartida de alojamientos, reservas y eventos, de julio 2026 a diciembre 2030</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => month > PLANNING_MIN && setMonth(shiftMonth(month, -1))}
            disabled={month <= PLANNING_MIN}
            className="p-2 rounded-lg border border-stone-300 text-stone-600 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={month}
            min={PLANNING_MIN}
            max={PLANNING_MAX}
            onChange={(e) => setMonth(e.target.value)}
            className={inputCls + " w-auto"}
          />
          <button
            onClick={() => month < PLANNING_MAX && setMonth(shiftMonth(month, 1))}
            disabled={month >= PLANNING_MAX}
            className="p-2 rounded-lg border border-stone-300 text-stone-600 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-3 sm:p-4">
        <h3 className="text-center font-semibold text-stone-700 mb-3 capitalize">{monthName}</h3>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-stone-400 mb-1">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={i} />;
            const { stays: sCount, bookings: bCount, events: eCount } = countsFor(dateStr);
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const dayNum = Number(dateStr.slice(-2));
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`aspect-square rounded-lg border text-left p-1 flex flex-col justify-between transition-colors ${
                  isSelected ? "border-[#ab9574] bg-[#ab9574]/10" : isToday ? "border-[#ab9574] bg-[#ab9574]/10/40" : "border-stone-100 hover:bg-stone-50"
                }`}
              >
                <span className={`text-[11px] ${isToday ? "font-bold text-[#6d5c42]" : "text-stone-600"}`}>{dayNum}</span>
                <div className="flex gap-0.5 flex-wrap">
                  {sCount > 0 && <span className="text-[9px] leading-none px-1 py-0.5 rounded bg-emerald-100 text-emerald-800">{sCount}A</span>}
                  {bCount > 0 && <span className="text-[9px] leading-none px-1 py-0.5 rounded bg-sky-100 text-sky-800">{bCount}R</span>}
                  {eCount > 0 && <span className="text-[9px] leading-none px-1 py-0.5 rounded bg-violet-100 text-violet-800">{eCount}E</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11px] text-stone-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 inline-block" /> Alojamientos ocupados</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky-100 border border-sky-300 inline-block" /> Reservas restaurante</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-100 border border-violet-300 inline-block" /> Eventos</span>
        </div>
      </div>

      {selectedDate && (
        <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-4">
          <h3 className="font-semibold text-stone-800 mb-3">{new Date(selectedDate + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>

          <div className="mb-4">
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Alojamientos ocupados</h4>
            {selStays.length === 0 ? (
              <p className="text-sm text-stone-400 italic">Ninguna reserva de alojamiento ese día.</p>
            ) : (
              <ul className="space-y-1.5">
                {selStays.map((s) => {
                  const isCheckIn = s.checkIn === selectedDate;
                  const isCheckOut = s.checkOut === selectedDate;
                  return (
                    <li key={s.id} className="text-sm border border-stone-100 rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-700 font-medium">{s.roomLabel} · {s.guestName || "Huésped"}</span>
                        <div className="flex gap-1">
                          {isCheckIn && <Badge tone="green">Entrada</Badge>}
                          {isCheckOut && <Badge tone="red">Salida</Badge>}
                          {!isCheckIn && !isCheckOut && <Badge tone="slate">En estancia</Badge>}
                        </div>
                      </div>
                      <div className="text-xs text-stone-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1"><Users size={11} /> {s.numGuests} pers.</span>
                        <span>{s.mealPlan}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mb-4">
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Reservas de restaurante</h4>
            {selBookings.length === 0 ? (
              <p className="text-sm text-stone-400 italic">Sin reservas ese día.</p>
            ) : (
              <ul className="space-y-1.5">
                {selBookings.map((b) => (
                  <li key={b.id} className="text-sm flex items-center justify-between border border-stone-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-stone-700">{b.time} · {b.timeSlot} · {b.guestName || "Cliente"} ({b.numPeople}p)</span>
                    <Badge tone={b.clientType === "Huésped del Resort" ? "green" : "red"}>{b.clientType === "Huésped del Resort" ? "Resort" : "Externo"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Eventos</h4>
            {selEvents.length === 0 ? (
              <p className="text-sm text-stone-400 italic">Sin eventos ese día.</p>
            ) : (
              <ul className="space-y-1.5">
                {selEvents.map((e) => (
                  <li key={e.id} className="text-sm border border-stone-100 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-700 font-medium">{e.startTime} · {e.title}</span>
                      <Badge tone={eventStatusTone(e.status)}>{e.status}</Badge>
                    </div>
                    <div className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5"><MapPin size={11} /> {e.space} · {e.eventType}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Planning General de Alojamiento — vista tipo Gantt por habitación        */
/* ---------------------------------------------------------------------- */

const GANTT_DAY_WIDTH = 42; // px por día
const GANTT_ROOM_COL = 168; // px de la columna de habitación

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}
function stayBarTone(s) {
  if (s.status === "Cancelada") return null;
  const timing = stayTiming(s);
  if (timing === "En curso") return { bg: "#16a34a", text: "#fff" }; // verde: huésped en casa ahora
  if (timing === "Próxima") return { bg: "#0369a1", text: "#fff" }; // azul: reserva futura
  return { bg: "#a8a29e", text: "#fff" }; // gris: estancia ya finalizada
}

function PlanningGeneralModule({ rooms, stays }) {
  const [windowStart, setWindowStart] = useState(todayStr());
  const [daysToShow, setDaysToShow] = useState(21);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [activeStay, setActiveStay] = useState(null);

  const days = Array.from({ length: daysToShow }, (_, i) => addDays(windowStart, i));
  const windowEnd = days[days.length - 1];
  const today = todayStr();

  const q = query.trim().toLowerCase();
  const roomMatches = (r) => {
    if (typeFilter !== "Todos" && r.type !== typeFilter) return false;
    if (!q) return true;
    return stays.some((s) => s.roomId === r.id && (s.guestName || "").toLowerCase().includes(q));
  };
  const visibleRooms = rooms.filter(roomMatches);

  const groups = CATEGORIAS.map((c) => ({
    ...c,
    rooms: visibleRooms.filter((r) => r.type === c.type),
  })).filter((g) => g.rooms.length > 0);

  const staysForRoom = (roomId) =>
    stays.filter(
      (s) => s.roomId === roomId && s.status !== "Cancelada" && rangesOverlap(s.checkIn, s.checkOut, windowStart, windowEnd)
    );

  // Meses que aparecen en la ventana visible, con cuántos días de cada uno se ven (para la fila de cabecera)
  const monthSpans = [];
  days.forEach((d) => {
    const label = new Date(d + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthSpans.push({ label, count: 1 });
  });

  const totalWidth = GANTT_DAY_WIDTH * daysToShow;
  const gridBg = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${GANTT_DAY_WIDTH - 1}px, #e7e5e4 ${GANTT_DAY_WIDTH - 1}px, #e7e5e4 ${GANTT_DAY_WIDTH}px)`,
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-800">Planning General de Alojamiento</h2>
        <p className="text-xs text-stone-400">Vista de conjunto por habitación — igual de un vistazo que el planning de siempre</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar huésped"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#ab9574] w-40 sm:w-56"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
          {["Todos", ...TIPOS_ALOJAMIENTO].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={daysToShow} onChange={(e) => setDaysToShow(Number(e.target.value))} className={inputCls + " w-auto"}>
          <option value={14}>14 días</option>
          <option value={21}>21 días</option>
          <option value={30}>30 días</option>
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setWindowStart(addDays(windowStart, -daysToShow))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="Página anterior">
            <ChevronsLeft size={15} />
          </button>
          <button onClick={() => setWindowStart(addDays(windowStart, -7))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="7 días atrás">
            <ChevronLeft size={15} />
          </button>
          <input type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={inputCls + " w-auto"} />
          <button onClick={() => setWindowStart(today)} className="px-2 py-2 rounded-lg border border-stone-300 text-stone-600 text-xs font-medium">Hoy</button>
          <button onClick={() => setWindowStart(addDays(windowStart, 7))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="7 días adelante">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => setWindowStart(addDays(windowStart, daysToShow))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="Página siguiente">
            <ChevronsRight size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2 text-[11px] text-stone-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#16a34a] inline-block" /> Huésped alojado ahora</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#0369a1] inline-block" /> Reserva futura</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#a8a29e] inline-block" /> Estancia finalizada</span>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ width: GANTT_ROOM_COL + totalWidth }}>
            {/* Cabecera: meses y días */}
            <div className="flex sticky top-0 z-20 bg-white border-b border-stone-200">
              <div style={{ width: GANTT_ROOM_COL }} className="shrink-0 sticky left-0 z-30 bg-white border-r border-stone-200" />
              <div>
                <div className="flex border-b border-stone-100">
                  {monthSpans.map((m, i) => (
                    <div
                      key={i}
                      style={{ width: m.count * GANTT_DAY_WIDTH }}
                      className="text-center text-[11px] font-semibold text-stone-600 py-1 capitalize border-r border-stone-100"
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {days.map((d) => {
                    const dow = new Date(d + "T00:00:00").getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = d === today;
                    return (
                      <div
                        key={d}
                        style={{ width: GANTT_DAY_WIDTH }}
                        className={`text-center text-[10px] py-1 border-r border-stone-100 ${isToday ? "bg-[#ab9574]/20 font-bold text-[#6d5c42]" : isWeekend ? "bg-stone-50 text-stone-400" : "text-stone-500"}`}
                      >
                        {Number(d.slice(-2))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cuerpo: grupos por edificio y filas por habitación */}
            {groups.map((g) => (
              <div key={g.type}>
                <div className="flex">
                  <div
                    style={{ width: GANTT_ROOM_COL, backgroundColor: g.color }}
                    className="shrink-0 sticky left-0 z-10 text-white text-xs font-semibold px-3 py-1.5"
                  >
                    {g.type}
                  </div>
                  <div style={{ width: totalWidth }} className="bg-stone-50" />
                </div>
                {g.rooms.map((r) => {
                  const roomStays = staysForRoom(r.id);
                  return (
                    <div key={r.id} className="flex border-b border-stone-100">
                      <div
                        style={{ width: GANTT_ROOM_COL, borderLeft: `4px solid ${g.color}` }}
                        className="shrink-0 sticky left-0 z-10 bg-white px-2.5 py-2 flex items-center gap-2"
                      >
                        <span className="text-xs font-medium text-stone-700 truncate">{unitLabel(r)}</span>
                      </div>
                      <div className="relative" style={{ width: totalWidth, height: 40, ...gridBg }}>
                        {roomStays.map((s) => {
                          const tone = stayBarTone(s);
                          if (!tone) return null;
                          const startOffset = Math.max(0, daysBetween(windowStart, s.checkIn));
                          const clippedEnd = Math.min(daysBetween(windowStart, s.checkOut), daysToShow - 1);
                          const widthDays = Math.max(1, clippedEnd - startOffset + 1);
                          return (
                            <button
                              key={s.id}
                              onClick={() => setActiveStay(s)}
                              title={`${s.guestName || "Sin nombre"} · ${s.checkIn} → ${s.checkOut}`}
                              style={{
                                left: startOffset * GANTT_DAY_WIDTH + 2,
                                width: widthDays * GANTT_DAY_WIDTH - 4,
                                top: 4,
                                height: 32,
                                backgroundColor: tone.bg,
                                color: tone.text,
                              }}
                              className="absolute rounded-md px-2 text-[11px] font-medium truncate text-left shadow-sm hover:brightness-95"
                            >
                              {s.guestName || "Sin nombre"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-sm text-stone-400 italic p-4">No hay alojamientos que coincidan con la búsqueda.</p>
            )}
          </div>
        </div>
      </div>

      {activeStay && (
        <Modal title={unitLabel(rooms.find((r) => r.id === activeStay.roomId) || {})} onClose={() => setActiveStay(null)}>
          <div className="text-sm text-stone-700 space-y-1.5">
            <div><strong>Huésped:</strong> {activeStay.guestName || "Sin nombre"}</div>
            <div><strong>Fechas:</strong> {activeStay.checkIn} → {activeStay.checkOut}</div>
            <div><strong>Personas:</strong> {activeStay.numGuests}</div>
            <div><strong>Régimen:</strong> {activeStay.mealPlan}</div>
            <div><strong>Estado:</strong> <Badge tone={stayTone(activeStay)}>{stayTiming(activeStay)}</Badge></div>
          </div>
          <p className="text-xs text-stone-400 mt-3">Para editar esta reserva, ve a "Huéspedes y Alojamientos".</p>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Ayudantes para las estadísticas del panel de Administrador               */
/* ---------------------------------------------------------------------- */

const CHART_GOLD = "#ab9574";
const CHART_GOLD_DARK = "#806c4d";
const CHART_GREEN = "#16a34a";
const CHART_BLUE = "#0369a1";
const CHART_ROSE = "#e11d48";
const CHART_AMBER = "#d97706";
const CHART_PURPLE = "#7c3aed";

function monthKeyOf(dateStr) { return dateStr.slice(0, 7); }
function monthLabelOf(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}
function lastNMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
function occupancyByMonth(stays, months) {
  return months.map((mKey) => {
    const [y, m] = mKey.split("-").map(Number);
    const monthStart = `${mKey}-01`;
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthEnd = `${mKey}-${String(daysInMonth).padStart(2, "0")}`;
    let occupiedNights = 0;
    stays.forEach((s) => {
      if (s.status === "Cancelada") return;
      if (!rangesOverlap(s.checkIn, s.checkOut, monthStart, monthEnd)) return;
      const start = s.checkIn < monthStart ? monthStart : s.checkIn;
      const end = s.checkOut > monthEnd ? monthEnd : s.checkOut;
      occupiedNights += daysBetween(start, end) + 1;
    });
    const pct = Math.round((occupiedNights / (daysInMonth * UNIDADES.length)) * 100);
    return { month: monthLabelOf(mKey), ocupacion: Math.max(0, Math.min(100, pct)) };
  });
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-3">
      <Icon size={16} className="text-stone-400 mb-1.5" />
      <div className="text-xl font-semibold text-stone-800">{value}</div>
      <div className="text-[11px] text-stone-500">{label}</div>
    </div>
  );
}

function ChartCard({ title, height = 220, children }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4">
      <h4 className="text-sm font-semibold text-stone-700 mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Estadísticas — Hospedaje                                                 */
/* ---------------------------------------------------------------------- */

function OccupancyStats({ rooms, stays }) {
  const months = lastNMonths(6);
  const occData = occupancyByMonth(stays, months);
  const roomTypeById = Object.fromEntries(rooms.map((r) => [r.id, r.type]));

  const typeCounts = {};
  CATEGORIAS.forEach((c) => (typeCounts[c.type] = 0));
  stays.forEach((s) => {
    if (s.status === "Cancelada") return;
    const t = roomTypeById[s.roomId];
    if (t !== undefined && typeCounts[t] !== undefined) typeCounts[t]++;
  });
  const typeData = CATEGORIAS.map((c) => ({ tipo: c.type, reservas: typeCounts[c.type], color: c.color }));

  const validStays = stays.filter((s) => s.status !== "Cancelada");
  const avgNights = validStays.length
    ? (validStays.reduce((sum, s) => sum + (daysBetween(s.checkIn, s.checkOut) + 1), 0) / validStays.length).toFixed(1)
    : "0";
  const avgGuests = validStays.length
    ? (validStays.reduce((sum, s) => sum + (Number(s.numGuests) || 0), 0) / validStays.length).toFixed(1)
    : "0";
  const currentMonthOcc = occData[occData.length - 1]?.ocupacion ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={BarChart3} label="Ocupación este mes" value={`${currentMonthOcc}%`} />
        <StatTile icon={Timer} label="Estancia media" value={`${avgNights} noches`} />
        <StatTile icon={Users} label="Huéspedes por reserva" value={avgGuests} />
        <StatTile icon={BedDouble} label="Reservas totales" value={validStays.length} />
      </div>

      <ChartCard title="Ocupación mensual (% de unidades ocupadas, últimos 6 meses)">
        <LineChart data={occData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Line type="monotone" dataKey="ocupacion" stroke={CHART_GOLD_DARK} strokeWidth={2} dot={{ r: 3 }} name="Ocupación" />
        </LineChart>
      </ChartCard>

      <ChartCard title="Reservas por tipo de alojamiento">
        <BarChart data={typeData} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="tipo" tick={{ fontSize: 11 }} width={90} />
          <Tooltip />
          <Bar dataKey="reservas" radius={[0, 4, 4, 0]}>
            {typeData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Estadísticas — Restaurante                                               */
/* ---------------------------------------------------------------------- */

function RestaurantStats({ bookings }) {
  const months = lastNMonths(6);
  const monthlyData = months.map((mKey) => ({
    month: monthLabelOf(mKey),
    reservas: bookings.filter((b) => b.date && b.date.startsWith(mKey)).length,
  }));

  const shiftCounts = { Desayuno: 0, Almuerzo: 0, Cena: 0 };
  bookings.forEach((b) => { if (shiftCounts[b.timeSlot] !== undefined) shiftCounts[b.timeSlot]++; });
  const shiftData = SHIFTS.map((s) => ({ turno: s.label, reservas: shiftCounts[s.key] }));

  const hotelCount = bookings.filter((b) => b.clientType === "Huésped del Resort").length;
  const externalCount = bookings.length - hotelCount;
  const clientData = [
    { name: "Huéspedes del resort", value: hotelCount },
    { name: "Clientes externos", value: externalCount },
  ];

  const avgPeople = bookings.length
    ? (bookings.reduce((sum, b) => sum + (Number(b.numPeople) || 0), 0) / bookings.length).toFixed(1)
    : "0";
  const topShift = shiftData.slice().sort((a, b) => b.reservas - a.reservas)[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={UtensilsCrossed} label="Reservas totales" value={bookings.length} />
        <StatTile icon={Users} label="Personas por reserva" value={avgPeople} />
        <StatTile icon={TrendingUp} label="Reservas este mes" value={monthlyData[monthlyData.length - 1]?.reservas ?? 0} />
        <StatTile icon={Award} label="Turno más pedido" value={topShift && topShift.reservas > 0 ? topShift.turno : "—"} />
      </div>

      <ChartCard title="Reservas de restaurante por mes">
        <BarChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="reservas" fill={CHART_GOLD_DARK} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartCard title="Por turno" height={200}>
          <BarChart data={shiftData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="turno" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="reservas" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Huéspedes vs. clientes externos" height={200}>
          <PieChart>
            <Pie data={clientData} dataKey="value" nameKey="name" outerRadius={70} label>
              <Cell fill={CHART_GREEN} />
              <Cell fill={CHART_ROSE} />
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Estadísticas — Limpieza                                                  */
/* ---------------------------------------------------------------------- */

function HousekeepingStats({ rooms, auditLog }) {
  const statusCounts = {};
  CLEAN_STATUSES.forEach((s) => (statusCounts[s] = 0));
  rooms.forEach((r) => { statusCounts[r.cleaningStatus] = (statusCounts[r.cleaningStatus] || 0) + 1; });
  const statusData = CLEAN_STATUSES.map((s) => ({ estado: s, unidades: statusCounts[s] }));
  const statusFill = { Limpia: CHART_GREEN, Sucia: CHART_ROSE, "En Progreso": CHART_AMBER, "Inspección Necesaria": CHART_PURPLE };

  const hkLog = auditLog.filter((l) => l.module === "Limpieza / Alojamientos");
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i - 13));
  const activityData = days.map((d) => ({
    day: d.slice(5),
    acciones: hkLog.filter((l) => (l.created_at || "").slice(0, 10) === d).length,
  }));

  const byEmployee = {};
  hkLog.forEach((l) => { byEmployee[l.user_email] = (byEmployee[l.user_email] || 0) + 1; });
  const topEmployees = Object.entries(byEmployee)
    .map(([email, count]) => ({ email, acciones: count }))
    .sort((a, b) => b.acciones - a.acciones)
    .slice(0, 5);

  const cleanPct = rooms.length ? Math.round((statusCounts["Limpia"] / rooms.length) * 100) : 0;
  const last14Total = activityData.reduce((sum, d) => sum + d.acciones, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={Sparkles} label="Unidades limpias ahora" value={`${cleanPct}%`} />
        <StatTile icon={AlertTriangle} label="Sucias / en progreso" value={statusCounts["Sucia"] + statusCounts["En Progreso"]} />
        <StatTile icon={Circle} label="Inspección necesaria" value={statusCounts["Inspección Necesaria"]} />
        <StatTile icon={TrendingUp} label="Acciones (14 días)" value={last14Total} />
      </div>

      <ChartCard title="Estado actual de las unidades" height={200}>
        <BarChart data={statusData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="estado" tick={{ fontSize: 9 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="unidades" radius={[4, 4, 0, 0]}>
            {statusData.map((d, i) => <Cell key={i} fill={statusFill[d.estado]} />)}
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard title="Actividad de limpieza — últimos 14 días" height={200}>
        <LineChart data={activityData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="acciones" stroke={CHART_GOLD_DARK} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ChartCard>

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h4 className="text-sm font-semibold text-stone-700 mb-3">Quién más actualizó limpieza</h4>
        {topEmployees.length === 0 ? (
          <p className="text-sm text-stone-400 italic">Todavía no hay suficiente actividad registrada.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, topEmployees.length * 40)}>
            <BarChart data={topEmployees} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="email" tick={{ fontSize: 10 }} width={140} />
              <Tooltip />
              <Bar dataKey="acciones" fill={CHART_GOLD} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Estadísticas — Mantenimiento                                             */
/* ---------------------------------------------------------------------- */

function MaintenanceStats({ tickets }) {
  const statusCounts = {};
  TICKET_STATUSES.forEach((s) => (statusCounts[s] = 0));
  tickets.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });
  const statusData = TICKET_STATUSES.map((s) => ({ estado: s, tickets: statusCounts[s] }));
  const statusFill = { Pendiente: CHART_AMBER, "En Progreso": CHART_BLUE, Resuelto: CHART_GREEN };

  const priorityCounts = {};
  PRIORITIES.forEach((p) => (priorityCounts[p] = 0));
  tickets.forEach((t) => { priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1; });
  const priorityData = PRIORITIES.map((p) => ({ prioridad: p, tickets: priorityCounts[p] }));
  const priorityFill = { Baja: CHART_GREEN, Media: CHART_AMBER, Alta: CHART_ROSE };

  const resolved = tickets.filter((t) => t.status === "Resuelto" && t.resolvedAt);
  const avgResolutionHours = resolved.length
    ? (resolved.reduce((sum, t) => sum + (new Date(t.resolvedAt) - new Date(t.timestamp)) / 3600000, 0) / resolved.length).toFixed(1)
    : null;

  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i - 13));
  const createdData = days.map((d) => ({
    day: d.slice(5),
    tickets: tickets.filter((t) => (t.timestamp || "").slice(0, 10) === d).length,
  }));

  const byLocation = {};
  tickets.forEach((t) => { byLocation[t.location] = (byLocation[t.location] || 0) + 1; });
  const topLocations = Object.entries(byLocation)
    .map(([location, count]) => ({ location, tickets: count }))
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, 5);

  const openCount = statusCounts["Pendiente"] + statusCounts["En Progreso"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={Wrench} label="Tickets abiertos" value={openCount} />
        <StatTile icon={CheckCircle2} label="Resueltos" value={statusCounts["Resuelto"]} />
        <StatTile icon={Timer} label="Tiempo medio de resolución" value={avgResolutionHours !== null ? `${avgResolutionHours} h` : "—"} />
        <StatTile icon={AlertTriangle} label="Prioridad alta abiertos" value={tickets.filter((t) => t.priority === "Alta" && t.status !== "Resuelto").length} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartCard title="Por estado" height={200}>
          <PieChart>
            <Pie data={statusData} dataKey="tickets" nameKey="estado" outerRadius={70} label>
              {statusData.map((d, i) => <Cell key={i} fill={statusFill[d.estado]} />)}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>
        <ChartCard title="Por prioridad" height={200}>
          <BarChart data={priorityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="prioridad" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="tickets" radius={[4, 4, 0, 0]}>
              {priorityData.map((d, i) => <Cell key={i} fill={priorityFill[d.prioridad]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      <ChartCard title="Tickets creados — últimos 14 días" height={200}>
        <LineChart data={createdData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="tickets" stroke={CHART_ROSE} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ChartCard>

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h4 className="text-sm font-semibold text-stone-700 mb-3">Zonas con más incidencias</h4>
        {topLocations.length === 0 ? (
          <p className="text-sm text-stone-400 italic">Todavía no hay tickets registrados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, topLocations.length * 40)}>
            <BarChart data={topLocations} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="location" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="tickets" fill={CHART_GOLD_DARK} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Contraseña extra para proteger la descarga de la copia de seguridad      */
/* ---------------------------------------------------------------------- */

// Nota: esto es una barrera adicional de fricción, no una medida criptográfica
// fuerte — vive en el código que llega al navegador. Protege bien de un clic
// accidental o de un dispositivo compartido; no de alguien con conocimientos
// técnicos que inspeccione el código fuente.
const BACKUP_DOWNLOAD_PASSWORD = "22Deabril22!";

function BackupPasswordModal({ onClose, onConfirmed }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (value === BACKUP_DOWNLOAD_PASSWORD) onConfirmed();
    else setError("Contraseña incorrecta.");
  };

  return (
    <Modal title="Confirma la contraseña de seguridad" onClose={onClose}>
      <Field label="Contraseña">
        <input
          type="password"
          className={inputCls}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
      </Field>
      {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
      <button onClick={submit} className={`w-full py-2.5 ${primaryBtn}`}>Confirmar y descargar</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Personal — directorio y restablecimiento de contraseña                   */
/* ---------------------------------------------------------------------- */

function StaffPanel({ adminEmail }) {
  const [staff, setStaff] = useState(null);
  const [staffError, setStaffError] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [resetTarget, setResetTarget] = useState(null); // {id, email} | null

  const load = useCallback(() => {
    fetchStaffDirectory().then((res) => { setStaff(res.items); setStaffError(res.error); });
    fetchDailyLogins(todayStr()).then((res) => setAttendance(res.items));
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const attendanceByEmail = Object.fromEntries((attendance || []).map((a) => [a.user_email, a]));
  const presentCount = staff ? staff.filter((s) => attendanceByEmail[s.email]).length : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-stone-700">Asistencia de hoy</h3>
          <span className="text-xs text-stone-400">{new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <p className="text-xs text-stone-500 mb-1">
          {staff ? `${presentCount} de ${staff.length} personas ya abrieron la app hoy` : "Cargando…"}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-stone-700">Personal</h3>
          <button onClick={load} className="text-xs text-[#6d5c42] font-medium flex items-center gap-1">
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
        {staff === null ? (
          <p className="text-sm text-stone-400 italic">Cargando…</p>
        ) : staffError ? (
          <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
            <p className="font-medium mb-1">No se pudo cargar el personal.</p>
            <p className="font-mono break-all">{staffError}</p>
            <p className="mt-2 text-rose-600">Comprueba que ejecutaste <code>supabase-TODO-EN-UNO.sql</code> completo en el SQL Editor de Supabase.</p>
          </div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-stone-400 italic">Todavía no hay ninguna cuenta con un rol asignado en la tabla "profiles".</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">Email</th>
                  <th className="py-1.5 pr-3 font-medium">Rol</th>
                  <th className="py-1.5 pr-3 font-medium">Hoy</th>
                  <th className="py-1.5 pr-3 font-medium">Contraseña</th>
                  <th className="py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const seen = attendanceByEmail[s.email];
                  return (
                    <tr key={s.id} className="border-b border-stone-50">
                      <td className="py-1.5 pr-3 text-stone-700">{s.email}</td>
                      <td className="py-1.5 pr-3"><Badge tone="slate">{ROLES[s.role]?.label || s.role}</Badge></td>
                      <td className="py-1.5 pr-3">
                        {seen ? (
                          <Badge tone="green">Entró {new Date(seen.first_seen_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</Badge>
                        ) : (
                          <Badge tone="red">Todavía no</Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        {s.must_change_password ? <Badge tone="yellow">Pendiente de crear</Badge> : <Badge tone="green">Personalizada</Badge>}
                      </td>
                      <td className="py-1.5">
                        <button onClick={() => setResetTarget({ id: s.id, email: s.email })} className="text-[#6d5c42] font-medium">
                          Restablecer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {resetTarget && (
        <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} onDone={load} />
      )}
      </div>
    </div>
  );
}

function ResetPasswordModal({ target, onClose, onDone }) {
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (newPassword.length < 8) { setError("Mínimo 8 caracteres."); return; }
    setLoading(true);
    try {
      await adminResetPassword(target.id, newPassword);
      setDone(true);
      onDone();
    } catch (e) {
      setError(e.message || "Error al restablecer la contraseña");
    }
    setLoading(false);
  };

  return (
    <Modal title={`Restablecer contraseña — ${target.email}`} onClose={onClose}>
      {done ? (
        <div>
          <p className="text-sm text-stone-600 mb-2">Contraseña actualizada. Comunícasela a la persona por un canal seguro (no por email, ya que el envío de correos no está configurado).</p>
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm font-mono mb-3">{newPassword}</div>
          <p className="text-xs text-stone-400 mb-4">Se le pedirá crear su propia contraseña en cuanto inicie sesión con esta.</p>
          <button onClick={onClose} className={`w-full py-2.5 ${primaryBtn}`}>Cerrar</button>
        </div>
      ) : (
        <div>
          <Field label="Nueva contraseña temporal">
            <input className={inputCls} type="text" maxLength={60} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
          </Field>
          {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
          <button onClick={submit} disabled={loading} className={`w-full py-2.5 ${primaryBtn} disabled:opacity-60`}>
            {loading ? "Restableciendo…" : "Restablecer contraseña"}
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Finanzas — ingresos, gastos y sostenibilidad económica                   */
/* ---------------------------------------------------------------------- */

const EXPENSE_CATEGORIES = [
  "Mercadería / Insumos", "Personal extra", "Mantenimiento y reparaciones",
  "Suministros (luz, agua, gas)", "Marketing", "Otros",
];

// Suma lo cobrado antes + al finalizar, para reservas de hospedaje o restaurante
function paidTotal(record) {
  return (Number(record.amountPaidBefore) || 0) + (Number(record.amountPaidAfter) || 0);
}

function FinanceModule({ stays, bookings, expenses, persistExpenses, email }) {
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [rangeMonths, setRangeMonths] = useState(6);

  const months = lastNMonths(rangeMonths);
  const totalUnits = UNIDADES.length;

  const incomeByMonth = months.map((mKey) => {
    const [y, m] = mKey.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const monthStays = stays.filter((s) => s.status !== "Cancelada" && s.checkIn && s.checkIn.startsWith(mKey));
    const stayIncome = monthStays.reduce((sum, s) => sum + paidTotal(s), 0);
    const nightsSold = monthStays.reduce((sum, s) => sum + (daysBetween(s.checkIn, s.checkOut) + 1), 0);

    const restaurantIncome = bookings
      .filter((b) => b.date && b.date.startsWith(mKey))
      .reduce((sum, b) => sum + paidTotal(b), 0);

    const expenseTotal = expenses
      .filter((e) => e.date && e.date.startsWith(mKey))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const income = stayIncome + restaurantIncome;
    const adr = nightsSold > 0 ? stayIncome / nightsSold : 0;
    const revpar = stayIncome / (daysInMonth * totalUnits);
    const expenseRatio = income > 0 ? (expenseTotal / income) * 100 : 0;

    return {
      month: monthLabelOf(mKey),
      Hospedaje: Math.round(stayIncome * 100) / 100,
      Restaurante: Math.round(restaurantIncome * 100) / 100,
      Gastos: Math.round(expenseTotal * 100) / 100,
      Neto: Math.round((income - expenseTotal) * 100) / 100,
      ADR: Math.round(adr * 100) / 100,
      RevPAR: Math.round(revpar * 100) / 100,
      RatioGastos: Math.round(expenseRatio * 10) / 10,
    };
  });

  const thisMonth = incomeByMonth[incomeByMonth.length - 1];

  const totalStayIncome = stays.filter((s) => s.status !== "Cancelada").reduce((sum, s) => sum + paidTotal(s), 0);
  const totalRestaurantIncome = bookings.reduce((sum, b) => sum + paidTotal(b), 0);
  const totalIncome = totalStayIncome + totalRestaurantIncome;
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netTotal = totalIncome - totalExpenses;
  const grossMargin = totalIncome > 0 ? (netTotal / totalIncome) * 100 : 0;

  const stayCount = stays.filter((s) => s.status !== "Cancelada").length;
  const avgStayValue = stayCount > 0 ? totalStayIncome / stayCount : 0;
  const avgBookingValue = bookings.length > 0 ? totalRestaurantIncome / bookings.length : 0;

  const revenueMixData = [
    { name: "Hospedaje", value: Math.round(totalStayIncome * 100) / 100 },
    { name: "Restaurante", value: Math.round(totalRestaurantIncome * 100) / 100 },
  ];

  const expenseByCategory = {};
  EXPENSE_CATEGORIES.forEach((c) => (expenseByCategory[c] = 0));
  expenses.forEach((e) => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (Number(e.amount) || 0); });
  const expenseCategoryData = EXPENSE_CATEGORIES.map((c) => ({ categoria: c, gasto: Math.round(expenseByCategory[c] * 100) / 100 })).filter((d) => d.gasto > 0);

  const addExpense = async (expense) => {
    await persistExpenses([{ ...expense, id: uid(), registeredBy: email }, ...expenses]);
    setShowExpenseForm(false);
  };
  const removeExpense = async (id) => { await persistExpenses(expenses.filter((e) => e.id !== id)); };

  const recentExpenses = [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-stone-700">Sostenibilidad económica del complejo</h3>
        <select value={rangeMonths} onChange={(e) => setRangeMonths(Number(e.target.value))} className={inputCls + " w-auto"}>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </select>
      </div>

      {/* KPIs generales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={TrendingUp} label="Ingresos este mes" value={`${((thisMonth?.Hospedaje || 0) + (thisMonth?.Restaurante || 0)).toFixed(2)} €`} />
        <StatTile icon={BarChart3} label="Gastos este mes" value={`${(thisMonth?.Gastos || 0).toFixed(2)} €`} />
        <StatTile icon={Award} label="Balance neto (histórico)" value={`${netTotal.toFixed(2)} €`} />
        <StatTile icon={Timer} label="Margen bruto (histórico)" value={`${grossMargin.toFixed(1)} %`} />
      </div>

      {/* KPIs hoteleros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={BedDouble} label="ADR — tarifa media/noche" value={`${(thisMonth?.ADR || 0).toFixed(2)} €`} />
        <StatTile icon={BarChart3} label="RevPAR — ingreso por unidad disponible" value={`${(thisMonth?.RevPAR || 0).toFixed(2)} €`} />
        <StatTile icon={UtensilsCrossed} label="Ratio gastos/ingresos (este mes)" value={`${(thisMonth?.RatioGastos || 0).toFixed(1)} %`} />
        <StatTile icon={Users} label="Ingreso medio por reserva" value={`${avgStayValue.toFixed(2)} € / ${avgBookingValue.toFixed(2)} €`} />
      </div>
      <p className="text-[11px] text-stone-400 -mt-2">
        ADR = ingresos de hospedaje ÷ noches vendidas · RevPAR = ingresos de hospedaje ÷ (unidades totales × días del mes) · Ingreso medio: hospedaje / restaurante
      </p>

      <ChartCard title={`Ingresos, gastos y balance neto — últimos ${rangeMonths} meses`} height={240}>
        <BarChart data={incomeByMonth}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => `${v} €`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Hospedaje" stackId="ingresos" fill={CHART_GREEN} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Restaurante" stackId="ingresos" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="Neto" stroke={CHART_GOLD_DARK} strokeWidth={2} dot={{ r: 3 }} />
        </BarChart>
      </ChartCard>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartCard title="Mix de ingresos: Hospedaje vs. Restaurante" height={210}>
          <PieChart>
            <Pie data={revenueMixData} dataKey="value" nameKey="name" outerRadius={70} label={(d) => `${d.name}: ${((d.value / (totalIncome || 1)) * 100).toFixed(0)}%`}>
              <Cell fill={CHART_GREEN} />
              <Cell fill={CHART_BLUE} />
            </Pie>
            <Tooltip formatter={(v) => `${v} €`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>

        <ChartCard title="Ratio gastos/ingresos por mes (%)" height={210}>
          <LineChart data={incomeByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v) => `${v} %`} />
            <Line type="monotone" dataKey="RatioGastos" stroke={CHART_ROSE} strokeWidth={2} dot={{ r: 3 }} name="Gastos / Ingresos" />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard title="Evolución de ADR y RevPAR" height={220}>
        <LineChart data={incomeByMonth}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="€" />
          <Tooltip formatter={(v) => `${v} €`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="ADR" stroke={CHART_GOLD_DARK} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="RevPAR" stroke={CHART_BLUE} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>

      {expenseCategoryData.length > 0 && (
        <ChartCard title="Gastos por categoría (histórico)" height={200}>
          <BarChart data={expenseCategoryData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="categoria" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v) => `${v} €`} />
            <Bar dataKey="gasto" fill={CHART_ROSE} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
      )}

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-stone-700">Gastos registrados (mercadería, personal extra, etc.)</h4>
          <button onClick={() => setShowExpenseForm(true)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 ${primaryBtn}`}>
            <Plus size={13} /> Nuevo gasto
          </button>
        </div>
        {recentExpenses.length === 0 ? (
          <p className="text-sm text-stone-400 italic">Todavía no hay gastos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">Fecha</th>
                  <th className="py-1.5 pr-3 font-medium">Categoría</th>
                  <th className="py-1.5 pr-3 font-medium">Descripción</th>
                  <th className="py-1.5 pr-3 font-medium">Importe</th>
                  <th className="py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {recentExpenses.map((e) => (
                  <tr key={e.id} className="border-b border-stone-50">
                    <td className="py-1.5 pr-3 text-stone-400 whitespace-nowrap">{e.date}</td>
                    <td className="py-1.5 pr-3"><Badge tone="slate">{e.category}</Badge></td>
                    <td className="py-1.5 pr-3 text-stone-600">{e.description}</td>
                    <td className="py-1.5 pr-3 text-stone-800 font-medium whitespace-nowrap">{Number(e.amount).toFixed(2)} €</td>
                    <td className="py-1.5"><button onClick={() => removeExpense(e.id)} className="text-rose-600 font-medium">Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showExpenseForm && <ExpenseModal onClose={() => setShowExpenseForm(false)} onSave={addExpense} />}
    </div>
  );
}

function ExpenseModal({ onClose, onSave }) {
  const [form, setForm] = useState({ date: todayStr(), category: EXPENSE_CATEGORIES[0], description: "", amount: 0 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title="Nuevo gasto" onClose={onClose}>
      <Field label="Fecha">
        <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
      </Field>
      <Field label="Categoría">
        <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Descripción">
        <input className={inputCls} maxLength={200} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="p. ej. Compra de vino, refuerzo de camareros boda García" />
      </Field>
      <MoneyField label="Importe" value={form.amount} onChange={(v) => set("amount", v)} />
      <button onClick={() => form.description && form.amount > 0 && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Guardar gasto</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Administrador — auditoría, apertura/cierre del hotel y estadísticas      */
/* ---------------------------------------------------------------------- */

const ADMIN_SUBTABS = [
  { key: "resumen", label: "admintab_resumen" },
  { key: "personal", label: "admintab_personal" },
  { key: "finanzas", label: "admintab_finanzas" },
  { key: "hospedaje", label: "admintab_hospedaje" },
  { key: "restaurante", label: "admintab_restaurante" },
  { key: "limpieza", label: "admintab_limpieza" },
  { key: "mantenimiento", label: "admintab_mantenimiento" },
  { key: "actividad", label: "admintab_actividad" },
];

function AdminModule({ rooms, stays, bookings, tickets, expenses, persistExpenses, persistStays, hotelStatus, persistHotelStatus, email }) {
  const { t } = useTranslation();
  const [log, setLog] = useState(null);
  const [confirming, setConfirming] = useState(null); // "close" | "open" | null
  const [subtab, setSubtab] = useState("resumen");
  const [backupState, setBackupState] = useState("idle"); // idle | working | done | error
  const [showBackupAuth, setShowBackupAuth] = useState(false);

  const loadLog = useCallback(() => {
    fetchAuditLog(200).then(setLog);
  }, []);

  useEffect(() => {
    loadLog();
    const iv = setInterval(loadLog, 5000);
    return () => clearInterval(iv);
  }, [loadLog]);

  const downloadBackup = async () => {
    setBackupState("working");
    try {
      const backup = await fetchFullBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `masboronat-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupState("done");
      logAction({ email, role: "admin", module: "Sistema", action: "Descargó una copia de seguridad" });
    } catch (e) {
      console.error(e);
      setBackupState("error");
    }
  };

  const activeStaysCount = stays.filter((s) => s.status !== "Cancelada" && stayTiming(s) !== "Finalizada").length;

  const closeHotel = async () => {
    const cancelled = stays.map((s) =>
      s.status !== "Cancelada" && stayTiming(s) !== "Finalizada" ? { ...s, status: "Cancelada" } : s
    );
    await persistStays(cancelled);
    await persistHotelStatus({ closed: true, closedAt: new Date().toISOString(), closedBy: email }, "Cerró el hotel (canceló todas las reservas activas/futuras)");
    setConfirming(null);
  };

  const openHotel = async () => {
    await persistHotelStatus({ closed: false, reopenedAt: new Date().toISOString(), reopenedBy: email }, "Reabrió el hotel");
    setConfirming(null);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-stone-800 mb-1">{t("admin_panel_title")}</h2>
      <p className="text-xs text-stone-400 mb-4">{t("admin_panel_subtitle")}</p>

      <div className="flex gap-1 mb-4 overflow-x-auto border-b border-stone-200">
        {ADMIN_SUBTABS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSubtab(s.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              subtab === s.key ? "border-[#ab9574] text-[#6d5c42]" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {t(s.label)}
          </button>
        ))}
      </div>

      {subtab === "resumen" && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
          <h3 className="font-semibold text-stone-700 mb-3">{t("hotel_status_title")}</h3>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Badge tone={hotelStatus.closed ? "red" : "green"}>{hotelStatus.closed ? t("hotel_closed") : t("hotel_open")}</Badge>
              {hotelStatus.closed && hotelStatus.closedAt && (
                <p className="text-xs text-stone-400 mt-1">Cerrado el {new Date(hotelStatus.closedAt).toLocaleString()} por {hotelStatus.closedBy}</p>
              )}
              {!hotelStatus.closed && hotelStatus.reopenedAt && (
                <p className="text-xs text-stone-400 mt-1">Reabierto el {new Date(hotelStatus.reopenedAt).toLocaleString()} por {hotelStatus.reopenedBy}</p>
              )}
            </div>
            <div className="flex gap-2">
              {!hotelStatus.closed ? (
                <button onClick={() => setConfirming("close")} className="text-xs font-medium px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white">
                  {t("close_hotel_btn")}
                </button>
              ) : (
                <button onClick={() => setConfirming("open")} className={`text-xs font-medium px-3 py-2 rounded-lg ${primaryBtn}`}>
                  {t("open_hotel_btn")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {subtab === "resumen" && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
          <h3 className="font-semibold text-stone-700 mb-2">{t("backup_title")}</h3>
          <p className="text-xs text-stone-500 mb-3">
            {t("backup_desc")}
          </p>
          <button
            onClick={() => setShowBackupAuth(true)}
            disabled={backupState === "working"}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${primaryBtn} disabled:opacity-60`}
          >
            {backupState === "working" ? "Preparando…" : t("backup_button")}
          </button>
          {backupState === "done" && <span className="ml-2 text-xs text-emerald-700">Descargada ✓</span>}
          {backupState === "error" && <span className="ml-2 text-xs text-rose-600">Hubo un error, inténtalo de nuevo</span>}
          {showBackupAuth && (
            <BackupPasswordModal
              onClose={() => setShowBackupAuth(false)}
              onConfirmed={() => { setShowBackupAuth(false); downloadBackup(); }}
            />
          )}
        </div>
      )}

      {subtab === "personal" && <StaffPanel adminEmail={email} />}
      {subtab === "finanzas" && <FinanceModule stays={stays} bookings={bookings} expenses={expenses} persistExpenses={persistExpenses} email={email} />}

      {subtab === "hospedaje" && <OccupancyStats rooms={rooms} stays={stays} />}
      {subtab === "restaurante" && <RestaurantStats bookings={bookings} />}
      {subtab === "limpieza" && <HousekeepingStats rooms={rooms} auditLog={log || []} />}
      {subtab === "mantenimiento" && <MaintenanceStats tickets={tickets} />}

      {subtab === "actividad" && (
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h3 className="font-semibold text-stone-700 mb-3">Registro de actividad</h3>
        {log === null ? (
          <p className="text-sm text-stone-400 italic">Cargando…</p>
        ) : log.length === 0 ? (
          <p className="text-sm text-stone-400 italic">Todavía no hay actividad registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">Fecha</th>
                  <th className="py-1.5 pr-3 font-medium">Empleado</th>
                  <th className="py-1.5 pr-3 font-medium">Rol</th>
                  <th className="py-1.5 pr-3 font-medium">Módulo</th>
                  <th className="py-1.5 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr key={row.id} className="border-b border-stone-50">
                    <td className="py-1.5 pr-3 text-stone-400 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-stone-700">{row.user_email}</td>
                    <td className="py-1.5 pr-3"><Badge tone="slate">{ROLES[row.role]?.label || row.role || "—"}</Badge></td>
                    <td className="py-1.5 pr-3 text-stone-600">{row.module}</td>
                    <td className="py-1.5 text-stone-700">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {confirming === "close" && (
        <Modal title={t("close_hotel_btn")} onClose={() => setConfirming(null)}>
          <p className="text-sm text-stone-600 mb-3">
            Esto cancelará automáticamente las <strong>{activeStaysCount}</strong> reservas de alojamiento actuales o futuras que no estén ya canceladas, y bloqueará la creación de nuevas reservas de hospedaje y restaurante para el resto del personal hasta que vuelvas a abrir el hotel.
          </p>
          <p className="text-xs text-rose-600 mb-4">Esta acción no se puede deshacer automáticamente: si reabres después, esas reservas seguirán canceladas y habría que volver a crearlas si correspondiera.</p>
          <div className="flex gap-2">
            <button onClick={closeHotel} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white">Sí, cerrar el hotel</button>
            <button onClick={() => setConfirming(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-stone-300 text-stone-600">Cancelar</button>
          </div>
        </Modal>
      )}
      {confirming === "open" && (
        <Modal title={t("open_hotel_btn")} onClose={() => setConfirming(null)}>
          <p className="text-sm text-stone-600 mb-4">Esto permitirá de nuevo crear reservas de alojamiento y restaurante para todo el personal.</p>
          <div className="flex gap-2">
            <button onClick={openHotel} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${primaryBtn}`}>Sí, abrir el hotel</button>
            <button onClick={() => setConfirming(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-stone-300 text-stone-600">Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
