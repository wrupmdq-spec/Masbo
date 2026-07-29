import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, BedDouble, UtensilsCrossed, Sparkles, Wrench,
  Plus, X, RefreshCw, Users, Phone, StickyNote, Clock, ChevronDown,
  CheckCircle2, AlertTriangle, Circle, Search, CalendarDays, MapPin, Grape,
  CalendarRange, ChevronLeft, ChevronRight, ShieldAlert
} from "lucide-react";
import { loadShared, saveShared } from "./supabaseClient";

/* ---------------------------------------------------------------------- */
/* Identidad Mas Boronat — masía del s. XVII, Salomó (Tarragona)          */
/* ---------------------------------------------------------------------- */

// Tipos de alquiler reales de Mas Boronat, con capacidad máxima de huéspedes por unidad
const CATEGORIAS = [
  { type: "Cataluña", numbers: Array.from({ length: 10 }, (_, i) => i + 1), capacity: 4 },
  { type: "Flandes", numbers: Array.from({ length: 8 }, (_, i) => i + 1), capacity: 4 },
  { type: "Hotel", numbers: Array.from({ length: 11 }, (_, i) => i + 1), capacity: 2 },
  { type: "Mercator", numbers: [null], capacity: 12 },
  { type: "Amberes", numbers: [2, 3, 4], capacity: 4 },
  { type: "Masía Suites", numbers: Array.from({ length: 9 }, (_, i) => i + 1), capacity: 2 },
  { type: "Masía Aparts", numbers: [1, 2], capacity: 4 },
];

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
const EVENT_SPACES = [
  "Patio Central (Masía s. XVII)", "Salón Principal", "Jardines", "Sala de Reuniones",
  "Restaurante", "Zona de Piscinas", "Museo del Vino y del Aceite", "Otro",
];

const PLANNING_MIN = "2026-07";
const PLANNING_MAX = "2027-12";

const ROLES = {
  reception: {
    label: "Recepción",
    tabs: ["dashboard", "guests", "restaurant", "housekeeping", "maintenance", "events", "planning"],
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

const TAB_META = {
  dashboard: { label: "Resumen", icon: LayoutDashboard },
  guests: { label: "Huéspedes y Alojamientos", icon: BedDouble },
  restaurant: { label: "Restaurante", icon: UtensilsCrossed },
  housekeeping: { label: "Limpieza", icon: Sparkles },
  maintenance: { label: "Mantenimiento", icon: Wrench },
  events: { label: "Eventos", icon: CalendarDays },
  planning: { label: "Planning", icon: CalendarRange },
};

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
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500";
const primaryBtn = "bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-xl text-sm";
const selectedToggle = "bg-amber-700 text-white border-amber-700";
const unselectedToggle = "border-stone-300 text-stone-600";

/* ---------------------------------------------------------------------- */
/* Aplicación principal                                                    */
/* ---------------------------------------------------------------------- */

export default function MasBoronatOps() {
  const [role, setRole] = useState("reception");
  const [tab, setTab] = useState("dashboard");
  const [rooms, setRooms] = useState(null);
  const [stays, setStays] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [events, setEvents] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const refreshAll = useCallback(async (initial = false) => {
    setSyncing(true);
    const [r, st, b, t, ev] = await Promise.all([
      loadShared(KEYS.rooms, null),
      loadShared(KEYS.stays, null),
      loadShared(KEYS.bookings, null),
      loadShared(KEYS.tickets, null),
      loadShared(KEYS.events, null),
    ]);
    if (initial) {
      const seededRooms = r || seedRooms();
      setRooms(seededRooms);
      setStays(st || []);
      setBookings(b || []);
      setTickets(t || []);
      setEvents(ev || []);
      if (!r) await saveShared(KEYS.rooms, seededRooms);
      if (!st) await saveShared(KEYS.stays, []);
      if (!b) await saveShared(KEYS.bookings, []);
      if (!t) await saveShared(KEYS.tickets, []);
      if (!ev) await saveShared(KEYS.events, []);
    } else {
      if (r) setRooms(r);
      if (st) setStays(st);
      if (b) setBookings(b);
      if (t) setTickets(t);
      if (ev) setEvents(ev);
    }
    setLastSync(new Date());
    setSyncing(false);
  }, []);

  useEffect(() => {
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
  }, [refreshAll]);

  const persistRooms = async (next) => { setRooms(next); await saveShared(KEYS.rooms, next); };
  const persistStays = async (next) => { setStays(next); await saveShared(KEYS.stays, next); };
  const persistBookings = async (next) => { setBookings(next); await saveShared(KEYS.bookings, next); };
  const persistTickets = async (next) => { setTickets(next); await saveShared(KEYS.tickets, next); };
  const persistEvents = async (next) => { setEvents(next); await saveShared(KEYS.events, next); };

  const cfg = ROLES[role];
  const canEdit = (module) => cfg.edit.includes(module);
  useEffect(() => {
    if (!cfg.tabs.includes(tab)) setTab(cfg.tabs[0]);
  }, [role]); // eslint-disable-line

  if (!rooms || !stays || !bookings || !tickets || !events) {
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
      <TopBar role={role} setRole={setRole} lastSync={lastSync} syncing={syncing} onRefresh={() => refreshAll(false)} />
      <TabNav tabs={cfg.tabs} tab={tab} setTab={setTab} />

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-5 pb-16">
        {tab === "dashboard" && <Dashboard rooms={rooms} stays={stays} bookings={bookings} tickets={tickets} events={events} setTab={setTab} />}
        {tab === "guests" && <GuestsModule rooms={rooms} stays={stays} persistStays={persistStays} editable={canEdit("guests")} />}
        {tab === "restaurant" && <RestaurantModule stays={stays} bookings={bookings} persistBookings={persistBookings} editable={canEdit("restaurant")} />}
        {tab === "housekeeping" && <HousekeepingModule rooms={rooms} persistRooms={persistRooms} editable={canEdit("housekeeping")} />}
        {tab === "maintenance" && <MaintenanceModule tickets={tickets} persistTickets={persistTickets} editable={canEdit("maintenance")} />}
        {tab === "events" && <EventsModule events={events} persistEvents={persistEvents} editable={canEdit("events")} />}
        {tab === "planning" && <PlanningModule stays={stays} bookings={bookings} events={events} />}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Barra superior y navegación                                             */
/* ---------------------------------------------------------------------- */

function TopBar({ role, setRole, lastSync, syncing, onRefresh }) {
  return (
    <header className="bg-emerald-950 text-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-600/30 flex items-center justify-center shrink-0 border border-amber-500/40">
            <Grape size={19} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight text-sm sm:text-base truncate tracking-wide">Mas Boronat</h1>
            <p className="text-emerald-300 text-[11px] leading-tight hidden sm:block">Masía s. XVII · Salomó, Tarragona — Gestión operativa</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onRefresh} className="p-2 rounded-full hover:bg-emerald-900 text-emerald-200" title="Actualizar ahora">
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          </button>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="appearance-none bg-emerald-900 hover:bg-emerald-800 text-white text-xs sm:text-sm font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              {Object.entries(ROLES).map(([key, r]) => (
                <option key={key} value={key} className="text-stone-900">{r.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-1.5 -mt-1 text-[10px] text-emerald-300 flex items-center gap-1.5">
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
        </span>
        En vivo{lastSync ? ` · última actualización ${lastSync.toLocaleTimeString()}` : ""}
      </div>
    </header>
  );
}

function TabNav({ tabs, tab, setTab }) {
  return (
    <nav className="bg-white border-b border-stone-200 sticky top-[57px] sm:top-[61px] z-20 overflow-x-auto">
      <div className="max-w-6xl mx-auto px-2 sm:px-6 flex gap-1">
        {tabs.map((t) => {
          const meta = TAB_META[t];
          const Icon = meta.icon;
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active ? "border-amber-600 text-amber-800" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              <Icon size={16} />
              {meta.label}
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
  const t = todayStr();
  const staysToday = stays.filter((s) => s.status !== "Cancelada" && s.checkIn <= t && t <= s.checkOut);
  const unidadesOcupadas = new Set(staysToday.map((s) => s.roomId)).size;
  const personasAlojadas = staysToday.reduce((sum, s) => sum + (Number(s.numGuests) || 0), 0);
  const sucias = rooms.filter((r) => r.cleaningStatus === "Sucia").length;
  const inspeccion = rooms.filter((r) => r.cleaningStatus === "Inspección Necesaria").length;
  const ticketsAbiertos = tickets.filter((tk) => tk.status !== "Resuelto").length;
  const ticketsAltos = tickets.filter((tk) => tk.status !== "Resuelto" && tk.priority === "Alta").length;
  const reservasHoy = bookings.filter((b) => b.date === t).length;
  const eventosHoy = events.filter((e) => e.date === t && e.status !== "Cancelado").length;

  const cards = [
    { label: "Unidades ocupadas hoy", value: `${unidadesOcupadas}/${rooms.length}`, tone: "green", icon: BedDouble, onClick: () => setTab("guests") },
    { label: "Ocupación total (personas)", value: `${personasAlojadas}/${TOTAL_CAPACITY}`, tone: "blue", icon: Users, onClick: () => setTab("guests") },
    { label: "Unidades por limpiar", value: sucias + inspeccion, tone: sucias + inspeccion > 0 ? "yellow" : "green", icon: Sparkles, onClick: () => setTab("housekeeping") },
    { label: "Reservas de hoy en restaurante", value: reservasHoy, tone: "blue", icon: UtensilsCrossed, onClick: () => setTab("restaurant") },
    { label: "Tickets de mantenimiento abiertos", value: ticketsAbiertos, tone: ticketsAltos > 0 ? "red" : "slate", icon: Wrench, onClick: () => setTab("maintenance") },
    { label: "Eventos de hoy", value: eventosHoy, tone: "purple", icon: CalendarDays, onClick: () => setTab("events") },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {cards.map((c, i) => (
          <button key={i} onClick={c.onClick} className="bg-white rounded-2xl p-4 text-left border border-stone-200 hover:border-amber-300 hover:shadow-md transition-all">
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
          <h3 className="font-semibold text-stone-700 mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-rose-500" /> Mantenimiento de alta prioridad</h3>
          {tickets.filter((tk) => tk.priority === "Alta" && tk.status !== "Resuelto").length === 0 ? (
            <p className="text-sm text-stone-400">Nada urgente por ahora.</p>
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
          <h3 className="font-semibold text-stone-700 mb-3 flex items-center gap-2"><CalendarDays size={16} className="text-violet-500" /> Próximos eventos</h3>
          {events.filter((e) => e.date >= t && e.status !== "Cancelado").length === 0 ? (
            <p className="text-sm text-stone-400">No hay eventos próximos.</p>
          ) : (
            <ul className="space-y-2">
              {events.filter((e) => e.date >= t && e.status !== "Cancelado").sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6).map((e) => (
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

function GuestsModule({ rooms, stays, persistStays, editable }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [newStayFor, setNewStayFor] = useState(null); // roomId
  const [editingStay, setEditingStay] = useState(null); // stay object

  const filtered = rooms.filter((r) => {
    const matchesType = typeFilter === "Todos" || r.type === typeFilter;
    if (!matchesType) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    if (unitLabel(r).toLowerCase().includes(q)) return true;
    return stays.some((s) => s.roomId === r.id && (s.guestName || "").toLowerCase().includes(q));
  });

  const upsert = async (stay) => {
    let next;
    if (stay.id) next = stays.map((s) => (s.id === stay.id ? stay : s));
    else next = [...stays, { ...stay, id: uid() }];
    await persistStays(next);
    setNewStayFor(null);
    setEditingStay(null);
  };
  const remove = async (id) => { await persistStays(stays.filter((s) => s.id !== id)); };

  const stayModalRoom = newStayFor ? rooms.find((r) => r.id === newStayFor) : editingStay ? rooms.find((r) => r.id === editingStay.roomId) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Huéspedes y Alojamientos</h2>
          <p className="text-xs text-stone-400">Cada unidad puede tener varias reservas: pasadas, en curso y futuras</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + " w-auto"}>
            {["Todos", ...TIPOS_ALOJAMIENTO].map((t) => <option key={t}>{t}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar alojamiento o huésped"
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500 w-40 sm:w-56"
            />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((r) => {
          const roomStays = stays
            .filter((s) => s.roomId === r.id)
            .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
          const current = roomStays.find((s) => s.status !== "Cancelada" && stayTiming(s) === "En curso");

          return (
            <div key={r.id} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-stone-800">{unitLabel(r)}</span>
                  <span className="block text-[11px] text-stone-400">Capacidad: {r.capacity} pers.</span>
                </div>
                <Badge tone={current ? "green" : "slate"}>{current ? "Ocupada hoy" : "Libre hoy"}</Badge>
              </div>

              {roomStays.length === 0 ? (
                <p className="text-sm text-stone-400 italic mb-2">Sin reservas registradas.</p>
              ) : (
                <ul className="space-y-1.5 mb-2">
                  {roomStays.map((s) => (
                    <li key={s.id} className="text-xs border border-stone-100 rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-stone-700">{s.guestName || "Sin nombre"}</span>
                        <Badge tone={stayTone(s)}>{s.status === "Cancelada" ? "Cancelada" : stayTiming(s)}</Badge>
                      </div>
                      <div className="text-stone-400 mt-0.5">{s.checkIn} → {s.checkOut} · {s.numGuests} pers. · {s.mealPlan}</div>
                      {editable && (
                        <div className="flex gap-3 mt-1">
                          <button onClick={() => setEditingStay(s)} className="text-amber-800 font-medium">Editar</button>
                          <button onClick={() => remove(s.id)} className="text-rose-600 font-medium">Eliminar</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {editable && (
                <button onClick={() => setNewStayFor(r.id)} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg py-2">
                  <Plus size={13} /> Nueva reserva para {unitLabel(r)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(newStayFor || editingStay) && stayModalRoom && (
        <StayModal
          room={stayModalRoom}
          stay={editingStay}
          otherStays={stays.filter((s) => s.roomId === stayModalRoom.id && s.id !== editingStay?.id)}
          onClose={() => { setNewStayFor(null); setEditingStay(null); }}
          onSave={upsert}
        />
      )}
    </div>
  );
}

function StayModal({ room, stay, otherStays, onClose, onSave }) {
  const [form, setForm] = useState(
    stay || { roomId: room.id, roomLabel: unitLabel(room), guestName: "", checkIn: todayStr(), checkOut: todayStr(), numGuests: 1, mealPlan: "Ninguno", status: "Confirmada" }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const conflicts = otherStays.filter(
    (s) => s.status !== "Cancelada" && form.checkIn && form.checkOut && rangesOverlap(form.checkIn, form.checkOut, s.checkIn, s.checkOut)
  );

  return (
    <Modal title={`${unitLabel(room)} · capacidad ${room.capacity} pers.`} onClose={onClose}>
      <Field label="Nombre del huésped">
        <input className={inputCls} value={form.guestName} onChange={(e) => set("guestName", e.target.value)} />
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

function RestaurantModule({ stays, bookings, persistBookings, editable }) {
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
          {editable && (
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
                      </div>
                      {b.menuNotes && (
                        <div className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1 mt-1.5 flex items-start gap-1">
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
                      {editable && (
                        <div className="flex gap-3 mt-2">
                          <button onClick={() => setEditingId(b.id)} className="text-xs text-amber-800 font-medium">Editar</button>
                          <button onClick={() => remove(b.id)} className="text-xs text-rose-600 font-medium">Eliminar</button>
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
      menuNotes: "", allergens: "", notes: "",
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
            <input className={inputCls} value={form.guestName} onChange={(e) => set("guestName", e.target.value)} />
          </Field>
          <Field label="Datos de contacto">
            <input className={inputCls} value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Teléfono o email" />
          </Field>
        </>
      )}

      <Field label="Número de personas">
        <input type="number" min="1" className={inputCls} value={form.numPeople} onChange={(e) => set("numPeople", Number(e.target.value))} />
      </Field>
      <Field label="Menú / platos previstos">
        <textarea className={inputCls} rows={2} value={form.menuNotes} onChange={(e) => set("menuNotes", e.target.value)} placeholder="p. ej. Calçotada completa, menú degustación…" />
      </Field>
      <Field label="Alérgenos / restricciones alimentarias">
        <textarea className={inputCls} rows={2} value={form.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="p. ej. alergia a frutos secos, sin gluten…" />
      </Field>
      <Field label="Otras peticiones (mesa, ocasión especial…)">
        <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="p. ej. mesa junto al patio, aniversario…" />
      </Field>

      <button onClick={() => onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Guardar reserva</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Limpieza                                                                 */
/* ---------------------------------------------------------------------- */

function HousekeepingModule({ rooms, persistRooms, editable }) {
  const [noteEditing, setNoteEditing] = useState(null);

  const cycleStatus = async (id) => {
    const current = rooms.find((r) => r.id === id);
    const nextStatus = CLEAN_STATUSES[(CLEAN_STATUSES.indexOf(current.cleaningStatus) + 1) % CLEAN_STATUSES.length];
    await persistRooms(rooms.map((r) => (r.id === id ? { ...r, cleaningStatus: nextStatus } : r)));
  };
  const saveNote = async (id, note) => {
    await persistRooms(rooms.map((r) => (r.id === id ? { ...r, cleaningNotes: note } : r)));
    setNoteEditing(null);
  };
  const icon = (status) => {
    if (status === "Limpia") return <CheckCircle2 size={16} />;
    if (status === "Sucia") return <AlertTriangle size={16} />;
    if (status === "En Progreso") return <RefreshCw size={16} />;
    return <Circle size={16} />;
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-stone-800 mb-4">Limpieza — Estado de Alojamientos</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {rooms.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-stone-800">{unitLabel(r)}</span>
              <Badge tone={cleanTone(r.cleaningStatus)}>
                <span className="flex items-center gap-1">{icon(r.cleaningStatus)} {r.cleaningStatus}</span>
              </Badge>
            </div>
            {editable ? (
              <button onClick={() => cycleStatus(r.id)} className="w-full text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg py-2 mb-2">
                Toca para actualizar estado →
              </button>
            ) : null}
            {r.cleaningNotes && (
              <div className="text-xs text-stone-500 bg-stone-50 rounded-md px-2 py-1 mb-2 flex items-start gap-1">
                <StickyNote size={11} className="mt-0.5 shrink-0" /> {r.cleaningNotes}
              </div>
            )}
            {editable && (
              noteEditing === r.id ? (
                <NoteInline initial={r.cleaningNotes} onSave={(v) => saveNote(r.id, v)} onCancel={() => setNoteEditing(null)} />
              ) : (
                <button onClick={() => setNoteEditing(r.id)} className="text-xs text-amber-800 font-medium">
                  {r.cleaningNotes ? "Editar nota" : "+ Añadir nota"}
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NoteInline({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial || "");
  return (
    <div>
      <textarea className={inputCls} rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder="p. ej. toallas extra, petición del huésped" />
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => onSave(v)} className="text-xs font-medium bg-amber-700 text-white rounded-md px-2.5 py-1">Guardar</button>
        <button onClick={onCancel} className="text-xs font-medium text-stone-500">Cancelar</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mantenimiento                                                             */
/* ---------------------------------------------------------------------- */

function MaintenanceModule({ tickets, persistTickets, editable }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("Todos");

  const create = async (ticket) => {
    await persistTickets([{ ...ticket, id: uid(), timestamp: new Date().toISOString() }, ...tickets]);
    setShowForm(false);
  };
  const updateStatus = async (id, status) => { await persistTickets(tickets.map((t) => (t.id === id ? { ...t, status } : t))); };
  const remove = async (id) => { await persistTickets(tickets.filter((t) => t.id !== id)); };

  const sorted = [...tickets].sort((a, b) => {
    const order = { Alta: 0, Media: 1, Baja: 2 };
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  const filtered = filter === "Todos" ? sorted : sorted.filter((t) => t.status === filter);

  return (
    <div>
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
              {editable && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-2">
                    {TICKET_STATUSES.map((s) => (
                      <button key={s} onClick={() => updateStatus(t.id, s)} className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${t.status === s ? selectedToggle : unselectedToggle}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => remove(t.id)} className="text-xs text-rose-600 font-medium">Eliminar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && <TicketModal onClose={() => setShowForm(false)} onSave={create} />}
    </div>
  );
}

function TicketModal({ onClose, onSave }) {
  const [form, setForm] = useState({ location: "", issue: "", priority: "Media", status: "Pendiente", assignedTo: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title="Nuevo ticket de mantenimiento" onClose={onClose}>
      <Field label="Alojamiento / zona">
        <input className={inputCls} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="p. ej. Flandes 3, Restaurante, Zona de Piscinas" />
      </Field>
      <Field label="Descripción del problema">
        <textarea className={inputCls} rows={2} value={form.issue} onChange={(e) => set("issue", e.target.value)} placeholder="p. ej. aire acondicionado gotea, luz fundida" />
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
        <input className={inputCls} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} />
      </Field>
      <button onClick={() => form.location && form.issue && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Crear ticket</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Eventos                                                                   */
/* ---------------------------------------------------------------------- */

function EventsModule({ events, persistEvents, editable }) {
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
                <div className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1 mt-2 flex items-start gap-1">
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
              {editable && (
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setEditingId(e.id)} className="text-xs text-amber-800 font-medium">Editar</button>
                  <button onClick={() => remove(e.id)} className="text-xs text-rose-600 font-medium">Eliminar</button>
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
        <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="p. ej. Boda García-Ruiz, Retiro corporativo Acme" />
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
          <input className={inputCls} value={form.responsible} onChange={(e) => set("responsible", e.target.value)} placeholder="Nombre del encargado" />
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
        <textarea className={inputCls} rows={2} value={form.menuNotes} onChange={(e) => set("menuNotes", e.target.value)} placeholder="p. ej. Menú degustación 4 platos, cóctel de bienvenida…" />
      </Field>
      <Field label="Alérgenos / restricciones alimentarias">
        <textarea className={inputCls} rows={2} value={form.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="p. ej. 2 comensales sin gluten, alergia a marisco…" />
      </Field>
      <Field label="Notas logísticas">
        <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Montaje, equipo audiovisual, decoración…" />
      </Field>
      <button onClick={() => form.title && onSave(form)} className={`w-full mt-2 py-2.5 ${primaryBtn}`}>Guardar evento</button>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Planning — calendario compartido hasta 2027                              */
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
          <p className="text-xs text-stone-400">Vista compartida de alojamientos, reservas y eventos, de julio 2026 a diciembre 2027</p>
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
                  isSelected ? "border-amber-600 bg-amber-50" : isToday ? "border-amber-400 bg-amber-50/40" : "border-stone-100 hover:bg-stone-50"
                }`}
              >
                <span className={`text-[11px] ${isToday ? "font-bold text-amber-800" : "text-stone-600"}`}>{dayNum}</span>
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
