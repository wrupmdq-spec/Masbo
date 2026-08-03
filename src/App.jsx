import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, BedDouble, UtensilsCrossed, Sparkles, Wrench,
  Plus, X, RefreshCw, Users, Phone, StickyNote, Clock, ChevronDown,
  CheckCircle2, AlertTriangle, Circle, Search, CalendarDays, MapPin,
  CalendarRange, ChevronLeft, ChevronRight, ShieldAlert, Rows3, ChevronsLeft, ChevronsRight,
  BarChart3, TrendingUp, Timer, Award, Printer, CheckSquare
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  supabase, getProfile, logAction, fetchAuditLog, requestBackup, fetchStaffDirectory, adminResetPassword,
  recordDailyLogin, fetchDailyLogins,
  fetchRooms, syncRooms, fetchStays, syncStays, fetchBookings, syncBookings,
  fetchTickets, syncTickets, fetchEvents, syncEvents, fetchSalones, syncSalones,
  fetchExpenses, syncExpenses, fetchHotelStatus, saveHotelStatus,
  fetchGuests, resolveGuestId, saveGuestNotes, fetchGuestById, askAssistant,
} from "./supabaseClient";
import Login from "./Login";
import SetPassword from "./SetPassword";
import { useTranslation, LANGUAGES, LOCALE_MAP } from "./i18n.jsx";

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
  viewer: {
    label: "Espectador",
    // Ve las mismas pestañas operativas que Recepción, pero nunca el panel de Administrador
    // (ahí vive información sensible: finanzas, personal, contraseñas).
    tabs: ["dashboard", "guests", "restaurant", "housekeeping", "maintenance", "events", "planning", "planningGeneral"],
    edit: [], // no puede editar nada en ningún módulo
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
    processedCheckouts: [],
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

// Convierte las reservas de grupo (varias unidades, mismo huésped) en tarjetas de
// "evento" de solo lectura, para que aparezcan automáticamente en Eventos sin que
// nadie tenga que cargarlas dos veces a mano. Solo las actuales o futuras.
function groupStaysToPseudoEvents(stays) {
  const groups = {};
  stays.forEach((s) => {
    if (!s.groupId || s.status === "Cancelada") return;
    (groups[s.groupId] = groups[s.groupId] || []).push(s);
  });
  const today = todayStr();
  return Object.entries(groups)
    .map(([groupId, groupStays]) => {
      const checkIns = groupStays.map((s) => s.checkIn).sort();
      const checkOuts = groupStays.map((s) => s.checkOut).sort();
      return {
        id: "group-" + groupId,
        isGroupBooking: true,
        title: groupStays[0].guestName || "Grupo sin nombre",
        date: checkIns[0],
        endDate: checkOuts[checkOuts.length - 1],
        units: groupStays.map((s) => s.roomLabel).filter(Boolean),
        totalGuests: groupStays.reduce((sum, s) => sum + (Number(s.numGuests) || 0), 0),
      };
    })
    .filter((g) => g.endDate >= today);
}

// Recorta los datos de la app a un resumen compacto y relevante para el asistente
// (solo lo de hoy/mañana/próximos días — nunca todo el histórico).
function buildAssistantContext({ rooms, stays, bookings, tickets, events }) {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const weekAhead = addDays(today, 7);
  const activeStays = stays.filter((s) => s.status !== "Cancelada");
  return {
    fechaHoy: today,
    unidadesSuciasOInspeccion: rooms.filter((r) => r.cleaningStatus !== "Limpia").map((r) => `${unitLabel(r)} (${r.cleaningStatus})`),
    llegadasHoy: activeStays.filter((s) => s.checkIn === today).map((s) => ({ huesped: s.guestName, unidad: s.roomLabel, personas: s.numGuests })),
    salidasHoy: activeStays.filter((s) => s.checkOut === today).map((s) => ({ huesped: s.guestName, unidad: s.roomLabel })),
    llegadasManana: activeStays.filter((s) => s.checkIn === tomorrow).map((s) => ({ huesped: s.guestName, unidad: s.roomLabel, personas: s.numGuests })),
    reservasRestauranteHoy: bookings.filter((b) => b.date === today).map((b) => ({ hora: b.time, turno: b.timeSlot, huesped: b.guestName, personas: b.numPeople })),
    ticketsMantenimientoAbiertos: tickets.filter((t) => t.status !== "Resuelto").map((t) => ({ ubicacion: t.location, problema: t.issue, prioridad: t.priority, estado: t.status })),
    eventosProximos7Dias: events.filter((e) => e.date >= today && e.date <= weekAhead && e.status !== "Cancelado").map((e) => ({ titulo: e.title, fecha: e.date, espacio: e.space })),
  };
}

function AssistantWidget({ rooms, stays, bookings, tickets, events, onAction }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role, text, action }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const context = buildAssistantContext({ rooms, stays, bookings, tickets, events });
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.text }));
      const res = await askAssistant(text, context, history);
      setMessages((m) => [...m, { role: "assistant", text: res.reply, action: res.action }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Hubo un error al preguntar: " + e.message }]);
    }
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-[#806c4d] hover:bg-[#6d5c42] text-white shadow-lg flex items-center justify-center"
        title="Asistente virtual"
      >
        <Sparkles size={22} />
      </button>

      {open && (
        <div className="fixed bottom-24 right-4 z-40 w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
          <div className="bg-[#332b1f] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <span className="font-semibold text-sm flex items-center gap-1.5"><Sparkles size={14} /> Asistente Mas Boronat</span>
            <button onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && (
              <p className="text-stone-400 text-xs italic">
                Pregúntame cosas como "¿cuántas unidades están sucias?", "¿quién llega mañana?", o pídeme "crea un ticket: aire acondicionado roto en Flandes 3".
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 max-w-[88%] ${m.role === "user" ? "bg-[#ab9574]/20 ml-auto" : "bg-stone-100"}`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.action && (m.action.type === "create_ticket" || m.action.type === "create_booking") && (
                  <button
                    onClick={() => { onAction(m.action); setOpen(false); }}
                    className="mt-2 text-xs font-medium text-white bg-[#806c4d] hover:bg-[#6d5c42] rounded-lg px-2.5 py-1.5"
                  >
                    Abrir formulario prellenado →
                  </button>
                )}
              </div>
            ))}
            {loading && <div className="text-stone-400 text-xs italic">Pensando…</div>}
          </div>
          <div className="p-2 border-t border-stone-200 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Escribe tu pregunta…"
              className="flex-1 text-sm rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ab9574]"
            />
            <button onClick={send} disabled={loading} className={`px-3 py-2 text-sm ${primaryBtn} disabled:opacity-50`}>Enviar</button>
          </div>
        </div>
      )}
    </>
  );
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
  const [pendingAction, setPendingAction] = useState(null); // { type, fields } | null
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
        fetchRooms(), fetchStays(), fetchBookings(), fetchTickets(),
        fetchEvents(), fetchHotelStatus(), fetchSalones(), fetchExpenses(),
      ]);
      let finalRooms = r;
      let finalSalones = sal;
      // Red de seguridad: si por lo que sea las tablas están vacías la primera
      // vez (proyecto nuevo, o antes de ejecutar la migración de datos), las siembra.
      if (initial && r.length === 0) {
        finalRooms = seedRooms();
        await syncRooms([], finalRooms);
      }
      if (initial && sal.length === 0) {
        finalSalones = seedSalones();
        await syncSalones([], finalSalones);
      }
      setRooms(finalRooms);
      setStays(st);
      setBookings(b);
      setTickets(t);
      setEvents(ev);
      setHotelStatus(hs);
      setSalones(finalSalones);
      setExpenses(exp);
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

  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (!session || !profile) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      refreshAll(true);
    } else {
      refreshAll(false);
    }
    const iv = setInterval(() => refreshAll(false), 2500);
    const onVisible = () => { if (document.visibilityState === "visible") refreshAll(false); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // Ojo: dependemos del id de usuario y del rol (valores estables), NO del objeto
    // "session" completo — Supabase genera una referencia nueva de "session" cada vez
    // que renueva el token en segundo plano (por ejemplo al volver a la pestaña del
    // navegador), y eso NO debe disparar una recarga "desde cero".
  }, [refreshAll, session?.user?.id, profile?.role]);

  const role = profile?.role;
  const cfg = role ? ROLES[role] : null;

  useEffect(() => {
    if (cfg && !cfg.tabs.includes(tab)) setTab(cfg.tabs[0]);
  }, [cfg]); // eslint-disable-line

  const persistRooms = async (next, actionOverride) => {
    await syncRooms(rooms, next);
    setRooms(next);
    logAction({ email: session.user.email, role, module: "Limpieza / Alojamientos", action: actionOverride || "Actualizó el estado de una unidad" });
  };
  const persistStays = async (next, actionOverride) => {
    const action = actionOverride || summarizeChange(stays, next, "reserva de alojamiento");
    // Vincula cada estancia con su perfil de huésped (lo crea si es la primera vez que viene).
    // Importante: se resuelve UNA vez por nombre, en orden (no en paralelo), porque una
    // reserva de grupo puede traer varias estancias nuevas con el mismo huésped a la vez —
    // resolverlas todas en paralelo crearía un perfil duplicado por cada unidad.
    const resolvedByName = {};
    const withGuestIds = [];
    for (const s of next) {
      const prevStay = stays.find((p) => p.id === s.id);
      const nameChanged = prevStay && prevStay.guestName !== s.guestName;
      if ((s.guestId && !nameChanged) || !s.guestName) { withGuestIds.push(s); continue; }
      const key = s.guestName.trim().toLowerCase();
      if (!(key in resolvedByName)) {
        resolvedByName[key] = await resolveGuestId(s.guestName);
      }
      withGuestIds.push(resolvedByName[key] ? { ...s, guestId: resolvedByName[key] } : s);
    }
    await syncStays(stays, withGuestIds);
    setStays(withGuestIds);
    logAction({ email: session.user.email, role, module: "Hospedaje", action });
  };
  const persistBookings = async (next) => {
    const action = summarizeChange(bookings, next, "reserva de restaurante");
    await syncBookings(bookings, next);
    setBookings(next);
    logAction({ email: session.user.email, role, module: "Restaurante", action });
  };
  const persistTickets = async (next) => {
    const action = summarizeChange(tickets, next, "ticket de mantenimiento");
    await syncTickets(tickets, next);
    setTickets(next);
    logAction({ email: session.user.email, role, module: "Mantenimiento", action });
  };
  const persistEvents = async (next) => {
    const action = summarizeChange(events, next, "evento");
    await syncEvents(events, next);
    setEvents(next);
    logAction({ email: session.user.email, role, module: "Eventos", action });
  };
  const persistHotelStatus = async (next, action) => {
    await saveHotelStatus(next);
    setHotelStatus(next);
    logAction({ email: session.user.email, role, module: "Sistema", action });
  };
  const persistSalones = async (next, actionOverride) => {
    const changedIds = next
      .filter((n) => {
        const prev = salones.find((s) => s.id === n.id);
        return !prev || prev.cleaningStatus !== n.cleaningStatus || prev.cleaningNotes !== n.cleaningNotes;
      })
      .map((s) => s.id);
    const changedItems = next.filter((s) => changedIds.includes(s.id));
    const hasExterior = changedItems.some((s) => s.category === "Espacios Exteriores");
    const hasInterior = changedItems.some((s) => s.category === "Salones");
    const module = hasExterior && !hasInterior ? "Mantenimiento / Espacios Exteriores" : "Limpieza / Salones";
    const action = actionOverride || summarizeChange(salones, next, "salón/espacio");
    await syncSalones(salones, next);
    setSalones(next);
    logAction({ email: session.user.email, role, module, action });
  };
  const persistExpenses = async (next) => {
    const action = summarizeChange(expenses, next, "gasto");
    await syncExpenses(expenses, next);
    setExpenses(next);
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

  // Al pasar la fecha de salida de una estancia, marca la unidad como "Sucia"
  // automáticamente, para que Limpieza sepa que hay que revisarla sin que
  // Recepción tenga que acordarse de marcarlo a mano. No repite el aviso si
  // esa estancia ya se procesó antes (se guarda en processedCheckouts).
  useEffect(() => {
    if (!stays || !rooms) return;
    if (role !== "admin" && role !== "reception") return;
    const today = todayStr();
    let changedCount = 0;
    const updatedRooms = rooms.map((r) => {
      const finished = stays.filter(
        (s) => s.roomId === r.id && s.status !== "Cancelada" && s.checkOut < today && !(r.processedCheckouts || []).includes(s.id)
      );
      if (finished.length === 0) return r;
      changedCount++;
      return {
        ...r,
        cleaningStatus: "Sucia",
        processedCheckouts: [...(r.processedCheckouts || []), ...finished.map((s) => s.id)],
      };
    });
    if (changedCount === 0) return;
    persistRooms(updatedRooms, `Marcó automáticamente ${changedCount} unidad(es) como sucias tras el check-out`);
  }, [stays, rooms, role]); // eslint-disable-line

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
        {cfg.tabs.includes("dashboard") && (
          <div className={tab === "dashboard" ? "" : "hidden"}>
            <Dashboard rooms={rooms} stays={stays} bookings={bookings} tickets={tickets} events={events} setTab={setTab} />
          </div>
        )}
        {cfg.tabs.includes("guests") && (
          <div className={tab === "guests" ? "" : "hidden"}>
            <GuestsModule rooms={rooms} stays={stays} persistStays={persistStays} editable={canEdit("guests")} deletable={canDelete(role, "guests")} hotelClosed={hotelStatus.closed && role !== "admin"} />
          </div>
        )}
        {cfg.tabs.includes("restaurant") && (
          <div className={tab === "restaurant" ? "" : "hidden"}>
            <RestaurantModule
              stays={stays} bookings={bookings} persistBookings={persistBookings}
              editable={canEdit("restaurant")} deletable={canDelete(role, "restaurant")}
              hotelClosed={hotelStatus.closed && role !== "admin"}
              prefillBooking={pendingAction?.type === "create_booking" ? pendingAction.fields : null}
              onPrefillConsumed={() => setPendingAction(null)}
            />
          </div>
        )}
        {cfg.tabs.includes("housekeeping") && (
          <div className={tab === "housekeeping" ? "" : "hidden"}>
            <HousekeepingModule rooms={rooms} persistRooms={persistRooms} salones={salones} persistSalones={persistSalones} editable={canEdit("housekeeping")} />
          </div>
        )}
        {cfg.tabs.includes("maintenance") && (
          <div className={tab === "maintenance" ? "" : "hidden"}>
            <MaintenanceModule
              tickets={tickets} persistTickets={persistTickets} rooms={rooms} salones={salones} persistSalones={persistSalones}
              editable={canEdit("maintenance")} deletable={canDelete(role, "maintenance")}
              prefillTicket={pendingAction?.type === "create_ticket" ? pendingAction.fields : null}
              onPrefillConsumed={() => setPendingAction(null)}
            />
          </div>
        )}
        {cfg.tabs.includes("events") && (
          <div className={tab === "events" ? "" : "hidden"}>
            <EventsModule events={events} persistEvents={persistEvents} stays={stays} editable={canEdit("events")} deletable={canDelete(role, "events")} />
          </div>
        )}
        {cfg.tabs.includes("planning") && (
          <div className={tab === "planning" ? "" : "hidden"}>
            <PlanningModule stays={stays} bookings={bookings} events={events} />
          </div>
        )}
        {cfg.tabs.includes("planningGeneral") && (
          <div className={tab === "planningGeneral" ? "" : "hidden"}>
            <PlanningGeneralModule rooms={rooms} stays={stays} persistStays={persistStays} editable={role === "admin" || role === "reception"} />
          </div>
        )}
        {role === "admin" && (
          <div className={tab === "admin" ? "" : "hidden"}>
            <AdminModule rooms={rooms} stays={stays} bookings={bookings} tickets={tickets} salones={salones} expenses={expenses} persistExpenses={persistExpenses} persistStays={persistStays} hotelStatus={hotelStatus} persistHotelStatus={persistHotelStatus} email={session.user.email} />
          </div>
        )}
      </main>

      {(role === "admin" || role === "reception") && (
        <AssistantWidget
          rooms={rooms} stays={stays} bookings={bookings} tickets={tickets} events={events}
          onAction={(action) => {
            setPendingAction(action);
            if (action.type === "create_ticket") setTab("maintenance");
            if (action.type === "create_booking") setTab("restaurant");
          }}
        />
      )}
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
          {(() => {
            const upcoming = [...events.filter((e) => e.date >= today && e.status !== "Cancelado"), ...groupStaysToPseudoEvents(stays)]
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 6);
            return upcoming.length === 0 ? (
              <p className="text-sm text-stone-400">{t("dash_no_upcoming")}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((e) => (
                  <li key={e.id} className="text-sm flex items-center justify-between">
                    <span className="text-stone-700">{e.title} · {e.date}</span>
                    <Badge tone={e.isGroupBooking ? "purple" : "slate"}>{e.isGroupBooking ? "Grupo" : e.space}</Badge>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Huéspedes / Alojamientos — reservas múltiples por unidad                 */
/* ---------------------------------------------------------------------- */

function GuestsModule({ rooms, stays, persistStays, editable, deletable, hotelClosed }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Activas");
  const [groupFilter, setGroupFilter] = useState("Todas");
  const [sortBy, setSortBy] = useState("checkIn");
  const [sortDir, setSortDir] = useState("asc");
  const [newStayFor, setNewStayFor] = useState(null); // roomId
  const [editingStay, setEditingStay] = useState(null); // stay object
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [profileGuest, setProfileGuest] = useState(null); // { id, name } | null

  // Cuenta cuántas veces se ha alojado cada huésped, para detectar visitas repetidas
  const visitKey = (s) => s.guestId || (s.guestName || "").trim().toLowerCase();
  const visitCounts = {};
  stays.forEach((s) => {
    const k = visitKey(s);
    if (!k) return;
    visitCounts[k] = (visitCounts[k] || 0) + 1;
  });

  const scanDrafts = () => {
    try {
      const found = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("masboronat-draft-stay-")) {
          try { found.push({ key: k, data: JSON.parse(localStorage.getItem(k)) }); } catch (e) { /* noop */ }
        }
      }
      setPendingDrafts(found);
    } catch (e) { /* noop */ }
  };
  useEffect(() => { scanDrafts(); }, []); // eslint-disable-line

  const resumeDraft = (draft) => {
    const idPart = draft.key.replace("masboronat-draft-stay-", "");
    if (idPart.startsWith("new-")) {
      setNewStayFor(idPart.replace("new-", ""));
    } else {
      const existing = stays.find((s) => s.id === idPart);
      setEditingStay(existing || null);
      if (!existing) setNewStayFor(draft.data.roomId);
    }
  };
  const discardDraft = (key) => {
    try { localStorage.removeItem(key); } catch (e) { /* noop */ }
    setPendingDrafts((d) => d.filter((x) => x.key !== key));
  };

  const roomsById = Object.fromEntries(rooms.map((r) => [r.id, r]));

  const upsert = async (stay) => {
    let next;
    if (stay.id) next = stays.map((s) => (s.id === stay.id ? stay : s));
    else next = [...stays, { ...stay, id: uid() }];
    await persistStays(next);
    setNewStayFor(null);
    setEditingStay(null);
    scanDrafts();
  };
  const remove = async (id) => { await persistStays(stays.filter((s) => s.id !== id)); };
  const saveGroup = async (newStays) => {
    await persistStays([...stays, ...newStays]);
    setShowGroupModal(false);
  };

  // Edición directa de una celda: guarda al instante, sin abrir ningún formulario
  const updateField = (stayId, field, value) => {
    persistStays(stays.map((s) => (s.id === stayId ? { ...s, [field]: value, ...(field === "checkOut" ? { checkoutProcessed: false } : {}) } : s)));
  };

  // --- Filtro, búsqueda y orden, como en una hoja de cálculo ---
  const rows = stays
    .map((s) => ({ ...s, room: roomsById[s.roomId] }))
    .filter((s) => s.room);

  const filteredRows = rows.filter((s) => {
    if (typeFilter !== "Todos" && s.room.type !== typeFilter) return false;
    if (statusFilter !== "Todas") {
      const timing = s.status === "Cancelada" ? "Cancelada" : stayTiming(s);
      if (statusFilter !== timing) return false;
    }
    if (groupFilter === "__grouped__" && !s.groupId) return false;
    if (groupFilter !== "Todas" && groupFilter !== "__grouped__" && s.groupId !== groupFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const matchesGuest = (s.guestName || "").toLowerCase().includes(q);
      const matchesRoom = unitLabel(s.room).toLowerCase().includes(q);
      if (!matchesGuest && !matchesRoom) return false;
    }
    return true;
  });

  // Lista de grupos existentes, para poder elegir uno concreto y filtrar/editar solo ese
  const groupOptions = [];
  const seenGroupIds = new Set();
  rows.forEach((s) => {
    if (s.groupId && !seenGroupIds.has(s.groupId)) {
      seenGroupIds.add(s.groupId);
      const count = rows.filter((x) => x.groupId === s.groupId).length;
      groupOptions.push({ id: s.groupId, label: `${s.guestName || "Sin nombre"} · ${count} unidades · ${s.checkIn}` });
    }
  });
  groupOptions.sort((a, b) => a.label.localeCompare(b.label));

  const sortValue = (s) => {
    switch (sortBy) {
      case "room": return unitLabel(s.room);
      case "guestName": return (s.guestName || "").toLowerCase();
      case "checkOut": return s.checkOut;
      case "status": return s.status === "Cancelada" ? "Cancelada" : stayTiming(s);
      default: return s.checkIn;
    }
  };
  const sortedRows = [...filteredRows].sort((a, b) => {
    const va = sortValue(a), vb = sortValue(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every((s) => selectedIds.has(s.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        sortedRows.forEach((s) => next.delete(s.id));
        return next;
      }
      const next = new Set(prev);
      sortedRows.forEach((s) => next.add(s.id));
      return next;
    });
  };
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectedStays = stays.filter((s) => selectedIds.has(s.id));
  const saveBulkEdit = async (updatedStays) => {
    const existingGroupId = updatedStays.find((s) => s.groupId)?.groupId;
    const groupId = existingGroupId || uid();
    const withGroup = updatedStays.map((s) => ({ ...s, groupId }));
    const byId = Object.fromEntries(withGroup.map((s) => [s.id, s]));
    await persistStays(stays.map((s) => (byId[s.id] ? byId[s.id] : s)));
    setShowBulkEdit(false);
    clearSelection();
  };

  const SortHeader = ({ col, children, className = "" }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`py-2 px-2 font-semibold text-stone-500 text-left cursor-pointer select-none whitespace-nowrap hover:text-stone-800 ${className}`}
    >
      {children} {sortBy === col && (sortDir === "asc" ? "▲" : "▼")}
    </th>
  );

  return (
    <div className={selectedIds.size > 0 ? "pb-16" : ""}>
      {pendingDrafts.length > 0 && (
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-blue-800">
            {pendingDrafts.length === 1 ? t("guests_draft_banner_one") : t("guests_draft_banner_many").replace("{n}", pendingDrafts.length)} {t("guests_draft_banner_reason")}
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingDrafts.map((d) => (
              <div key={d.key} className="flex items-center gap-1.5 bg-white border border-blue-200 rounded-lg px-2 py-1 text-xs">
                <span className="text-stone-700">{d.data.guestName || t("guests_no_name")} · {d.data.checkIn}</span>
                <button onClick={() => resumeDraft(d)} className="text-blue-700 font-medium">{t("guests_draft_resume")}</button>
                <button onClick={() => discardDraft(d.key)} className="text-stone-400 font-medium">{t("guests_draft_discard")}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">{t("guests_title")}</h2>
          <p className="text-xs text-stone-400">{t("guests_summary").replace("{shown}", sortedRows.length).replace("{total}", rows.length)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editable && !hotelClosed && (
            <button onClick={() => setShowRoomPicker(true)} className={`flex items-center gap-1.5 text-xs px-3 py-2 ${primaryBtn}`}>
              <Plus size={14} /> {t("guests_new_stay")}
            </button>
          )}
          {editable && !hotelClosed && (
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-[#ab9574] text-[#6d5c42] hover:bg-[#ab9574]/10"
            >
              <Users size={14} /> {t("guests_group_booking")}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("guests_search")}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#ab9574] w-48"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
          <option value="Todos">{t("guests_all_types")}</option>
          {TIPOS_ALOJAMIENTO.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls + " w-auto"}>
          <option value="Activas">{t("guests_active_filter")}</option>
          <option value="Todas">{t("guests_all_status")}</option>
          <option value="Próxima">{t("guests_upcoming")}</option>
          <option value="En curso">{t("guests_ongoing")}</option>
          <option value="Finalizada">{t("guests_finished")}</option>
          <option value="Cancelada">{t("guests_cancelled_filter")}</option>
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={inputCls + " w-auto"}>
          <option value="Todas">{t("guests_all_groups")}</option>
          <option value="__grouped__">{t("guests_grouped_only")} ({groupOptions.reduce((n, g) => n + 1, 0) > 0 ? rows.filter((s) => s.groupId).length : 0})</option>
          {groupOptions.length > 0 && <option disabled>──────────</option>}
          {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1100px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                {editable && (
                  <th className="py-2 px-2 w-8">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  </th>
                )}
                <SortHeader col="room">{t("col_unit")}</SortHeader>
                <SortHeader col="guestName">{t("col_guest")}</SortHeader>
                <SortHeader col="checkIn">{t("col_checkin")}</SortHeader>
                <SortHeader col="checkOut">{t("col_checkout")}</SortHeader>
                <th className="py-2 px-2 font-semibold text-stone-500 text-left whitespace-nowrap">{t("col_nights")}</th>
                <th className="py-2 px-2 font-semibold text-stone-500 text-left whitespace-nowrap">{t("col_people")}</th>
                <th className="py-2 px-2 font-semibold text-stone-500 text-left whitespace-nowrap">{t("col_regime")}</th>
                <SortHeader col="status">{t("col_status")}</SortHeader>
                <th className="py-2 px-2 font-semibold text-stone-500 text-left whitespace-nowrap">{t("col_paid_before")}</th>
                <th className="py-2 px-2 font-semibold text-stone-500 text-left whitespace-nowrap">{t("col_paid_after")}</th>
                <th className="py-2 px-2 font-semibold text-stone-500 text-left whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((s) => {
                const nights = daysBetween(s.checkIn, s.checkOut) + 1;
                const timing = s.status === "Cancelada" ? "Cancelada" : stayTiming(s);
                const isSelected = selectedIds.has(s.id);
                return (
                  <tr key={s.id} className={`border-b border-stone-100 hover:bg-stone-50/60 ${isSelected ? "bg-[#ab9574]/10" : ""}`}>
                    {editable && (
                      <td className="px-2"><input type="checkbox" checked={isSelected} onChange={() => toggleSelected(s.id)} /></td>
                    )}
                    <td className="py-1 px-2 font-medium text-stone-700 whitespace-nowrap">
                      {unitLabel(s.room)}
                      {s.groupId && <span className="ml-1"><Badge tone="purple">{t("guests_group_badge")}</Badge></span>}
                    </td>
                    <td className="py-1 px-2 min-w-[140px]">
                      <div className="flex items-center gap-1">
                        {editable ? (
                          <input
                            defaultValue={s.guestName}
                            onBlur={(e) => e.target.value !== s.guestName && updateField(s.id, "guestName", e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none"
                          />
                        ) : (s.guestName || "—")}
                        {visitCounts[visitKey(s)] > 1 && (
                          <button
                            onClick={() => setProfileGuest({ id: s.guestId, name: s.guestName })}
                            title={`Ya se ha alojado ${visitCounts[visitKey(s)]} veces — ver historial`}
                            className="shrink-0 text-[10px] font-semibold text-[#806c4d] bg-[#ab9574]/15 rounded-full px-1.5 py-0.5"
                          >
                            ×{visitCounts[visitKey(s)]}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-1 px-2">
                      {editable ? (
                        <input type="date" value={s.checkIn} onChange={(e) => updateField(s.id, "checkIn", e.target.value)}
                          className="bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none" />
                      ) : s.checkIn}
                    </td>
                    <td className="py-1 px-2">
                      {editable ? (
                        <input type="date" value={s.checkOut} onChange={(e) => updateField(s.id, "checkOut", e.target.value)}
                          className="bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none" />
                      ) : s.checkOut}
                    </td>
                    <td className="py-1 px-2 text-stone-500">{nights}</td>
                    <td className="py-1 px-2 w-16">
                      {editable ? (
                        <input
                          type="number" min="0" max={s.room.capacity} value={s.numGuests}
                          onChange={(e) => updateField(s.id, "numGuests", Math.min(Number(e.target.value), s.room.capacity))}
                          className="w-14 bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none"
                        />
                      ) : s.numGuests}
                    </td>
                    <td className="py-1 px-2">
                      {editable ? (
                        <select value={s.mealPlan} onChange={(e) => updateField(s.id, "mealPlan", e.target.value)}
                          className="bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none max-w-[120px]">
                          {MEAL_PLANS.map((m) => <option key={m} value={m}>{t("mp_" + m)}</option>)}
                        </select>
                      ) : s.mealPlan}
                    </td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1">
                        {editable ? (
                          <select
                            value={s.status}
                            onChange={(e) => updateField(s.id, "status", e.target.value)}
                            className="bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none"
                          >
                            <option value="Confirmada">Confirmada</option>
                            <option value="Cancelada">Cancelada</option>
                          </select>
                        ) : null}
                        <Badge tone={stayTone(s)}>{t("st_" + timing)}</Badge>
                      </div>
                    </td>
                    <td className="py-1 px-2 w-20">
                      {editable ? (
                        <input
                          type="number" min="0" step="any" value={s.amountPaidBefore || ""}
                          onChange={(e) => updateField(s.id, "amountPaidBefore", e.target.value === "" ? 0 : Number(e.target.value))}
                          placeholder="0"
                          className="w-16 bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none"
                        />
                      ) : (s.amountPaidBefore || 0)} €
                    </td>
                    <td className="py-1 px-2 w-20">
                      {editable ? (
                        <input
                          type="number" min="0" step="any" value={s.amountPaidAfter || ""}
                          onChange={(e) => updateField(s.id, "amountPaidAfter", e.target.value === "" ? 0 : Number(e.target.value))}
                          placeholder="0"
                          className="w-16 bg-transparent border border-transparent hover:border-stone-200 focus:border-[#ab9574] rounded px-1 py-0.5 focus:outline-none"
                        />
                      ) : (s.amountPaidAfter || 0)} €
                    </td>
                    <td className="py-1 px-2 whitespace-nowrap">
                      {deletable && <button onClick={() => remove(s.id)} className="text-rose-600 font-medium">{t("common_delete")}</button>}
                    </td>
                  </tr>
                );
              })}
              {sortedRows.length === 0 && (
                <tr><td colSpan={12} className="text-center text-stone-400 italic py-6">{t("guests_no_match")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRoomPicker && (
        <RoomPickerModal rooms={rooms} onClose={() => setShowRoomPicker(false)} onPick={(roomId) => { setShowRoomPicker(false); setNewStayFor(roomId); }} />
      )}

      {(newStayFor || editingStay) && (
        <StayModal
          room={newStayFor ? roomsById[newStayFor] : roomsById[editingStay.roomId]}
          stay={editingStay}
          otherStays={stays.filter((s) => s.roomId === (newStayFor || editingStay.roomId) && s.id !== editingStay?.id)}
          onClose={() => { setNewStayFor(null); setEditingStay(null); scanDrafts(); }}
          onSave={upsert}
        />
      )}

      {showGroupModal && (
        <GroupBookingModal rooms={rooms} onClose={() => setShowGroupModal(false)} onSave={saveGroup} />
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#332b1f] text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
          <span className="text-sm font-medium">{selectedIds.size} {t("guests_selected_count")}</span>
          <div className="flex gap-2">
            <button onClick={clearSelection} className="text-xs font-medium px-3 py-2 rounded-lg border border-white/30 hover:bg-white/10">{t("guests_cancel_selection")}</button>
            <button onClick={() => setShowBulkEdit(true)} className={`text-xs font-medium px-3 py-2 rounded-lg ${primaryBtn}`}>{t("guests_edit_together")}</button>
          </div>
        </div>
      )}

      {showBulkEdit && (
        <GroupEditModal stays={selectedStays} onClose={() => setShowBulkEdit(false)} onSave={saveBulkEdit} />
      )}

      {profileGuest && (
        <GuestProfileModal
          guest={profileGuest}
          stays={stays.filter((s) => visitKey(s) === (profileGuest.id || (profileGuest.name || "").trim().toLowerCase()))}
          onClose={() => setProfileGuest(null)}
        />
      )}
    </div>
  );
}

function GuestProfileModal({ guest, stays, onClose }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!guest.id) { setLoading(false); return; }
    fetchGuestById(guest.id).then((g) => { if (active) { setNotes(g?.notes || ""); setLoading(false); } });
    return () => { active = false; };
  }, [guest.id]);

  const save = async () => {
    if (!guest.id) return;
    setSaving(true);
    await saveGuestNotes(guest.id, notes);
    setSaving(false);
    onClose();
  };

  const sorted = [...stays].sort((a, b) => b.checkIn.localeCompare(a.checkIn));

  return (
    <Modal title={`Perfil de huésped — ${guest.name || "Sin nombre"}`} onClose={onClose}>
      <p className="text-xs text-stone-500 mb-3">
        {stays.length} estancia{stays.length !== 1 ? "s" : ""} registrada{stays.length !== 1 ? "s" : ""} en total.
      </p>
      <div className="mb-4 max-h-48 overflow-y-auto space-y-1.5">
        {sorted.map((s) => (
          <div key={s.id} className="text-xs border border-stone-100 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-stone-700 font-medium">{s.roomLabel || s.roomId}</span>
            <span className="text-stone-400">{s.checkIn} → {s.checkOut}</span>
            <Badge tone={s.status === "Cancelada" ? "red" : "slate"}>{s.status === "Cancelada" ? "Cancelada" : stayTiming(s)}</Badge>
          </div>
        ))}
      </div>
      {guest.id ? (
        <>
          <Field label="Notas y preferencias (visible para todo el equipo)">
            <textarea
              className={inputCls}
              rows={4}
              maxLength={1000}
              value={loading ? "" : notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={loading ? "Cargando…" : "p. ej. prefiere piso alto, alérgico a frutos secos, cliente habitual de calçotada…"}
              disabled={loading}
            />
          </Field>
          <button onClick={save} disabled={saving || loading} className={`w-full mt-1 py-2.5 ${primaryBtn} disabled:opacity-60`}>
            {saving ? "Guardando…" : "Guardar notas"}
          </button>
        </>
      ) : (
        <p className="text-xs text-stone-400 italic">Este huésped todavía no tiene perfil vinculado (se creará automáticamente la próxima vez que se guarde una reserva suya).</p>
      )}
    </Modal>
  );
}

function RoomPickerModal({ rooms, onClose, onPick }) {
  const { t: tt } = useTranslation();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = CATEGORIAS.map((c) => ({
    ...c,
    rooms: rooms.filter((r) => r.type === c.type && (!q || unitLabel(r).toLowerCase().includes(q))),
  })).filter((g) => g.rooms.length > 0);

  return (
    <Modal title={tt("guests_pick_unit_title")} onClose={onClose}>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tt("guests_search_unit")}
          className="pl-8 pr-3 py-2 text-sm rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#ab9574] w-full"
        />
      </div>
      <div className="max-h-80 overflow-y-auto space-y-3">
        {groups.map((g) => (
          <div key={g.type}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: g.color }}>{g.type}</h4>
            <div className="grid grid-cols-3 gap-1.5">
              {g.rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onPick(r.id)}
                  className="text-xs text-left border border-stone-200 rounded-lg px-2 py-1.5 hover:border-[#ab9574] hover:bg-[#ab9574]/10"
                >
                  {unitLabel(r)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-stone-400 italic">{tt("guests_no_results")}</p>}
      </div>
    </Modal>
  );
}


function GroupEditModal({ stays, onClose, onSave }) {
  const { t } = useTranslation();
  const first = stays[0];
  const [checkIn, setCheckIn] = useState(first?.checkIn || todayStr());
  const [checkOut, setCheckOut] = useState(first?.checkOut || todayStr());
  const [guestName, setGuestName] = useState(first?.guestName || "");
  const [mealPlan, setMealPlan] = useState(first?.mealPlan || "Ninguno");
  const [status, setStatus] = useState(first?.status || "Confirmada");

  const submit = () => {
    const updated = stays.map((s) => ({
      ...s,
      checkIn,
      checkOut,
      guestName: guestName.trim() || s.guestName,
      mealPlan,
      status,
    }));
    onSave(updated);
  };

  return (
    <Modal title={t("guests_edit_group_title").replace("{n}", stays.length)} onClose={onClose}>
      <p className="text-xs text-stone-500 mb-3">
        {t("guests_edit_group_desc").replace("{n}", stays.length)} {stays.map((s) => s.roomLabel).join(", ")}.
      </p>
      <Field label={t("guests_group_name_label")}>
        <input className={inputCls} maxLength={120} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("common_checkin")}>
          <input type="date" className={inputCls} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label={t("common_checkout")}>
          <input type="date" className={inputCls} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <Field label={t("col_regime")}>
        <select className={inputCls} value={mealPlan} onChange={(e) => setMealPlan(e.target.value)}>
          {MEAL_PLANS.map((m) => <option key={m} value={m}>{t("mp_" + m)}</option>)}
        </select>
      </Field>
      <Field label={t("field_reservation_status")}>
        <div className="flex gap-2">
          {["Confirmada", "Cancelada"].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${status === s ? selectedToggle : unselectedToggle}`}>
              {t("st_" + s)}
            </button>
          ))}
        </div>
      </Field>
      <button onClick={submit} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>{t("guests_apply_to_n").replace("{n}", stays.length)}</button>
    </Modal>
  );
}

function GroupBookingModal({ rooms, onClose, onSave }) {
  const { t } = useTranslation();
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
    const groupId = uid();
    const newStays = selectedIds.map((roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      return {
        id: uid(),
        groupId,
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
    <Modal title={t("guests_group_modal_title")} onClose={onClose}>
      <p className="text-xs text-stone-500 mb-3">
        {t("guests_group_modal_desc")}
      </p>

      <Field label={t("guests_group_name_label")}>
        <input className={inputCls} maxLength={120} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t("guests_group_guest_ph")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("common_checkin")}>
          <input type="date" className={inputCls} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label={t("common_checkout")}>
          <input type="date" className={inputCls} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("guests_per_unit_label")}>
          <input type="number" min="1" className={inputCls} value={guestsPerUnit} onChange={(e) => setGuestsPerUnit(Number(e.target.value))} />
        </Field>
        <Field label={t("col_regime")}>
          <select className={inputCls} value={mealPlan} onChange={(e) => setMealPlan(e.target.value)}>
            {MEAL_PLANS.map((m) => <option key={m} value={m}>{t("mp_" + m)}</option>)}
          </select>
        </Field>
      </div>
      <MoneyField label={t("guests_price_per_unit_label")} value={pricePerUnit} onChange={setPricePerUnit} />

      <div className="flex items-center justify-between mb-2 mt-1">
        <span className="text-xs font-medium text-stone-500">{t("guests_units_to_include")}</span>
        <button onClick={toggleAll} className="text-xs font-medium text-[#6d5c42]">
          {allSelected ? t("guests_remove_all") : t("guests_select_complex")}
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
        {t("guests_selected_capacity").replace("{n}", selectedIds.length).replace("{cap}", totalCapacity)}
      </p>

      <button
        onClick={submit}
        disabled={!guestName.trim() || selectedIds.length === 0}
        className={`w-full py-2.5 ${primaryBtn} disabled:opacity-50`}
      >
        {t("guests_create_n").replace("{n}", selectedIds.length || "")}
      </button>
    </Modal>
  );
}

function StayModal({ room, stay, otherStays, onClose, onSave }) {
  const { t } = useTranslation();
  const draftKey = `masboronat-draft-stay-${stay ? stay.id : "new-" + room.id}`;
  const defaultForm = stay || { roomId: room.id, roomLabel: unitLabel(room), guestName: "", checkIn: todayStr(), checkOut: todayStr(), numGuests: 1, mealPlan: "Ninguno", status: "Confirmada", amountPaidBefore: 0, amountPaidAfter: 0 };
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) return JSON.parse(saved);
    } catch (e) { /* noop */ }
    return defaultForm;
  });
  const [recoveredDraft] = useState(() => {
    try { return !!localStorage.getItem(draftKey); } catch (e) { return false; }
  });

  const set = (k, v) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch (e) { /* noop */ }
      return next;
    });
  };

  const handleClose = () => {
    try { localStorage.removeItem(draftKey); } catch (e) { /* noop */ }
    onClose();
  };
  const handleSave = () => {
    try { localStorage.removeItem(draftKey); } catch (e) { /* noop */ }
    onSave({ ...form, checkoutProcessed: false });
  };

  const conflicts = otherStays.filter(
    (s) => s.status !== "Cancelada" && form.checkIn && form.checkOut && rangesOverlap(form.checkIn, form.checkOut, s.checkIn, s.checkOut)
  );

  return (
    <Modal title={`${unitLabel(room)} · ${t("field_capacity")} ${room.capacity} pers.`} onClose={handleClose}>
      {recoveredDraft && (
        <div className="mb-3 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2">
          Recuperamos un borrador que no habías guardado. Revísalo antes de continuar.
        </div>
      )}
      <Field label={t("common_guest_name")}>
        <input className={inputCls} maxLength={120} value={form.guestName} onChange={(e) => set("guestName", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("common_checkin")}>
          <input type="date" className={inputCls} value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} />
        </Field>
        <Field label={t("common_checkout")}>
          <input type="date" className={inputCls} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} />
        </Field>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-3 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            {conflicts.length === 1 ? t("field_conflict_one") : t("field_conflict_many")}{" "}
            {conflicts.map((c) => `${c.guestName || t("field_no_name")} (${c.checkIn} → ${c.checkOut})`).join(", ")}. {t("field_conflict_note")}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("field_num_guests_max").replace("{n}", room.capacity)}>
          <input type="number" min="0" max={room.capacity} className={inputCls} value={form.numGuests} onChange={(e) => set("numGuests", Math.min(Number(e.target.value), room.capacity))} />
        </Field>
        <Field label={t("common_meal_plan")}>
          <select className={inputCls} value={form.mealPlan} onChange={(e) => set("mealPlan", e.target.value)}>
            {MEAL_PLANS.map((m) => <option key={m} value={m}>{t("mp_" + m)}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MoneyField label={t("common_paid_before")} value={form.amountPaidBefore} onChange={(v) => set("amountPaidBefore", v)} />
        <MoneyField label={t("common_paid_after")} value={form.amountPaidAfter} onChange={(v) => set("amountPaidAfter", v)} />
      </div>
      <Field label={t("field_reservation_status")}>
        <div className="flex gap-2">
          {["Confirmada", "Cancelada"].map((s) => (
            <button key={s} onClick={() => set("status", s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.status === s ? selectedToggle : unselectedToggle}`}>
              {t("st_" + s)}
            </button>
          ))}
        </div>
      </Field>
      <button onClick={handleSave} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>{t("common_save_reservation")}</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Restaurante                                                              */
/* ---------------------------------------------------------------------- */

/* ---------------------------------------------------------------------- */
/* Hoja de servicio imprimible del restaurante (formato físico / PDF)       */
/* ---------------------------------------------------------------------- */

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openPrintableDaySheet(dateStr, bookings) {
  const dateLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const generatedAt = new Date().toLocaleString("es-ES");

  const shiftSections = SHIFTS.map((shift) => {
    const rows = bookings
      .filter((b) => b.timeSlot === shift.key)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const covers = rows.reduce((sum, b) => sum + (Number(b.numPeople) || 0), 0);

    const rowsHtml = rows.length === 0
      ? `<tr><td colspan="8" style="text-align:center;color:#9c9284;padding:14px;font-style:italic;">Sin reservas</td></tr>`
      : rows.map((b) => `
        <tr>
          <td style="white-space:nowrap;font-weight:600;">${escapeHtml(b.time || "")}</td>
          <td>${escapeHtml(b.guestName || "Cliente")}</td>
          <td>${b.clientType === "Huésped del Resort" ? "Resort" : "Externo"}</td>
          <td style="text-align:center;">${escapeHtml(b.numPeople || "")}</td>
          <td>${escapeHtml(b.roomLabel || "")}</td>
          <td>${escapeHtml(b.contact || "")}</td>
          <td>${escapeHtml(b.menuNotes || "")}</td>
          <td style="color:#b91c1c;font-weight:600;">${escapeHtml(b.allergens || "")}</td>
        </tr>
        ${b.notes ? `<tr><td></td><td colspan="7" style="color:#78716c;font-style:italic;padding-top:0;">Nota: ${escapeHtml(b.notes)}</td></tr>` : ""}
      `).join("");

    return `
      <h2 style="margin:28px 0 6px;font-size:16px;color:#332b1f;border-bottom:2px solid #ab9574;padding-bottom:4px;">
        ${shift.label} <span style="font-weight:400;color:#78716c;font-size:12px;">— desde las ${shift.time} · ${rows.length} reserva${rows.length !== 1 ? "s" : ""} · ${covers} comensales</span>
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f5f4f2;text-align:left;">
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Hora</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Cliente</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Tipo</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Pers.</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Alojamiento</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Contacto</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Menú</th>
            <th style="padding:6px 8px;border-bottom:1px solid #d6d3d1;">Alérgenos</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }).join("");

  const totalCovers = bookings.reduce((sum, b) => sum + (Number(b.numPeople) || 0), 0);

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Hoja de servicio — ${escapeHtml(dateStr)}</title>
      <style>
        @page { margin: 16mm; }
        body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #292524; margin: 0; padding: 24px; }
        tr { page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #332b1f;padding-bottom:10px;margin-bottom:4px;">
        <div>
          <h1 style="margin:0;font-size:22px;color:#332b1f;">Mas Boronat — Hoja de Servicio</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#57534e;text-transform:capitalize;">${dateLabel}</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#a8a29e;">
          <div>${bookings.length} reservas · ${totalCovers} comensales en total</div>
          <div>Generado: ${generatedAt}</div>
        </div>
      </div>
      ${shiftSections}
      <p style="margin-top:30px;font-size:10px;color:#a8a29e;">Mas Boronat · Masía s. XVII · Salomó, Tarragona</p>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) {
    alert("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para esta página e inténtalo de nuevo.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

function RestaurantModule({ stays, bookings, persistBookings, editable, deletable, hotelClosed, prefillBooking, onPrefillConsumed }) {

  const { t } = useTranslation();
  const [date, setDate] = useState(todayStr());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (prefillBooking) setShowForm(true);
  }, [prefillBooking]);

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
          <h2 className="text-lg font-semibold text-stone-800">{t("restaurant_title")}</h2>
          <p className="text-xs text-stone-400">{t("restaurant_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " w-auto"} />
          <button
            onClick={() => openPrintableDaySheet(date, dayBookings)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50"
            title="Genera una hoja de servicio lista para imprimir o guardar como PDF"
          >
            <Printer size={14} /> Imprimir hoja del día
          </button>
          {editable && !hotelClosed && (
            <button onClick={() => setShowForm(true)} className={`flex items-center gap-1.5 px-3 py-2 ${primaryBtn}`}>
              <Plus size={16} /> {t("restaurant_new_booking")}
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
                <h3 className="font-semibold text-stone-700 text-sm">{t("shift_" + shift.key)}</h3>
                <span className="text-xs text-stone-400">{t("restaurant_since")} {shift.time}</span>
              </div>
              {shiftBookings.length === 0 ? (
                <p className="text-xs text-stone-400 italic">{t("restaurant_no_bookings")}</p>
              ) : (
                <ul className="space-y-2">
                  {shiftBookings.map((b) => (
                    <li key={b.id} className="border border-stone-100 rounded-xl p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-800">{b.time} · {b.guestName || t("restaurant_client_default")}</span>
                        <Badge tone={b.clientType === "Huésped del Resort" ? "green" : "red"}>{b.clientType === "Huésped del Resort" ? t("restaurant_client_hotel") : t("restaurant_client_external")}</Badge>
                      </div>
                      <div className="text-xs text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Users size={11} /> {b.numPeople}</span>
                        {b.roomLabel && <span>{b.roomLabel}</span>}
                        {b.contact && <span className="flex items-center gap-1"><Phone size={11} /> {b.contact}</span>}
                        {(b.amountPaidBefore || b.amountPaidAfter) ? <span className="font-medium text-stone-700">{(Number(b.amountPaidBefore || 0) + Number(b.amountPaidAfter || 0)).toFixed(2)} €</span> : null}
                      </div>
                      {b.menuNotes && (
                        <div className="text-xs text-[#6d5c42] bg-[#ab9574]/10 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                          <StickyNote size={11} className="mt-0.5 shrink-0" /> <span><strong>{t("restaurant_menu_label")}</strong> {b.menuNotes}</span>
                        </div>
                      )}
                      {b.allergens && (
                        <div className="text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                          <ShieldAlert size={11} className="mt-0.5 shrink-0" /> <span><strong>{t("restaurant_allergens_label")}</strong> {b.allergens}</span>
                        </div>
                      )}
                      {b.notes && (
                        <div className="text-xs text-stone-600 bg-stone-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                          <StickyNote size={11} className="mt-0.5 shrink-0" /> {b.notes}
                        </div>
                      )}
                      {(editable || deletable) && (
                        <div className="flex gap-3 mt-2">
                          {editable && <button onClick={() => setEditingId(b.id)} className="text-xs text-[#6d5c42] font-medium">{t("common_edit")}</button>}
                          {deletable && <button onClick={() => remove(b.id)} className="text-xs text-rose-600 font-medium">{t("common_delete")}</button>}
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
        <BookingModal
          stays={stays}
          date={date}
          booking={editingBooking}
          initial={prefillBooking}
          onClose={() => { setShowForm(false); setEditingId(null); onPrefillConsumed && onPrefillConsumed(); }}
          onSave={(b) => { upsert(b); onPrefillConsumed && onPrefillConsumed(); }}
        />
      )}
    </div>
  );
}

function BookingModal({ stays, date, booking, onClose, onSave, initial }) {
  const [form, setForm] = useState(
    booking || {
      date, timeSlot: "Desayuno", time: "08:00", clientType: "Huésped del Resort",
      stayId: "", roomLabel: "", guestName: "", numPeople: 2, contact: "",
      menuNotes: "", allergens: "", notes: "", amountPaidBefore: 0, amountPaidAfter: 0,
      ...(initial || {}),
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
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className="font-semibold text-stone-800 text-sm truncate">{label}</span>
        <Badge tone={cleanTone(cleaningStatus)}>
          <span className="flex items-center gap-1">{cleanStatusIcon(cleaningStatus)} {t("cl_" + cleaningStatus)}</span>
        </Badge>
      </div>
      {editable ? (
        <button onClick={() => onCycle(id)} className="w-full text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg py-1.5 mb-1.5">
          {t("housekeeping_touch_update")}
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
            {cleaningNotes ? t("housekeeping_edit_note") : t("housekeeping_add_note")}
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
  const { t } = useTranslation();
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
          <h2 className="text-lg font-semibold text-stone-800">{t("housekeeping_title")}</h2>
          <p className="text-xs text-stone-400">{pendingCount === 0 ? t("housekeeping_all_clean") : t("housekeeping_pending").replace("{n}", pendingCount)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
            <option value="Todos">{t("housekeeping_all_types")}</option>
            {TIPOS_ALOJAMIENTO.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <button
            onClick={() => setOnlyPending((v) => !v)}
            className={`text-xs font-medium px-3 py-2 rounded-lg border ${onlyPending ? selectedToggle : unselectedToggle}`}
          >
            {t("housekeeping_only_pending")}
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
        <p className="text-sm text-stone-400 italic">{t("housekeeping_no_match")}</p>
      )}
      <p className="text-[11px] text-stone-400 mt-2">Los salones se marcan "Sucia" automáticamente en cuanto pasa la fecha de un evento confirmado en ese espacio.</p>
    </div>
  );
}

function NoteInline({ initial, onSave, onCancel }) {
  const { t } = useTranslation();
  const [v, setV] = useState(initial || "");
  return (
    <div>
      <textarea className={inputCls} maxLength={400} rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder="p. ej. toallas extra, petición del huésped" />
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => onSave(v)} className="text-xs font-medium bg-[#806c4d] text-white rounded-md px-2.5 py-1">{t("housekeeping_save")}</button>
        <button onClick={onCancel} className="text-xs font-medium text-stone-500">{t("housekeeping_cancel")}</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mantenimiento                                                             */
/* ---------------------------------------------------------------------- */

function MaintenanceModule({ tickets, persistTickets, rooms, salones, persistSalones, editable, deletable, prefillTicket, onPrefillConsumed }) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("Todos");
  const [noteEditing, setNoteEditing] = useState(null);

  useEffect(() => {
    if (prefillTicket) setShowForm(true);
  }, [prefillTicket]);

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
      tickets.map((tk) =>
        tk.id === id
          ? { ...tk, status, resolvedAt: status === "Resuelto" ? new Date().toISOString() : null }
          : tk
      )
    );
  };
  const remove = async (id) => { await persistTickets(tickets.filter((tk) => tk.id !== id)); };

  const sorted = [...tickets].sort((a, b) => {
    const order = { Alta: 0, Media: 1, Baja: 2 };
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  const filtered = filter === "Todos" ? sorted : sorted.filter((tk) => tk.status === filter);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-stone-800 mb-1">{t("maintenance_exterior_title")}</h2>
        <p className="text-xs text-stone-400 mb-2">{t("maintenance_exterior_subtitle")}</p>
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
        <h2 className="text-lg font-semibold text-stone-800">{t("maintenance_tickets_title")}</h2>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputCls + " w-auto"}>
            <option value="Todos">{t("maintenance_all")}</option>
            {TICKET_STATUSES.map((s) => <option key={s} value={s}>{t("tk_" + s)}</option>)}
          </select>
          {editable && (
            <button onClick={() => setShowForm(true)} className={`flex items-center gap-1.5 px-3 py-2 ${primaryBtn}`}>
              <Plus size={16} /> {t("maintenance_new_ticket")}
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400 italic">{t("maintenance_no_match")}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((tk) => (
            <div key={tk.id} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                <span className="font-semibold text-stone-800">{tk.location}</span>
                <div className="flex gap-2">
                  <Badge tone={priorityTone(tk.priority)}>{t("maintenance_priority_label")} {t("pr_" + tk.priority)}</Badge>
                  <Badge tone={ticketStatusTone(tk.status)}>{t("tk_" + tk.status)}</Badge>
                </div>
              </div>
              <p className="text-sm text-stone-600 mb-2">{tk.issue}</p>
              <div className="text-xs text-stone-400 flex flex-wrap gap-3 mb-2">
                {tk.assignedTo && <span>{t("maintenance_assigned")} {tk.assignedTo}</span>}
                <span>{new Date(tk.timestamp).toLocaleString()}</span>
              </div>
              {(editable || deletable) && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {editable && (
                    <div className="flex gap-2">
                      {TICKET_STATUSES.map((s) => (
                        <button key={s} onClick={() => updateStatus(tk.id, s)} className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${tk.status === s ? selectedToggle : unselectedToggle}`}>
                          {t("tk_" + s)}
                        </button>
                      ))}
                    </div>
                  )}
                  {deletable && <button onClick={() => remove(tk.id)} className="text-xs text-rose-600 font-medium">{t("common_delete")}</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TicketModal
          rooms={rooms}
          salones={salones}
          initial={prefillTicket}
          onClose={() => { setShowForm(false); onPrefillConsumed && onPrefillConsumed(); }}
          onSave={(ticket) => { create(ticket); onPrefillConsumed && onPrefillConsumed(); }}
        />
      )}
    </div>
  );
}

function TicketModal({ rooms, salones, onClose, onSave, initial }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ location: "", issue: "", priority: "Media", status: "Pendiente", assignedTo: "", ...(initial || {}) });
  const [customLocation, setCustomLocation] = useState(!!(initial && initial.location));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onLocationSelect = (value) => {
    if (value === "__otro__") { setCustomLocation(true); set("location", ""); }
    else { setCustomLocation(false); set("location", value); }
  };

  return (
    <Modal title={t("maintenance_new_ticket_title")} onClose={onClose}>
      <Field label={t("maintenance_location_label")}>
        {!customLocation ? (
          <select className={inputCls} value={form.location} onChange={(e) => onLocationSelect(e.target.value)}>
            <option value="">{t("maintenance_select_placeholder")}</option>
            {TIPOS_ALOJAMIENTO.map((ty) => (
              <optgroup key={ty} label={ty}>
                {rooms.filter((r) => r.type === ty).map((r) => (
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
            <option value="__otro__">{t("maintenance_other_specify")}</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input className={inputCls} maxLength={120} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t("maintenance_location_ph")} autoFocus />
            <button onClick={() => setCustomLocation(false)} className="text-xs text-stone-500 shrink-0">{t("maintenance_choose_from_list")}</button>
          </div>
        )}
      </Field>
      <Field label={t("maintenance_issue_label")}>
        <textarea className={inputCls} maxLength={400} rows={2} value={form.issue} onChange={(e) => set("issue", e.target.value)} placeholder={t("maintenance_issue_ph")} />
      </Field>
      <Field label={t("maintenance_priority_label")}>
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => set("priority", p)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.priority === p ? selectedToggle : unselectedToggle}`}>
              {t("pr_" + p)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("maintenance_assigned_label")}>
        <input className={inputCls} maxLength={120} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} />
      </Field>
      <button onClick={() => form.location && form.issue && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>{t("maintenance_create")}</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Eventos                                                                   */
/* ---------------------------------------------------------------------- */

function EventsModule({ events, persistEvents, stays, editable, deletable }) {
  const { t } = useTranslation();
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

  const groupEvents = groupStaysToPseudoEvents(stays || []);
  const combined = [...events, ...groupEvents];
  const filtered = combined.filter((e) => e.date.startsWith(monthFilter)).sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")));
  const editingEvent = editingId ? events.find((e) => e.id === editingId) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">{t("events_title")}</h2>
          <p className="text-xs text-stone-400">{t("events_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={inputCls + " w-auto"} />
          {editable && (
            <button onClick={() => setShowForm(true)} className={`flex items-center gap-1.5 px-3 py-2 ${primaryBtn}`}>
              <Plus size={16} /> {t("events_new")}
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400 italic">{t("events_none_month")}</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((e) =>
            e.isGroupBooking ? (
              <div key={e.id} className="bg-white rounded-2xl border-2 border-dashed border-[#ab9574]/50 p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div>
                    <span className="font-semibold text-stone-800">{e.title}</span>
                    <span className="block text-[11px] text-stone-400">Reserva de grupo (alojamiento)</span>
                  </div>
                  <Badge tone="purple">Grupo</Badge>
                </div>
                <div className="text-sm text-stone-600 space-y-1">
                  <div className="flex items-center gap-1.5"><CalendarDays size={13} className="text-stone-400" /> {e.date} → {e.endDate}</div>
                  <div className="flex items-center gap-1.5"><BedDouble size={13} className="text-stone-400" /> {e.units.join(", ")}</div>
                  <div className="flex items-center gap-1.5"><Users size={13} className="text-stone-400" /> {e.totalGuests} {t("events_expected_people")}</div>
                </div>
                <p className="text-[11px] text-stone-400 mt-2 italic">Se gestiona desde Huéspedes y Alojamientos — aparece aquí solo, no requiere carga manual.</p>
              </div>
            ) : (
            <div key={e.id} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div>
                  <span className="font-semibold text-stone-800">{e.title}</span>
                  <span className="block text-[11px] text-stone-400">{t("et_" + e.eventType)}</span>
                </div>
                <Badge tone={eventStatusTone(e.status)}>{t("ev_" + e.status)}</Badge>
              </div>
              <div className="text-sm text-stone-600 space-y-1">
                <div className="flex items-center gap-1.5"><CalendarDays size={13} className="text-stone-400" /> {e.date} · {e.startTime}{e.endTime ? ` – ${e.endTime}` : ""}</div>
                <div className="flex items-center gap-1.5"><MapPin size={13} className="text-stone-400" /> {e.space}</div>
                {e.expectedGuests ? (
                  <div className="flex items-center gap-1.5"><Users size={13} className="text-stone-400" /> {e.expectedGuests} {t("events_expected_people")}</div>
                ) : null}
                {e.responsible && <div className="text-xs text-stone-400">{t("events_responsible")} {e.responsible}</div>}
              </div>
              {e.menuNotes && (
                <div className="text-xs text-[#6d5c42] bg-[#ab9574]/10 rounded-md px-2 py-1 mt-2 flex items-start gap-1">
                  <StickyNote size={11} className="mt-0.5 shrink-0" /> <span><strong>{t("restaurant_menu_label")}</strong> {e.menuNotes}</span>
                </div>
              )}
              {e.allergens && (
                <div className="text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                  <ShieldAlert size={11} className="mt-0.5 shrink-0" /> <span><strong>{t("restaurant_allergens_label")}</strong> {e.allergens}</span>
                </div>
              )}
              {e.notes && (
                <div className="text-xs text-stone-600 bg-stone-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
                  <StickyNote size={11} className="mt-0.5 shrink-0" /> {e.notes}
                </div>
              )}
              {(editable || deletable) && (
                <div className="flex gap-3 mt-2">
                  {editable && <button onClick={() => setEditingId(e.id)} className="text-xs text-[#6d5c42] font-medium">{t("common_edit")}</button>}
                  {deletable && <button onClick={() => remove(e.id)} className="text-xs text-rose-600 font-medium">{t("common_delete")}</button>}
                </div>
              )}
            </div>
            )
          )}
        </div>
      )}

      {(showForm || editingEvent) && (
        <EventModal event={editingEvent} onClose={() => { setShowForm(false); setEditingId(null); }} onSave={upsert} />
      )}
    </div>
  );
}

function EventModal({ event, onClose, onSave }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    event || {
      title: "", eventType: "Boda", date: todayStr(), startTime: "18:00", endTime: "",
      space: "Patio Central (Masía s. XVII)", expectedGuests: "", responsible: "", status: "Programado",
      menuNotes: "", allergens: "", notes: "",
    }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={event ? t("events_edit_title") : t("events_new_title")} onClose={onClose}>
      <Field label={t("events_name_label")}>
        <input className={inputCls} maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="p. ej. Boda García-Ruiz, Retiro corporativo Acme" />
      </Field>
      <Field label={t("events_type_label")}>
        <select className={inputCls} value={form.eventType} onChange={(e) => set("eventType", e.target.value)}>
          {EVENT_TYPES.map((ty) => <option key={ty} value={ty}>{t("et_" + ty)}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("events_date_label")}>
          <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label={t("events_space_label")}>
          <select className={inputCls} value={form.space} onChange={(e) => set("space", e.target.value)}>
            {EVENT_SPACES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("events_start_label")}>
          <input type="time" className={inputCls} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
        </Field>
        <Field label={t("events_end_label")}>
          <input type="time" className={inputCls} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("events_people_label")}>
          <input type="number" min="0" className={inputCls} value={form.expectedGuests} onChange={(e) => set("expectedGuests", e.target.value)} />
        </Field>
        <Field label={t("events_responsible_label")}>
          <input className={inputCls} maxLength={120} value={form.responsible} onChange={(e) => set("responsible", e.target.value)} placeholder={t("events_responsible_ph")} />
        </Field>
      </div>
      <Field label={t("events_status_label")}>
        <div className="flex gap-2 flex-wrap">
          {EVENT_STATUSES.map((s) => (
            <button key={s} onClick={() => set("status", s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${form.status === s ? selectedToggle : unselectedToggle}`}>
              {t("ev_" + s)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("events_menu_label")}>
        <textarea className={inputCls} maxLength={400} rows={2} value={form.menuNotes} onChange={(e) => set("menuNotes", e.target.value)} placeholder="p. ej. Menú degustación 4 platos, cóctel de bienvenida…" />
      </Field>
      <Field label={t("events_allergens_label")}>
        <textarea className={inputCls} maxLength={400} rows={2} value={form.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="p. ej. 2 comensales sin gluten, alergia a marisco…" />
      </Field>
      <Field label={t("events_notes_label")}>
        <textarea className={inputCls} maxLength={400} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Montaje, equipo audiovisual, decoración…" />
      </Field>
      <button onClick={() => form.title && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>{t("events_save")}</button>
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
  const { t, lang } = useTranslation();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(null);

  const [year, mon] = month.split("-").map(Number);
  const firstOfMonth = new Date(year, mon - 1, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, mon, 0).getDate();
  const monthName = firstOfMonth.toLocaleDateString(LOCALE_MAP[lang], { month: "long", year: "numeric" });
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
          <h2 className="text-lg font-semibold text-stone-800">{t("planning_title")}</h2>
          <p className="text-xs text-stone-400">{t("planning_subtitle")}</p>
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
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 inline-block" /> {t("planning_legend_units")}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky-100 border border-sky-300 inline-block" /> {t("planning_legend_restaurant")}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-100 border border-violet-300 inline-block" /> {t("planning_legend_events")}</span>
        </div>
      </div>

      {selectedDate && (
        <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-4">
          <h3 className="font-semibold text-stone-800 mb-3 capitalize">{new Date(selectedDate + "T00:00:00").toLocaleDateString(LOCALE_MAP[lang], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>

          <div className="mb-4">
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{t("planning_legend_units")}</h4>
            {selStays.length === 0 ? (
              <p className="text-sm text-stone-400 italic">{t("planning_no_stays_day")}</p>
            ) : (
              <ul className="space-y-1.5">
                {selStays.map((s) => {
                  const isCheckIn = s.checkIn === selectedDate;
                  const isCheckOut = s.checkOut === selectedDate;
                  return (
                    <li key={s.id} className="text-sm border border-stone-100 rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-700 font-medium">{s.roomLabel} · {s.guestName || t("guests_no_name")}</span>
                        <div className="flex gap-1">
                          {isCheckIn && <Badge tone="green">{t("planning_checkin_badge")}</Badge>}
                          {isCheckOut && <Badge tone="red">{t("planning_checkout_badge")}</Badge>}
                          {!isCheckIn && !isCheckOut && <Badge tone="slate">{t("planning_ongoing_badge")}</Badge>}
                        </div>
                      </div>
                      <div className="text-xs text-stone-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1"><Users size={11} /> {s.numGuests} pers.</span>
                        <span>{t("mp_" + s.mealPlan)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mb-4">
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{t("planning_legend_restaurant")}</h4>
            {selBookings.length === 0 ? (
              <p className="text-sm text-stone-400 italic">{t("planning_no_bookings_day")}</p>
            ) : (
              <ul className="space-y-1.5">
                {selBookings.map((b) => (
                  <li key={b.id} className="text-sm flex items-center justify-between border border-stone-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-stone-700">{b.time} · {t("shift_" + b.timeSlot)} · {b.guestName || t("restaurant_client_default")} ({b.numPeople}p)</span>
                    <Badge tone={b.clientType === "Huésped del Resort" ? "green" : "red"}>{b.clientType === "Huésped del Resort" ? t("restaurant_client_hotel") : t("restaurant_client_external")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{t("planning_legend_events")}</h4>
            {selEvents.length === 0 ? (
              <p className="text-sm text-stone-400 italic">{t("planning_no_events_day")}</p>
            ) : (
              <ul className="space-y-1.5">
                {selEvents.map((e) => (
                  <li key={e.id} className="text-sm border border-stone-100 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-700 font-medium">{e.startTime} · {e.title}</span>
                      <Badge tone={eventStatusTone(e.status)}>{t("ev_" + e.status)}</Badge>
                    </div>
                    <div className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5"><MapPin size={11} /> {e.space} · {t("et_" + e.eventType)}</div>
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

function PlanningGeneralModule({ rooms, stays, persistStays, editable }) {
  const { t, lang } = useTranslation();
  const [windowStart, setWindowStart] = useState(todayStr());
  const [daysToShow, setDaysToShow] = useState(21);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [activeStay, setActiveStay] = useState(null);
  const [dragging, setDragging] = useState(null); // { stayId, startX, deltaDays }
  const dragMovedRef = useRef(false);

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
    const label = new Date(d + "T00:00:00").toLocaleDateString(LOCALE_MAP[lang], { month: "long", year: "numeric" });
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
        <h2 className="text-lg font-semibold text-stone-800">{t("pgen_title")}</h2>
        <p className="text-xs text-stone-400">{t("pgen_subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("pgen_search_guest")}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#ab9574] w-40 sm:w-56"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
          {["Todos", ...TIPOS_ALOJAMIENTO].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={daysToShow} onChange={(e) => setDaysToShow(Number(e.target.value))} className={inputCls + " w-auto"}>
          <option value={14}>{t("pgen_days_14")}</option>
          <option value={21}>{t("pgen_days_21")}</option>
          <option value={30}>{t("pgen_days_30")}</option>
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setWindowStart(addDays(windowStart, -daysToShow))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="Página anterior">
            <ChevronsLeft size={15} />
          </button>
          <button onClick={() => setWindowStart(addDays(windowStart, -7))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="7 días atrás">
            <ChevronLeft size={15} />
          </button>
          <input type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={inputCls + " w-auto"} />
          <button onClick={() => setWindowStart(today)} className="px-2 py-2 rounded-lg border border-stone-300 text-stone-600 text-xs font-medium">{t("pgen_today")}</button>
          <button onClick={() => setWindowStart(addDays(windowStart, 7))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="7 días adelante">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => setWindowStart(addDays(windowStart, daysToShow))} className="p-2 rounded-lg border border-stone-300 text-stone-600" title="Página siguiente">
            <ChevronsRight size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2 text-[11px] text-stone-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#16a34a] inline-block" /> {t("pgen_legend_now")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#0369a1] inline-block" /> {t("pgen_legend_future")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#a8a29e] inline-block" /> {t("pgen_legend_finished")}</span>
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
                  const isDropTarget = dragging && dragging.targetRoomId === r.id && dragging.targetRoomId !== dragging.originRoomId;
                  return (
                    <div key={r.id} data-room-id={r.id} className={`flex border-b border-stone-100 ${isDropTarget ? "bg-[#ab9574]/15" : ""}`}>
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
                          const isDraggingThis = dragging && dragging.stayId === s.id;
                          const liveDelta = isDraggingThis ? dragging.deltaDays : 0;
                          const startOffset = Math.max(0, daysBetween(windowStart, s.checkIn) + liveDelta);
                          const clippedEnd = Math.min(daysBetween(windowStart, s.checkOut) + liveDelta, daysToShow - 1);
                          const widthDays = Math.max(1, clippedEnd - startOffset + 1);
                          const canDrag = !!persistStays && !!editable && s.status !== "Cancelada";
                          return (
                            <button
                              key={s.id}
                              onClick={() => {
                                if (dragMovedRef.current) { dragMovedRef.current = false; return; }
                                setActiveStay(s);
                              }}
                              onPointerDown={(e) => {
                                if (!canDrag) return;
                                e.currentTarget.setPointerCapture(e.pointerId);
                                dragMovedRef.current = false;
                                setDragging({ stayId: s.id, startX: e.clientX, deltaDays: 0, originRoomId: r.id, targetRoomId: r.id });
                              }}
                              onPointerMove={(e) => {
                                if (!isDraggingThis) return;
                                const deltaX = e.clientX - dragging.startX;
                                const deltaDays = Math.round(deltaX / GANTT_DAY_WIDTH);
                                const elUnder = document.elementFromPoint(e.clientX, e.clientY);
                                const rowEl = elUnder ? elUnder.closest("[data-room-id]") : null;
                                const targetRoomId = rowEl ? rowEl.getAttribute("data-room-id") : dragging.targetRoomId;
                                if (deltaDays !== dragging.deltaDays || targetRoomId !== dragging.targetRoomId) {
                                  if (deltaDays !== 0 || targetRoomId !== dragging.originRoomId) dragMovedRef.current = true;
                                  setDragging((d) => ({ ...d, deltaDays, targetRoomId, cursorX: e.clientX, cursorY: e.clientY }));
                                } else {
                                  setDragging((d) => ({ ...d, cursorX: e.clientX, cursorY: e.clientY }));
                                }
                              }}
                              onPointerUp={() => {
                                if (!isDraggingThis) return;
                                const dd = dragging.deltaDays;
                                const targetRoomId = dragging.targetRoomId;
                                const changesRoom = targetRoomId && targetRoomId !== dragging.originRoomId;
                                setDragging(null);
                                if ((dd !== 0 || changesRoom) && persistStays) {
                                  const newCheckIn = addDays(s.checkIn, dd);
                                  const newCheckOut = addDays(s.checkOut, dd);
                                  const targetRoom = changesRoom ? rooms.find((rm) => rm.id === targetRoomId) : null;
                                  persistStays(stays.map((st) => (st.id === s.id ? {
                                    ...st,
                                    checkIn: newCheckIn,
                                    checkOut: newCheckOut,
                                    ...(targetRoom ? { roomId: targetRoom.id, roomLabel: unitLabel(targetRoom) } : {}),
                                  } : st)));
                                }
                              }}
                              title={canDrag ? `${s.guestName || "Sin nombre"} · ${s.checkIn} → ${s.checkOut} · arrastra para mover a otra fecha o unidad` : `${s.guestName || "Sin nombre"} · ${s.checkIn} → ${s.checkOut}`}
                              style={{
                                left: startOffset * GANTT_DAY_WIDTH + 2,
                                width: widthDays * GANTT_DAY_WIDTH - 4,
                                top: 4,
                                height: 32,
                                backgroundColor: tone.bg,
                                color: tone.text,
                                cursor: canDrag ? (isDraggingThis ? "grabbing" : "grab") : "pointer",
                                touchAction: "none",
                                zIndex: isDraggingThis ? 20 : 1,
                                boxShadow: isDraggingThis ? "0 4px 10px rgba(0,0,0,0.25)" : undefined,
                              }}
                              className="absolute rounded-md px-2 text-[11px] font-medium truncate text-left shadow-sm hover:brightness-95 select-none"
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
              <p className="text-sm text-stone-400 italic p-4">{t("pgen_no_match")}</p>
            )}
          </div>
        </div>
      </div>

      {dragging && dragging.targetRoomId && dragging.targetRoomId !== dragging.originRoomId && dragging.cursorX != null && (
        <div
          className="fixed z-50 pointer-events-none bg-[#332b1f] text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg"
          style={{ left: dragging.cursorX + 14, top: dragging.cursorY + 14 }}
        >
          → Se moverá a {unitLabel(rooms.find((r) => r.id === dragging.targetRoomId) || {})}
        </div>
      )}

      {activeStay && (
        <Modal title={unitLabel(rooms.find((r) => r.id === activeStay.roomId) || {})} onClose={() => setActiveStay(null)}>
          <div className="text-sm text-stone-700 space-y-1.5">
            <div><strong>{t("detail_guest")}</strong> {activeStay.guestName || t("guests_no_name")}</div>
            <div><strong>{t("detail_dates")}</strong> {activeStay.checkIn} → {activeStay.checkOut}</div>
            <div><strong>{t("detail_people")}</strong> {activeStay.numGuests}</div>
            <div><strong>{t("detail_regime")}</strong> {t("mp_" + activeStay.mealPlan)}</div>
            <div><strong>{t("detail_status")}</strong> <Badge tone={stayTone(activeStay)}>{t("st_" + stayTiming(activeStay))}</Badge></div>
          </div>
          <p className="text-xs text-stone-400 mt-3">{t("pgen_edit_hint")}</p>
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
  const { t } = useTranslation();
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
        <StatTile icon={BarChart3} label={t("admin_hospedaje_kpi_occ")} value={`${currentMonthOcc}%`} />
        <StatTile icon={Timer} label={t("admin_hospedaje_kpi_stay")} value={t("admin_hospedaje_nights").replace("{n}", avgNights)} />
        <StatTile icon={Users} label={t("admin_hospedaje_kpi_guests")} value={avgGuests} />
        <StatTile icon={BedDouble} label={t("admin_hospedaje_kpi_total")} value={validStays.length} />
      </div>

      <ChartCard title={t("admin_hospedaje_chart_occ")}>
        <LineChart data={occData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Line type="monotone" dataKey="ocupacion" stroke={CHART_GOLD_DARK} strokeWidth={2} dot={{ r: 3 }} name={t("admin_hospedaje_kpi_occ")} />
        </LineChart>
      </ChartCard>

      <ChartCard title={t("admin_hospedaje_chart_type")}>
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
  const { t } = useTranslation();
  const months = lastNMonths(6);
  const monthlyData = months.map((mKey) => ({
    month: monthLabelOf(mKey),
    reservas: bookings.filter((b) => b.date && b.date.startsWith(mKey)).length,
  }));

  const shiftCounts = { Desayuno: 0, Almuerzo: 0, Cena: 0 };
  bookings.forEach((b) => { if (shiftCounts[b.timeSlot] !== undefined) shiftCounts[b.timeSlot]++; });
  const shiftData = SHIFTS.map((s) => ({ turno: t("shift_" + s.key), reservas: shiftCounts[s.key] }));

  const hotelCount = bookings.filter((b) => b.clientType === "Huésped del Resort").length;
  const externalCount = bookings.length - hotelCount;
  const clientData = [
    { name: t("restaurant_client_hotel"), value: hotelCount },
    { name: t("restaurant_client_external"), value: externalCount },
  ];

  const avgPeople = bookings.length
    ? (bookings.reduce((sum, b) => sum + (Number(b.numPeople) || 0), 0) / bookings.length).toFixed(1)
    : "0";
  const topShift = shiftData.slice().sort((a, b) => b.reservas - a.reservas)[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={UtensilsCrossed} label={t("admin_restaurant_kpi_total")} value={bookings.length} />
        <StatTile icon={Users} label={t("admin_restaurant_kpi_people")} value={avgPeople} />
        <StatTile icon={TrendingUp} label={t("admin_restaurant_kpi_month")} value={monthlyData[monthlyData.length - 1]?.reservas ?? 0} />
        <StatTile icon={Award} label={t("admin_restaurant_kpi_top_shift")} value={topShift && topShift.reservas > 0 ? topShift.turno : "—"} />
      </div>

      <ChartCard title={t("admin_restaurant_chart_month")}>
        <BarChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="reservas" fill={CHART_GOLD_DARK} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartCard title={t("admin_restaurant_chart_shift")} height={200}>
          <BarChart data={shiftData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="turno" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="reservas" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title={t("admin_restaurant_chart_client")} height={200}>
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
  const { t } = useTranslation();
  const statusCounts = {};
  CLEAN_STATUSES.forEach((s) => (statusCounts[s] = 0));
  rooms.forEach((r) => { statusCounts[r.cleaningStatus] = (statusCounts[r.cleaningStatus] || 0) + 1; });
  const statusData = CLEAN_STATUSES.map((s) => ({ estado: t("cl_" + s), rawStatus: s, unidades: statusCounts[s] }));
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
        <StatTile icon={Sparkles} label={t("admin_hk_kpi_clean")} value={`${cleanPct}%`} />
        <StatTile icon={AlertTriangle} label={t("admin_hk_kpi_dirty")} value={statusCounts["Sucia"] + statusCounts["En Progreso"]} />
        <StatTile icon={Circle} label={t("admin_hk_kpi_inspect")} value={statusCounts["Inspección Necesaria"]} />
        <StatTile icon={TrendingUp} label={t("admin_hk_kpi_actions")} value={last14Total} />
      </div>

      <ChartCard title={t("admin_hk_chart_status")} height={200}>
        <BarChart data={statusData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="estado" tick={{ fontSize: 9 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="unidades" radius={[4, 4, 0, 0]}>
            {statusData.map((d, i) => <Cell key={i} fill={statusFill[d.rawStatus]} />)}
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard title={t("admin_hk_chart_activity")} height={200}>
        <LineChart data={activityData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="acciones" stroke={CHART_GOLD_DARK} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ChartCard>

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h4 className="text-sm font-semibold text-stone-700 mb-3">{t("admin_hk_chart_top")}</h4>
        {topEmployees.length === 0 ? (
          <p className="text-sm text-stone-400 italic">{t("admin_hk_no_activity")}</p>
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

function MaintenanceStats({ tickets, salones, auditLog }) {
  const { t } = useTranslation();
  const exteriorSalones = (salones || []).filter((s) => s.category === "Espacios Exteriores");
  const exteriorClean = exteriorSalones.filter((s) => s.cleaningStatus === "Limpia").length;
  const exteriorPending = exteriorSalones.length - exteriorClean;

  const extLog = (auditLog || []).filter((l) => l.module === "Mantenimiento / Espacios Exteriores");
  const extDays = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i - 13));
  const extActivityData = extDays.map((d) => ({
    day: d.slice(5),
    acciones: extLog.filter((l) => (l.created_at || "").slice(0, 10) === d).length,
  }));
  const extActivityTotal = extActivityData.reduce((sum, d) => sum + d.acciones, 0);

  const statusCounts = {};
  TICKET_STATUSES.forEach((s) => (statusCounts[s] = 0));
  tickets.forEach((tk) => { statusCounts[tk.status] = (statusCounts[tk.status] || 0) + 1; });
  const statusData = TICKET_STATUSES.map((s) => ({ estado: t("tk_" + s), rawStatus: s, tickets: statusCounts[s] }));
  const statusFill = { Pendiente: CHART_AMBER, "En Progreso": CHART_BLUE, Resuelto: CHART_GREEN };

  const priorityCounts = {};
  PRIORITIES.forEach((p) => (priorityCounts[p] = 0));
  tickets.forEach((tk) => { priorityCounts[tk.priority] = (priorityCounts[tk.priority] || 0) + 1; });
  const priorityData = PRIORITIES.map((p) => ({ prioridad: t("pr_" + p), rawPriority: p, tickets: priorityCounts[p] }));
  const priorityFill = { Baja: CHART_GREEN, Media: CHART_AMBER, Alta: CHART_ROSE };

  const resolved = tickets.filter((tk) => tk.status === "Resuelto" && tk.resolvedAt);
  const avgResolutionHours = resolved.length
    ? (resolved.reduce((sum, tk) => sum + (new Date(tk.resolvedAt) - new Date(tk.timestamp)) / 3600000, 0) / resolved.length).toFixed(1)
    : null;

  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i - 13));
  const createdData = days.map((d) => ({
    day: d.slice(5),
    tickets: tickets.filter((tk) => (tk.timestamp || "").slice(0, 10) === d).length,
  }));

  const byLocation = {};
  tickets.forEach((tk) => { byLocation[tk.location] = (byLocation[tk.location] || 0) + 1; });
  const topLocations = Object.entries(byLocation)
    .map(([location, count]) => ({ location, tickets: count }))
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, 5);

  const openCount = statusCounts["Pendiente"] + statusCounts["En Progreso"];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-stone-700">{t("maintenance_exterior_title")}</h4>
          <span className="text-xs text-stone-400">{t("admin_maint_clean_of").replace("{clean}", exteriorClean).replace("{total}", exteriorSalones.length)}</span>
        </div>
        {exteriorSalones.length === 0 ? (
          <p className="text-sm text-stone-400 italic">{t("admin_maint_no_data")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {exteriorSalones.map((s) => (
              <div key={s.id} className="border border-stone-100 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700">{s.name}</span>
                <Badge tone={cleanTone(s.cleaningStatus)}>{t("cl_" + s.cleaningStatus)}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <ChartCard title={t("admin_maint_exterior_activity") + ` (${extActivityTotal})`} height={200}>
        <LineChart data={extActivityData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="acciones" stroke={CHART_GREEN} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ChartCard>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={Wrench} label={t("admin_maint_kpi_open")} value={openCount} />
        <StatTile icon={CheckCircle2} label={t("admin_maint_kpi_resolved")} value={statusCounts["Resuelto"]} />
        <StatTile icon={Timer} label={t("admin_maint_kpi_avg_time")} value={avgResolutionHours !== null ? `${avgResolutionHours} h` : "—"} />
        <StatTile icon={AlertTriangle} label={t("admin_maint_kpi_high")} value={tickets.filter((tk) => tk.priority === "Alta" && tk.status !== "Resuelto").length} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartCard title={t("admin_maint_chart_status")} height={200}>
          <PieChart>
            <Pie data={statusData} dataKey="tickets" nameKey="estado" outerRadius={70} label>
              {statusData.map((d, i) => <Cell key={i} fill={statusFill[d.rawStatus]} />)}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>
        <ChartCard title={t("admin_maint_chart_priority")} height={200}>
          <BarChart data={priorityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="prioridad" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="tickets" radius={[4, 4, 0, 0]}>
              {priorityData.map((d, i) => <Cell key={i} fill={priorityFill[d.rawPriority]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      <ChartCard title={t("admin_maint_chart_created")} height={200}>
        <LineChart data={createdData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="tickets" stroke={CHART_ROSE} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ChartCard>

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h4 className="text-sm font-semibold text-stone-700 mb-3">{t("admin_maint_chart_locations")}</h4>
        {topLocations.length === 0 ? (
          <p className="text-sm text-stone-400 italic">{t("admin_maint_no_locations")}</p>
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

function BackupPasswordModal({ onClose, onSubmitPassword }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await onSubmitPassword(value);
      onClose();
    } catch (e) {
      setError(e.message || t("backup_wrong"));
    }
    setLoading(false);
  };

  return (
    <Modal title={t("backup_confirm_title")} onClose={onClose}>
      <Field label={t("backup_password_label")}>
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
      <button onClick={submit} disabled={loading} className={`w-full py-2.5 ${primaryBtn} disabled:opacity-60`}>
        {loading ? t("backup_preparing") : t("backup_confirm_btn")}
      </button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Personal — directorio y restablecimiento de contraseña                   */
/* ---------------------------------------------------------------------- */

function StaffPanel({ adminEmail }) {
  const { t, lang } = useTranslation();
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
          <h3 className="font-semibold text-stone-700">{t("admin_attendance_today")}</h3>
          <span className="text-xs text-stone-400 capitalize">{new Date().toLocaleDateString(LOCALE_MAP[lang], { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <p className="text-xs text-stone-500 mb-1">
          {staff ? t("admin_attendance_summary").replace("{present}", presentCount).replace("{total}", staff.length) : t("common_loading")}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-stone-700">{t("admin_staff_title")}</h3>
          <button onClick={load} className="text-xs text-[#6d5c42] font-medium flex items-center gap-1">
            <RefreshCw size={12} /> {t("admin_refresh")}
          </button>
        </div>
        {staff === null ? (
          <p className="text-sm text-stone-400 italic">{t("common_loading")}</p>
        ) : staffError ? (
          <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
            <p className="font-medium mb-1">{t("admin_staff_load_error")}</p>
            <p className="font-mono break-all">{staffError}</p>
            <p className="mt-2 text-rose-600">{t("admin_staff_check_sql")} <code>supabase-TODO-EN-UNO.sql</code>.</p>
          </div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-stone-400 italic">{t("admin_staff_no_role")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_email")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_role")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_today")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_password")}</th>
                  <th className="py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const seen = attendanceByEmail[s.email];
                  return (
                    <tr key={s.id} className="border-b border-stone-50">
                      <td className="py-1.5 pr-3 text-stone-700">{s.email}</td>
                      <td className="py-1.5 pr-3"><Badge tone="slate">{t("role_" + s.role)}</Badge></td>
                      <td className="py-1.5 pr-3">
                        {seen ? (
                          <Badge tone="green">{t("admin_entered_at")} {new Date(seen.first_seen_at).toLocaleTimeString(LOCALE_MAP[lang], { hour: "2-digit", minute: "2-digit" })}</Badge>
                        ) : (
                          <Badge tone="red">{t("admin_not_yet")}</Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        {s.must_change_password ? <Badge tone="yellow">{t("admin_password_pending")}</Badge> : <Badge tone="green">{t("admin_password_custom")}</Badge>}
                      </td>
                      <td className="py-1.5">
                        <button onClick={() => setResetTarget({ id: s.id, email: s.email })} className="text-[#6d5c42] font-medium">
                          {t("admin_reset_btn")}
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
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (newPassword.length < 8) { setError(t("admin_reset_min")); return; }
    setLoading(true);
    try {
      await adminResetPassword(target.id, newPassword);
      setDone(true);
      onDone();
    } catch (e) {
      setError(e.message || t("admin_reset_error"));
    }
    setLoading(false);
  };

  return (
    <Modal title={t("admin_reset_title").replace("{email}", target.email)} onClose={onClose}>
      {done ? (
        <div>
          <p className="text-sm text-stone-600 mb-2">{t("admin_reset_done_msg")}</p>
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm font-mono mb-3">{newPassword}</div>
          <p className="text-xs text-stone-400 mb-4">{t("admin_reset_done_hint")}</p>
          <button onClick={onClose} className={`w-full py-2.5 ${primaryBtn}`}>{t("admin_reset_close")}</button>
        </div>
      ) : (
        <div>
          <Field label={t("admin_reset_new_label")}>
            <input className={inputCls} type="text" maxLength={60} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("admin_reset_min")} />
          </Field>
          {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
          <button onClick={submit} disabled={loading} className={`w-full py-2.5 ${primaryBtn} disabled:opacity-60`}>
            {loading ? t("admin_reset_working") : t("admin_reset_submit")}
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
  const { t } = useTranslation();
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
  const expenseCategoryData = EXPENSE_CATEGORIES.map((c) => ({ categoria: t("ec_" + c), gasto: Math.round(expenseByCategory[c] * 100) / 100 })).filter((d) => d.gasto > 0);

  const addExpense = async (expense) => {
    await persistExpenses([{ ...expense, id: uid(), registeredBy: email }, ...expenses]);
    setShowExpenseForm(false);
  };
  const removeExpense = async (id) => { await persistExpenses(expenses.filter((e) => e.id !== id)); };

  const recentExpenses = [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-stone-700">{t("admin_finance_title")}</h3>
        <select value={rangeMonths} onChange={(e) => setRangeMonths(Number(e.target.value))} className={inputCls + " w-auto"}>
          <option value={6}>{t("admin_finance_range6")}</option>
          <option value={12}>{t("admin_finance_range12")}</option>
          <option value={24}>{t("admin_finance_range24")}</option>
        </select>
      </div>

      {/* KPIs generales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={TrendingUp} label={t("admin_kpi_income_month")} value={`${((thisMonth?.Hospedaje || 0) + (thisMonth?.Restaurante || 0)).toFixed(2)} €`} />
        <StatTile icon={BarChart3} label={t("admin_kpi_expenses_month")} value={`${(thisMonth?.Gastos || 0).toFixed(2)} €`} />
        <StatTile icon={Award} label={t("admin_kpi_net_total")} value={`${netTotal.toFixed(2)} €`} />
        <StatTile icon={Timer} label={t("admin_kpi_margin")} value={`${grossMargin.toFixed(1)} %`} />
      </div>

      {/* KPIs hoteleros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={BedDouble} label={t("admin_kpi_adr")} value={`${(thisMonth?.ADR || 0).toFixed(2)} €`} />
        <StatTile icon={BarChart3} label={t("admin_kpi_revpar")} value={`${(thisMonth?.RevPAR || 0).toFixed(2)} €`} />
        <StatTile icon={UtensilsCrossed} label={t("admin_kpi_expense_ratio")} value={`${(thisMonth?.RatioGastos || 0).toFixed(1)} %`} />
        <StatTile icon={Users} label={t("admin_kpi_avg_booking")} value={`${avgStayValue.toFixed(2)} € / ${avgBookingValue.toFixed(2)} €`} />
      </div>
      <p className="text-[11px] text-stone-400 -mt-2">
        {t("admin_adr_formula")}
      </p>

      <ChartCard title={t("admin_finance_range_prefix").replace("{n}", rangeMonths)} height={240}>
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
        <ChartCard title={t("admin_chart_mix")} height={210}>
          <PieChart>
            <Pie data={revenueMixData} dataKey="value" nameKey="name" outerRadius={70} label={(d) => `${d.name}: ${((d.value / (totalIncome || 1)) * 100).toFixed(0)}%`}>
              <Cell fill={CHART_GREEN} />
              <Cell fill={CHART_BLUE} />
            </Pie>
            <Tooltip formatter={(v) => `${v} €`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>

        <ChartCard title={t("admin_chart_ratio")} height={210}>
          <LineChart data={incomeByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v) => `${v} %`} />
            <Line type="monotone" dataKey="RatioGastos" stroke={CHART_ROSE} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard title={t("admin_chart_adr_revpar")} height={220}>
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
        <ChartCard title={t("admin_chart_expense_cat")} height={200}>
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
          <h4 className="text-sm font-semibold text-stone-700">{t("admin_expenses_title")}</h4>
          <button onClick={() => setShowExpenseForm(true)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 ${primaryBtn}`}>
            <Plus size={13} /> {t("admin_new_expense")}
          </button>
        </div>
        {recentExpenses.length === 0 ? (
          <p className="text-sm text-stone-400 italic">{t("admin_no_expenses")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_date")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_category")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_description")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_amount")}</th>
                  <th className="py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {recentExpenses.map((e) => (
                  <tr key={e.id} className="border-b border-stone-50">
                    <td className="py-1.5 pr-3 text-stone-400 whitespace-nowrap">{e.date}</td>
                    <td className="py-1.5 pr-3"><Badge tone="slate">{t("ec_" + e.category)}</Badge></td>
                    <td className="py-1.5 pr-3 text-stone-600">{e.description}</td>
                    <td className="py-1.5 pr-3 text-stone-800 font-medium whitespace-nowrap">{Number(e.amount).toFixed(2)} €</td>
                    <td className="py-1.5"><button onClick={() => removeExpense(e.id)} className="text-rose-600 font-medium">{t("common_delete")}</button></td>
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
  const { t } = useTranslation();
  const [form, setForm] = useState({ date: todayStr(), category: EXPENSE_CATEGORIES[0], description: "", amount: 0 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={t("admin_new_expense_title")} onClose={onClose}>
      <Field label={t("admin_col_date")}>
        <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
      </Field>
      <Field label={t("admin_expense_category_label")}>
        <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t("ec_" + c)}</option>)}
        </select>
      </Field>
      <Field label={t("admin_expense_desc_label")}>
        <input className={inputCls} maxLength={200} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={t("admin_expense_desc_ph")} />
      </Field>
      <MoneyField label={t("admin_col_amount")} value={form.amount} onChange={(v) => set("amount", v)} />
      <button onClick={() => form.description && form.amount > 0 && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>{t("admin_expense_save")}</button>
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

function AdminModule({ rooms, stays, bookings, tickets, salones, expenses, persistExpenses, persistStays, hotelStatus, persistHotelStatus, email }) {
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

  const downloadBackup = async (password) => {
    setBackupState("working");
    try {
      const backup = await requestBackup(password); // si la contraseña es incorrecta, lanza un error aquí
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
    } catch (e) {
      setBackupState("idle");
      throw e; // el modal muestra el mensaje concreto (p. ej. "Contraseña incorrecta")
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
                <p className="text-xs text-stone-400 mt-1">{t("admin_closed_by").replace("{date}", new Date(hotelStatus.closedAt).toLocaleString()).replace("{who}", hotelStatus.closedBy)}</p>
              )}
              {!hotelStatus.closed && hotelStatus.reopenedAt && (
                <p className="text-xs text-stone-400 mt-1">{t("admin_reopened_by").replace("{date}", new Date(hotelStatus.reopenedAt).toLocaleString()).replace("{who}", hotelStatus.reopenedBy)}</p>
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
            {backupState === "working" ? t("backup_preparing") : t("backup_button")}
          </button>
          {backupState === "done" && <span className="ml-2 text-xs text-emerald-700">{t("backup_downloaded")}</span>}
          {backupState === "error" && <span className="ml-2 text-xs text-rose-600">{t("backup_error")}</span>}
          {showBackupAuth && (
            <BackupPasswordModal
              onClose={() => setShowBackupAuth(false)}
              onSubmitPassword={(password) => downloadBackup(password)}
            />
          )}
        </div>
      )}

      {subtab === "personal" && <StaffPanel adminEmail={email} />}
      {subtab === "finanzas" && <FinanceModule stays={stays} bookings={bookings} expenses={expenses} persistExpenses={persistExpenses} email={email} />}

      {subtab === "hospedaje" && <OccupancyStats rooms={rooms} stays={stays} />}
      {subtab === "restaurante" && <RestaurantStats bookings={bookings} />}
      {subtab === "limpieza" && <HousekeepingStats rooms={rooms} auditLog={log || []} />}
      {subtab === "mantenimiento" && <MaintenanceStats tickets={tickets} salones={salones} auditLog={log || []} />}

      {subtab === "actividad" && (
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h3 className="font-semibold text-stone-700 mb-3">{t("admin_activity_title")}</h3>
        {log === null ? (
          <p className="text-sm text-stone-400 italic">{t("admin_activity_loading")}</p>
        ) : log.length === 0 ? (
          <p className="text-sm text-stone-400 italic">{t("admin_activity_none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_date_full")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_employee")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_role")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("admin_col_module")}</th>
                  <th className="py-1.5 font-medium">{t("admin_col_action")}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr key={row.id} className="border-b border-stone-50">
                    <td className="py-1.5 pr-3 text-stone-400 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-stone-700">{row.user_email}</td>
                    <td className="py-1.5 pr-3"><Badge tone="slate">{row.role ? t("role_" + row.role) : "—"}</Badge></td>
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
            {t("admin_close_confirm_desc").replace("{n}", activeStaysCount)}
          </p>
          <p className="text-xs text-rose-600 mb-4">{t("admin_close_confirm_warn")}</p>
          <div className="flex gap-2">
            <button onClick={closeHotel} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white">{t("admin_close_confirm_yes")}</button>
            <button onClick={() => setConfirming(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-stone-300 text-stone-600">{t("admin_confirm_cancel")}</button>
          </div>
        </Modal>
      )}
      {confirming === "open" && (
        <Modal title={t("open_hotel_btn")} onClose={() => setConfirming(null)}>
          <p className="text-sm text-stone-600 mb-4">{t("admin_open_confirm_desc")}</p>
          <div className="flex gap-2">
            <button onClick={openHotel} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${primaryBtn}`}>{t("admin_open_confirm_yes")}</button>
            <button onClick={() => setConfirming(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-stone-300 text-stone-600">{t("admin_confirm_cancel")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
