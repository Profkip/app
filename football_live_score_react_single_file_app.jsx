import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, SoccerBall, Star, StarOff, Wifi, WifiOff, Clock, RefreshCw, Settings, ChevronDown, X, Globe2 } from "lucide-react";

/**
 * Betascore – Single-file React App
 * ----------------------------------------------------
 * Features
 * - Live matches, upcoming fixtures, final scores
 * - Polling or WebSocket (if provided) with graceful fallback
 * - League + date filters, search, favorites, and sorting
 * - Compact and full card views; skeleton loaders and empty states
 * - Local storage persistence for settings + favorites
 * - Minimal, modern Tailwind UI with motion
 *
 * How to use (quick start)
 * 1) Drop this file into your React project and set it as the default export page/component.
 * 2) (Optional) Provide a working REST endpoint in Settings (e.g., your proxy to API-Football/Football-Data.org) that returns matches in the shape of `Match` below.
 * 3) (Optional) Provide a WebSocket URL that emits arrays of `Match` objects for real-time updates.
 * 4) Tailwind required. Enable Tailwind in your project. No other UI libs required.
 *
 * Data shape expected
 * type Match = {
 *   id: string | number
 *   utcKickoff: string // ISO string
 *   status: "NS" | "LIVE" | "HT" | "FT" | "AET" | "PEN" | "POST" | "SUSP" | "INT" | "ABAN" | "CAN"
 *   league: { id: string | number, name: string, country?: string, season?: string | number }
 *   home: { name: string, short?: string, id?: string | number, score?: number }
 *   away: { name: string, short?: string, id?: string | number, score?: number }
 *   minute?: number // live minute
 *   addedTime?: string // e.g. "+2"
 *   venue?: string
 * };
 */

// ------------------------- Utilities -------------------------
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function clsx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function formatKickoff(iso) {
  try {
    const d = new Date(iso);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(d);
    const day = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
      timeZone: tz,
    }).format(d);
    return `${day} • ${time}`;
  } catch {
    return iso;
  }
}

function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const key = fn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

const STORAGE_KEYS = {
  SETTINGS: "betascore_settings_v1",
  FAVORITES: "betascore_favorites_v1",
};

function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ------------------------- Mock Data -------------------------
const now = new Date();
const inMin = (m) => new Date(now.getTime() + m * 60000).toISOString();
const agoMin = (m) => new Date(now.getTime() - m * 60000).toISOString();

const MOCK_MATCHES = [
  {
    id: 101,
    utcKickoff: agoMin(50),
    status: "LIVE",
    minute: 38,
    addedTime: "+2",
    league: { id: 1, name: "Premier League", country: "England", season: "2025/26" },
    home: { name: "Arbor FC", short: "ARB", score: 1 },
    away: { name: "Seaside United", short: "SEA", score: 0 },
    venue: "Arbor Park",
  },
  {
    id: 102,
    utcKickoff: inMin(120),
    status: "NS",
    league: { id: 2, name: "La Liga", country: "Spain", season: "2025/26" },
    home: { name: "Ciudad CF", short: "CIU" },
    away: { name: "Montaña FC", short: "MON" },
    venue: "Estadio Central",
  },
  {
    id: 103,
    utcKickoff: agoMin(135),
    status: "FT",
    league: { id: 3, name: "Serie A", country: "Italy", season: "2025/26" },
    home: { name: "Borgo Calcio", short: "BOR", score: 2 },
    away: { name: "Torri SC", short: "TOR", score: 2 },
    venue: "Stadio Borgo",
  },
  {
    id: 104,
    utcKickoff: agoMin(10),
    status: "LIVE",
    minute: 9,
    league: { id: 4, name: "Bundesliga", country: "Germany", season: "2025/26" },
    home: { name: "Rhein 04", short: "R04", score: 0 },
    away: { name: "Alpen SV", short: "ALP", score: 1 },
    venue: "RheinArena",
  },
  {
    id: 105,
    utcKickoff: inMin(30),
    status: "NS",
    league: { id: 5, name: "Ligue 1", country: "France", season: "2025/26" },
    home: { name: "Côte Stade", short: "COT" },
    away: { name: "Vallée FC", short: "VAL" },
    venue: "Parc de la Côte",
  },
];

// ------------------------- API Adapter -------------------------
async function fetchMatchesREST(url, apiKey) {
  if (!url) return structuredClone(MOCK_MATCHES);
  const res = await fetch(url, {
    headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
  });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.matches || data.response || [];
}

// ------------------------- Components -------------------------
function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium shadow-sm">
      {children}
    </span>
  );
}

function StatusPill({ status }) {
  const live = status === "LIVE" || status === "HT";
  const ended = status === "FT" || status === "AET" || status === "PEN";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        live && "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
        ended && "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
        !live && !ended && "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
      )}
    >
      {live ? <Wifi className="h-3.5 w-3.5" /> : ended ? <Clock className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
      {status}
    </span>
  );
}

function FavoriteStar({ isFav, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="rounded-full p-1 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      title={isFav ? "Remove favorite" : "Add favorite"}
    >
      {isFav ? <Star className="h-5 w-5" /> : <StarOff className="h-5 w-5" />}
    </button>
  );
}

function MatchCard({ m, favoriteTeams, toggleFavorite, compact }) {
  const isFav = favoriteTeams.has(m.home.name) || favoriteTeams.has(m.away.name);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={clsx(
        "rounded-2xl border bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        compact ? "" : ""
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SoccerBall className="h-5 w-5 opacity-70" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <Badge>{m.league.name}</Badge>
              {m.league.country && <Badge>{m.league.country}</Badge>}
              <StatusPill status={m.status} />
            </div>
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {formatKickoff(m.utcKickoff)} {m.venue ? `• ${m.venue}` : ""}
            </div>
          </div>
        </div>
        <FavoriteStar isFav={isFav} onToggle={() => toggleFavorite(m)} />
      </div>

      <div className="mt-3 grid grid-cols-12 items-center gap-3">
        <div className="col-span-5 text-right">
          <div className="truncate text-sm font-medium">{m.home.name}</div>
        </div>
        <div className="col-span-2 text-center">
          {m.status === "NS" ? (
            <div className="text-lg font-semibold">vs</div>
          ) : (
            <div className="text-lg font-bold">
              {(m.home.score ?? 0)}<span className="mx-1">-</span>{(m.away.score ?? 0)}
            </div>
          )}
          {m.status === "LIVE" || m.status === "HT" ? (
            <div className="text-xs text-red-600 dark:text-red-400">{m.minute ? `${m.minute}'` : "LIVE"} {m.addedTime || ""}</div>
          ) : null}
        </div>
        <div className="col-span-5 text-left">
          <div className="truncate text-sm font-medium">{m.away.name}</div>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="h-4 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-3 h-6 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

function EmptyState({ title, subtitle, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border p-10 text-center dark:border-neutral-800">
      {Icon && <Icon className="mb-3 h-10 w-10 opacity-60" />}
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="h-5 w-9 rounded-full bg-neutral-300 peer-checked:bg-indigo-600 dark:bg-neutral-700" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

// ------------------------- Main App -------------------------
export default function BetascoreApp() {
  const [settings, setSettings] = useLocalStorage(STORAGE_KEYS.SETTINGS, {
    restUrl: "", // e.g. "/api/matches" (proxy to your provider)
    apiKey: "",
    websocketUrl: "", // e.g. "wss://your-socket"
    pollSeconds: 20,
    showOnlyLive: false,
    compact: false,
    timezone: tz,
  });
  const [favoriteTeamsSet, setFavoriteTeamsSet] = useLocalStorage(STORAGE_KEYS.FAVORITES, []);
  const favoriteTeams = useMemo(() => new Set(favoriteTeamsSet), [favoriteTeamsSet]);

  const [query, setQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const wsRef = useRef(null);

  // Fetch or connect
  useEffect(() => {
    let intervalId;
    async function pump() {
      try {
        setLoading(true);
        const data = await fetchMatchesREST(settings.restUrl, settings.apiKey);
        setMatches(Array.isArray(data) ? data : []);
        setError("");
        setLastUpdated(new Date().toISOString());
      } catch (e) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    // REST polling by default
    pump();
    if (settings.pollSeconds > 0) {
      intervalId = setInterval(pump, settings.pollSeconds * 1000);
    }

    // Optional WebSocket
    if (settings.websocketUrl) {
      try {
        const ws = new WebSocket(settings.websocketUrl);
        wsRef.current = ws;
        ws.onopen = () => console.log("WS connected");
        ws.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data);
            if (Array.isArray(parsed)) setMatches(parsed);
          } catch {}
        };
        ws.onerror = (e) => console.warn("WS error", e);
        ws.onclose = () => console.log("WS closed");
      } catch (e) {
        console.warn("WebSocket failed", e);
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [settings.restUrl, settings.apiKey, settings.pollSeconds, settings.websocketUrl]);

  // Derived lists
  const leagues = useMemo(() => {
    const by = groupBy(matches, (m) => m.league?.name || "Unknown");
    return Object.keys(by).sort();
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const todayStr = new Date().toDateString();

    return matches
      .filter((m) => (settings.showOnlyLive ? m.status === "LIVE" || m.status === "HT" : true))
      .filter((m) => (leagueFilter === "all" ? true : (m.league?.name || "").toLowerCase() === leagueFilter))
      .filter((m) => {
        if (dateFilter === "today") return new Date(m.utcKickoff).toDateString() === todayStr;
        if (dateFilter === "all") return true;
        return true;
      })
      .filter((m) =>
        q
          ? [m.home.name, m.away.name, m.league?.name, m.league?.country].some((s) => (s || "").toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
  }, [matches, settings.showOnlyLive, leagueFilter, dateFilter, query]);

  function toggleFavorite(m) {
    const home = m.home?.name;
    const away = m.away?.name;
    const next = new Set(favoriteTeams);
    if (next.has(home)) next.delete(home); else next.add(home);
    if (next.has(away)) next.delete(away); else next.add(away);
    setFavoriteTeamsSet(Array.from(next));
  }

  function setSetting(k, v) {
    setSettings((prev) => ({ ...prev, [k]: v }));
  }

  const grouped = useMemo(() => groupBy(filtered, (m) => m.league?.name || "Other"), [filtered]);

  return (
    <div className="min-h-screen bg-neutral-50 p-4 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      {/* Header */}
      <header className="mx-auto mb-4 flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div initial={{ rotate: -10, scale: 0.9 }} animate={{ rotate: 0, scale: 1 }} className="rounded-2xl bg-indigo-600 p-2 text-white shadow-md">
            <SoccerBall className="h-6 w-6" />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Betascore</h1>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Timezone: {settings.timezone} • {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : "Loading…"}</div>
          </div>
        </div>
        <SettingsSheet settings={settings} onChange={setSetting} />
      </header>

      {/* Controls */}
      <div className="mx-auto mb-4 grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <Search className="ml-1 h-5 w-5 opacity-60" />
            <input
              className="w-full bg-transparent p-2 text-sm outline-none"
              placeholder="Search team, league, country…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="md:col-span-3">
          <Select value={leagueFilter} onChange={setLeagueFilter} label="League">
            <option value="all">All leagues</option>
            {leagues.map((l) => (
              <option key={l} value={l.toLowerCase()}>{l}</option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-2">
          <Select value={dateFilter} onChange={setDateFilter} label="Date">
            <option value="today">Today</option>
            <option value="all">All</option>
          </Select>
        </div>
        <div className="md:col-span-2 flex items-center justify-between rounded-2xl border bg-white p-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Toggle checked={settings.showOnlyLive} onChange={(v) => setSetting("showOnlyLive", v)} label="Live only" />
          <Toggle checked={settings.compact} onChange={(v) => setSetting("compact", v)} label="Compact" />
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-6xl">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState title="Could not load matches" subtitle={error} icon={WifiOff} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches found" subtitle="Try changing filters or search" icon={Search} />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([leagueName, ms]) => (
              <section key={leagueName}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge>{leagueName}</Badge>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{ms.length} matches</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <AnimatePresence>
                    {ms.map((m) => (
                      <MatchCard key={m.id} m={m} favoriteTeams={favoriteTeams} toggleFavorite={toggleFavorite} compact={settings.compact} />)
                    )}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mx-auto mt-8 max-w-6xl py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
        Built with ❤️ — polling every {settings.pollSeconds}s {settings.websocketUrl ? " + WebSocket" : ""}
      </footer>
    </div>
  );
}

function Select({ value, onChange, label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <span className="truncate">{label}: <span className="font-medium">{displayValue(value)}</span></span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-2xl border bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <div className="max-h-56 overflow-auto text-sm">
            {React.Children.map(children, (child) =>
              React.isValidElement(child) ? (
                <button
                  key={child.props.value}
                  onClick={() => {
                    onChange(child.props.value);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800",
                    value === child.props.value && "bg-neutral-100 dark:bg-neutral-800"
                  )}
                >
                  <span>{child.props.children}</span>
                  {value === child.props.value ? <span className="text-xs">✓</span> : null}
                </button>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function displayValue(v) {
  if (!v) return "";
  return String(v).charAt(0).toUpperCase() + String(v).slice(1);
}

function SettingsSheet({ settings, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
      >
        <Settings className="h-4 w-4" />
        Settings
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              className="absolute inset-x-0 bottom-0 z-50 mx-auto w-full max-w-xl rounded-t-3xl border bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-3xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold"><Settings className="h-4 w-4"/> Betascore Settings</div>
                <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X className="h-4 w-4"/></button>
              </div>
              <div className="space-y-3 text-sm">
                <LabeledInput label="REST URL" value={settings.restUrl} placeholder="https://your-proxy.example.com/matches" onChange={(v) => onChange("restUrl", v)} />
                <LabeledInput label="API Key (optional header: X-Api-Key)" value={settings.apiKey} placeholder="sk_..." onChange={(v) => onChange("apiKey", v)} />
                <LabeledInput label="WebSocket URL (optional)" value={settings.websocketUrl} placeholder="wss://your-socket.example.com/live" onChange={(v) => onChange("websocketUrl", v)} />
                <LabeledInput label="Polling seconds" type="number" value={String(settings.pollSeconds)} onChange={(v) => onChange("pollSeconds", Number(v || 0))} />
                <div className="flex items-center justify-between">
                  <Toggle checked={settings.showOnlyLive} onChange={(v) => onChange("showOnlyLive", v)} label="Show live only" />
                  <Toggle checked={settings.compact} onChange={(v) => onChange("compact", v)} label="Compact cards" />
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4"/>
                  <span>Detected Timezone:</span>
                  <Badge>{settings.timezone}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <RefreshCw className="h-3.5 w-3.5"/> Data updates automatically via polling. If a WebSocket URL is provided, real-time pushes will also update the list.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function LabeledInput({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border bg-white px-3 py-2 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-900"
      />
    </label>
  );
}
