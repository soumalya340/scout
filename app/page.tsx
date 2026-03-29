"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  MapPin,
  Plus,
  X,
  RefreshCw,
  Target,
  Globe,
  Search,
  Zap,
  Loader2,
  Lock,
  Timer,
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";

const ACCESS_CODE = "FOMOFAM123";
const SCOUT_ACCESS_KEY = "fomofam_scout_access";

const API = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}/api`;

/** TinyFish goal for Event Concierge (aligned with search_index-style extraction). */
const EVENT_SCRAPE_GOAL =
  "Extract all events: name, date, location. Return as JSON array.";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Source = {
  url: string;
  name: string;
  isDefault?: boolean;
  discovered?: boolean;
};

type ResultsMap = Record<string, unknown>;

type ScrapedRow = Record<string, unknown>;

function axiosDetail(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const data = err.response?.data;
  if (data && typeof data === "object" && data !== null) {
    const d = (data as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string") return e;
  }
  return undefined;
}

function pickStr(row: ScrapedRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

const DEFAULT_EVENT_SOURCES = [
  { url: 'https://solana.com/events', name: 'Solana Events', isDefault: true },
  { url: 'https://cryptonomads.org/', name: 'Crypto Nomads', isDefault: true },
  { url: 'https://ethglobal.com/events', name: 'ETH Global', isDefault: true },
];

const DEFAULT_OPPORTUNITY_SOURCES = [
  { url: 'https://crypto.jobs/', name: 'Crypto Jobs', isDefault: true },
  { url: 'https://web3.career/', name: 'Web3 Career', isDefault: true },
  { url: 'https://gitcoin.co/grants', name: 'Gitcoin Grants', isDefault: true },
  { url: 'https://devfolio.co/hackathons', name: 'Devfolio Hackathons', isDefault: true },
];

export default function ScoutPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"events" | "opportunities">("events");
  const [hasAccess, setHasAccess] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    try {
      setHasAccess(sessionStorage.getItem(SCOUT_ACCESS_KEY) === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const handleAccessSubmit = () => {
    if (accessCode.trim() === ACCESS_CODE) {
      sessionStorage.setItem(SCOUT_ACCESS_KEY, 'true');
      setHasAccess(true);
      setAccessError('');
    } else {
      setAccessError('Invalid access code. Please try again.');
    }
  };

  // Event Concierge state
  const [eventSources, setEventSources] = useState<Source[]>(DEFAULT_EVENT_SOURCES);
  const [newEventUrl, setNewEventUrl] = useState('');
  const [eventResults, setEventResults] = useState<ResultsMap>({});
  const [eventScraping, setEventScraping] = useState(false);
  const [eventError, setEventError] = useState("");
  const [eventScrapeElapsed, setEventScrapeElapsed] = useState(0);
  const [eventServerDurationMs, setEventServerDurationMs] = useState<number | null>(null);

  // Opportunity Hunter state
  const [opportunitySources, setOpportunitySources] = useState<Source[]>(DEFAULT_OPPORTUNITY_SOURCES);
  const [newOpportunityUrl, setNewOpportunityUrl] = useState('');
  const [opportunitySearchQuery, setOpportunitySearchQuery] = useState('');
  const [opportunitySearching, setOpportunitySearching] = useState(false);
  const [opportunityGoal, setOpportunityGoal] = useState('');
  const [opportunityResults, setOpportunityResults] = useState<ResultsMap>({});
  const [opportunityScraping, setOpportunityScraping] = useState(false);
  const [opportunityError, setOpportunityError] = useState("");
  const [oppScrapeElapsed, setOppScrapeElapsed] = useState(0);
  const [oppServerDurationMs, setOppServerDurationMs] = useState<number | null>(null);

  useEffect(() => {
    loadCachedResults();
  }, []);

  useEffect(() => {
    if (!eventScraping) {
      setEventScrapeElapsed(0);
      return;
    }
    const start = Date.now();
    setEventScrapeElapsed(0);
    const id = window.setInterval(() => {
      setEventScrapeElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [eventScraping]);

  useEffect(() => {
    if (!opportunityScraping) {
      setOppScrapeElapsed(0);
      return;
    }
    const start = Date.now();
    setOppScrapeElapsed(0);
    const id = window.setInterval(() => {
      setOppScrapeElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [opportunityScraping]);

  const loadCachedResults = async () => {
    try {
      const [eventsRes, oppsRes] = await Promise.all([
        axios.get(`${API}/scout/events`),
        axios.get(`${API}/scout/opportunities`),
      ]);
      if (eventsRes.data.results) setEventResults(eventsRes.data.results);
      if (oppsRes.data.results) setOpportunityResults(oppsRes.data.results);
    } catch {
      console.error('Failed to load cached results');
    }
  };

  const addSource = (
    sources: Source[],
    setSources: Dispatch<SetStateAction<Source[]>>,
    url: string
  ) => {
    if (!url || sources.find((s) => s.url === url)) return;
    try {
      setSources([...sources, { url, name: new URL(url).hostname, isDefault: false }]);
    } catch {
      /* invalid URL */
    }
  };

  const removeSource = (
    sources: Source[],
    setSources: Dispatch<SetStateAction<Source[]>>,
    url: string
  ) => {
    setSources(sources.filter((s) => s.url !== url));
  };

  const searchWeb = async (
    query: string,
    sources: Source[],
    setSources: Dispatch<SetStateAction<Source[]>>,
    setSearching: Dispatch<SetStateAction<boolean>>,
    setError: Dispatch<SetStateAction<string>>
  ) => {
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    try {
      const res = await axios.post<{ urls?: { url: string; name?: string }[] }>(
        "/api/search-urls",
        { query, count: 5 }
      );
      const newUrls: { url: string; name?: string }[] = res.data.urls ?? [];
      const existingUrls = new Set(sources.map((s) => s.url));
      const discovered: Source[] = newUrls
        .filter((u) => !existingUrls.has(u.url))
        .map((u) => {
          let name = u.name;
          if (!name) {
            try {
              name = new URL(u.url).hostname;
            } catch {
              name = u.url;
            }
          }
          return {
            url: u.url,
            name,
            isDefault: false,
            discovered: true,
          };
        });
      if (discovered.length > 0) {
        setSources((prev) => [...prev, ...discovered]);
      } else {
        setError("No new sources found. Try a different search query.");
      }
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  };

  const parseResults = (data: unknown): ScrapedRow[] => {
    if (!data) return [];
    if (typeof data === "object" && data !== null && "error" in data) {
      const msg = (data as { error: unknown }).error;
      return [
        {
          title: "Scrape error",
          description: typeof msg === "string" ? msg : String(msg),
        },
      ];
    }
    if (Array.isArray(data)) return data as ScrapedRow[];
    if (typeof data === "string") {
      try {
        const parsed: unknown = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed as ScrapedRow[];
        if (parsed && typeof parsed === "object") {
          const o = parsed as Record<string, unknown>;
          const a = o.events ?? o.opportunities ?? o.results;
          return Array.isArray(a) ? (a as ScrapedRow[]) : [];
        }
        return [];
      } catch {
        return [];
      }
    }
    if (typeof data === "object" && data !== null) {
      const o = data as Record<string, unknown>;
      const a = o.events ?? o.opportunities ?? o.results;
      return Array.isArray(a) ? (a as ScrapedRow[]) : [];
    }
    return [];
  };

  // --- Event handlers ---
  const handleEventScrape = async () => {
    setEventScraping(true);
    setEventError("");
    setEventServerDurationMs(null);
    try {
      const res = await axios.post<{
        results?: ResultsMap;
        durationMs?: number;
        error?: string;
      }>("/api/scout/run-scrape", {
        urls: eventSources.map((s) => s.url),
        goal: EVENT_SCRAPE_GOAL,
      });
      if (res.data.results) setEventResults(res.data.results);
      if (typeof res.data.durationMs === "number") setEventServerDurationMs(res.data.durationMs);
    } catch (err: unknown) {
      setEventError(axiosDetail(err) || "Failed to run event scrape (check TINYFISH_API_KEY)");
    } finally {
      setEventScraping(false);
    }
  };

  const handleOpportunityScrape = async () => {
    if (!opportunityGoal.trim()) {
      setOpportunityError("Please enter a goal to search for");
      return;
    }
    setOpportunityScraping(true);
    setOpportunityError("");
    setOppServerDurationMs(null);
    try {
      const res = await axios.post<{
        results?: ResultsMap;
        durationMs?: number;
        error?: string;
      }>("/api/scout/run-scrape", {
        urls: opportunitySources.map((s) => s.url),
        goal: opportunityGoal.trim(),
      });
      if (res.data.results) setOpportunityResults(res.data.results);
      if (typeof res.data.durationMs === "number") setOppServerDurationMs(res.data.durationMs);
    } catch (err: unknown) {
      setOpportunityError(axiosDetail(err) || "Failed to run opportunity scrape (check TINYFISH_API_KEY)");
    } finally {
      setOpportunityScraping(false);
    }
  };

  // Access code gate
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        <Navbar />
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-[#0A0A0A]/95 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="glass-card border border-white/10 rounded-3xl p-8 w-full max-w-sm text-center"
          >
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Lock size={28} className="text-white/60" />
            </div>
            <h2 className="font-display font-black text-2xl text-white tracking-tight mb-2">Scout Access</h2>
            <p className="text-white/40 text-sm font-body mb-6">
              This section is invite-only. Enter your access code to continue.
            </p>

            <input
              type="text"
              placeholder="Enter access code"
              value={accessCode}
              onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setAccessError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAccessSubmit()}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm text-center placeholder-white/25 focus:outline-none focus:border-white/30 tracking-widest font-mono mb-3"
              data-testid="scout-access-code-input"
              autoFocus
            />

            {accessError && (
              <p className="text-red-400 text-xs mb-3" data-testid="scout-access-error">{accessError}</p>
            )}

            <button
              type="button"
              onClick={handleAccessSubmit}
              disabled={!accessCode.trim()}
              className="w-full py-3.5 rounded-xl bg-white text-black font-display font-semibold text-sm hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-4"
              data-testid="scout-access-submit-btn"
            >
              Unlock Scout
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-white/30 text-xs hover:text-white/60 transition-colors"
              data-testid="scout-access-back-btn"
            >
              Back to Home
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Back button */}
          <motion.button
            type="button"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
            data-testid="back-to-home"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Home</span>
          </motion.button>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <h1 className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight mb-3">Scout</h1>
            <p className="text-white/45 font-body text-base max-w-lg">
              Scan the Web3 ecosystem to find events and opportunities tailored for you.
            </p>
          </motion.div>

          {/* Tab Selector */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex gap-4 mb-8">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex-1 p-5 rounded-2xl border transition-all flex items-center justify-center gap-3 group ${
                activeTab === 'events'
                  ? 'bg-gradient-to-r from-purple-500/20 to-purple-600/20 border-purple-500/50 text-white'
                  : 'glass border-white/10 text-white/50 hover:text-white hover:border-white/20'
              }`}
              data-testid="tab-events"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'events' ? 'bg-purple-500' : 'bg-white/10 group-hover:bg-white/20'
              }`}>
                <Calendar size={20} />
              </div>
              <div className="text-left">
                <span className="font-display font-semibold block">Event Concierge</span>
                <span className="text-xs text-white/40">Find upcoming events</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('opportunities')}
              className={`flex-1 p-5 rounded-2xl border transition-all flex items-center justify-center gap-3 group ${
                activeTab === 'opportunities'
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-600/20 border-emerald-500/50 text-white'
                  : 'glass border-white/10 text-white/50 hover:text-white hover:border-white/20'
              }`}
              data-testid="tab-opportunities"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'opportunities' ? 'bg-emerald-500' : 'bg-white/10 group-hover:bg-white/20'
              }`}>
                <Briefcase size={20} />
              </div>
              <div className="text-left">
                <span className="font-display font-semibold block">Opportunity Hunter</span>
                <span className="text-xs text-white/40">Jobs, grants, hackathons</span>
              </div>
            </button>
          </motion.div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {/* ======================== EVENT CONCIERGE ======================== */}
            {activeTab === 'events' && (
              <motion.div key="events" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Sources Panel */}
                  <div className="glass-card p-6 border border-purple-500/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                        <Globe size={20} className="text-white" />
                      </div>
                      <div>
                        <h2 className="font-display font-bold text-lg text-white">Scan Sources</h2>
                        <p className="text-white/40 text-xs">Default sources and custom URLs</p>
                      </div>
                    </div>

                    {/* Source list */}
                    <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
                      {eventSources.map((source) => (
                        <div key={source.url} className="flex items-center gap-3 p-3 glass rounded-xl group">
                          <Zap size={14} className={`flex-shrink-0 ${source.discovered ? 'text-cyan-400' : 'text-purple-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {source.name}
                              {source.discovered && <span className="text-cyan-400 text-xs ml-2">discovered</span>}
                            </p>
                            <p className="text-white/30 text-xs truncate">{source.url}</p>
                          </div>
                          {!source.isDefault && (
                            <button onClick={() => removeSource(eventSources, setEventSources, source.url)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-lg transition-all" data-testid={`remove-event-source-${source.name}`}>
                              <X size={14} className="text-white/40" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Manual URL add */}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="Add custom URL..."
                        value={newEventUrl}
                        onChange={(e) => setNewEventUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { addSource(eventSources, setEventSources, newEventUrl); setNewEventUrl(''); } }}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-purple-500/50"
                        data-testid="add-event-source-input"
                      />
                      <button onClick={() => { addSource(eventSources, setEventSources, newEventUrl); setNewEventUrl(''); }} disabled={!newEventUrl} className="btn-glass px-3 disabled:opacity-50" data-testid="add-event-source-btn">
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Action Panel */}
                  <div className="glass-card p-6 border border-purple-500/20 flex flex-col">
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                      <motion.div
                        animate={eventScraping ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
                        transition={{ duration: 0.5, repeat: eventScraping ? Infinity : 0 }}
                        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/25"
                      >
                        {eventScraping ? <RefreshCw size={32} className="text-white animate-spin" /> : <Search size={32} className="text-white" />}
                      </motion.div>
                      <h3 className="font-display font-bold text-white mb-2">
                        {eventScraping ? 'Scanning Web3...' : 'Ready to Scout'}
                      </h3>
                      <p className="text-white/40 text-sm mb-2 max-w-xs">
                        {eventScraping
                          ? "TinyFish is scraping each source. This may take several minutes."
                          : `${eventSources.length} sources configured. Click below to scan all.`}
                      </p>
                      {eventScraping && (
                        <div className="flex items-center justify-center gap-2 text-purple-300 text-sm font-mono mt-2">
                          <Timer size={16} className="shrink-0" />
                          <span>{formatElapsed(eventScrapeElapsed)}</span>
                          <span className="text-white/35 text-xs font-body">elapsed</span>
                        </div>
                      )}
                      {!eventScraping && eventServerDurationMs != null && (
                        <p className="text-white/35 text-xs mt-2 font-mono">
                          Last run: {(eventServerDurationMs / 1000).toFixed(1)}s server time
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleEventScrape}
                      disabled={eventScraping}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold text-sm hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/25"
                      data-testid="fetch-events-btn"
                    >
                      {eventScraping
                        ? `Scanning… ${formatElapsed(eventScrapeElapsed)}`
                        : `Start Event Scan (${eventSources.length} sources)`}
                    </button>

                    {eventError && <p className="text-red-400 text-xs mt-3 text-center" data-testid="event-error">{eventError}</p>}
                  </div>
                </div>

                {/* Results — full width below sources + action */}
                {Object.keys(eventResults).length > 0 && (() => {
                  // Flatten all events from all sources
                  const allEvents = Object.entries(eventResults).flatMap(([source, data]) =>
                    parseResults(data).map((event, i) => ({ ...event, _source: source, _idx: i }))
                  );

                  // Group by "Month YYYY" derived from the date field
                  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                  const parseMonthYear = (dateStr: string): { label: string; sortKey: number } => {
                    const s = dateStr.trim();
                    if (!s) return { label: "Unknown", sortKey: Infinity };
                    // Month name + 4-digit year in the same string
                    const monthMatch = MONTH_NAMES.findIndex((m) => s.toLowerCase().includes(m.toLowerCase().slice(0, 3)));
                    const yearMatch = s.match(/\d{4}/);
                    if (monthMatch !== -1 && yearMatch) {
                      const year = parseInt(yearMatch[0], 10);
                      return { label: `${MONTH_NAMES[monthMatch]} ${year}`, sortKey: year * 100 + monthMatch };
                    }
                    // ISO YYYY-MM-DD (avoids UTC/local midnight shifts from Date-only parsing)
                    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/);
                    if (iso) {
                      const year = parseInt(iso[1], 10);
                      const monthIdx = parseInt(iso[2], 10) - 1;
                      if (year >= 1970 && year <= 2100 && monthIdx >= 0 && monthIdx <= 11) {
                        return { label: `${MONTH_NAMES[monthIdx]} ${year}`, sortKey: year * 100 + monthIdx };
                      }
                    }
                    const d = new Date(s);
                    if (!Number.isNaN(d.getTime())) {
                      const y = d.getFullYear();
                      const m = d.getMonth();
                      if (y >= 1970 && y <= 2100) {
                        return { label: `${MONTH_NAMES[m]} ${y}`, sortKey: y * 100 + m };
                      }
                    }
                    return { label: "Unknown", sortKey: Infinity };
                  };

                  // Vague/generic event name patterns to filter out
                  const VAGUE_NAMES = /^(community\s+call|weekly\s+call|monthly\s+call|office\s+hours|ama|q&a|tba|tbd|upcoming|event|meetup|webinar|session|workshop|talk)s?$/i;

                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  const filteredEvents = allEvents.filter((event) => {
                    const name = pickStr(event, ["event_name", "name", "title"]).trim();
                    // Drop missing or vague names
                    if (!name || VAGUE_NAMES.test(name)) return false;
                    // Drop events with no parseable date (would land in "Unknown")
                    const dateStr = pickStr(event, ["date", "start_date"]);
                    const { sortKey } = parseMonthYear(dateStr);
                    if (sortKey === Infinity) return false;
                    // Drop past events — parse end date if available, else start date
                    const endStr = pickStr(event, ["end_date", "date_end"]);
                    const rawDate = endStr || dateStr;
                    if (rawDate) {
                      const d = new Date(rawDate);
                      if (!Number.isNaN(d.getTime()) && d < today) return false;
                    }
                    return true;
                  });

                  const grouped: Record<string, { sortKey: number; events: typeof filteredEvents }> = {};
                  for (const event of filteredEvents) {
                    const dateStr = pickStr(event, ["date", "start_date"]);
                    const { label, sortKey } = parseMonthYear(dateStr);
                    if (!grouped[label]) grouped[label] = { sortKey, events: [] };
                    grouped[label].events.push(event);
                  }

                  const sortedGroups = Object.entries(grouped).sort((a, b) => a[1].sortKey - b[1].sortKey);

                  return (
                    <div className="glass-card p-6 border border-purple-500/20 w-full max-h-[70vh] flex flex-col">
                      <h3 className="font-display font-bold text-white mb-6 flex items-center gap-2 shrink-0">
                        <Calendar size={18} className="text-purple-400" />
                        Discovered Events
                        <span className="text-white/30 text-sm font-normal ml-1">({filteredEvents.length})</span>
                      </h3>
                      <div className="overflow-y-auto flex-1 pr-2 space-y-8" style={{ scrollbarGutter: 'stable' }}>
                        {sortedGroups.map(([month, { events }]) => (
                          <div key={month}>
                            {/* Month divider */}
                            <div className="sticky top-0 z-10 backdrop-blur-md bg-[#0A0A0A]/80 py-3 -mx-1 px-1 mb-4">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 shrink-0 bg-purple-500/15 border border-purple-500/30 rounded-lg px-3 py-1.5">
                                  <Calendar size={12} className="text-purple-400" />
                                  <span className="font-display font-bold text-purple-300 text-sm uppercase tracking-widest">{month}</span>
                                </div>
                                <div
                                  className="flex-1 min-w-8 border-t border-dashed border-purple-500/25"
                                  role="presentation"
                                  aria-hidden
                                />
                                <span className="text-white/30 text-xs tabular-nums shrink-0 bg-white/5 rounded-md px-2 py-0.5">{events.length} event{events.length !== 1 ? 's' : ''}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              {events.map((event, i) => (
                                <div key={`${event._source}-${event._idx}-${i}`} className="glass p-4 rounded-xl hover:bg-white/5 transition-all" data-testid={`event-result-${event._source}-${event._idx}`}>
                                  <h4 className="font-semibold text-white text-sm mb-1 line-clamp-2">
                                    {pickStr(event, ["event_name", "name", "title"]) || "Event"}
                                  </h4>
                                  <div className="flex flex-col gap-1 mt-2">
                                    {pickStr(event, ["date", "start_date"]) && (
                                      <span className="flex items-center gap-1 text-xs text-white/40">
                                        <Calendar size={10} />
                                        {pickStr(event, ["date", "start_date"])}
                                      </span>
                                    )}
                                    {pickStr(event, ["event_location", "location"]) && (
                                      <span className="flex items-center gap-1 text-xs text-white/30">
                                        <MapPin size={10} />
                                        {pickStr(event, ["event_location", "location"])}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ======================== OPPORTUNITY HUNTER ======================== */}
            {activeTab === 'opportunities' && (
              <motion.div key="opportunities" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid lg:grid-cols-2 gap-6">
                {/* Goal & Sources Panel */}
                <div className="glass-card p-6 border border-emerald-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                      <Target size={20} className="text-white" />
                    </div>
                    <div>
                      <h2 className="font-display font-bold text-lg text-white">Define Your Goal</h2>
                      <p className="text-white/40 text-xs">What opportunities are you seeking?</p>
                    </div>
                  </div>

                  <textarea
                    placeholder="e.g., Looking for Solidity developer jobs, DeFi grants, or hackathons with prizes over $10k..."
                    value={opportunityGoal}
                    onChange={(e) => setOpportunityGoal(e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-emerald-500/50 resize-none mb-4"
                    data-testid="opportunity-goal-input"
                  />

                  <p className="text-white/40 text-xs mb-2">Search Sources:</p>
                  <div className="space-y-2 max-h-36 overflow-y-auto mb-3">
                    {opportunitySources.map((source) => (
                      <div key={source.url} className="flex items-center gap-3 p-2 glass rounded-lg group">
                        <Zap size={12} className={`flex-shrink-0 ${source.discovered ? 'text-cyan-400' : 'text-emerald-400'}`} />
                        <span className="text-white/70 text-xs truncate flex-1">
                          {source.name}
                          {source.discovered && <span className="text-cyan-400 ml-1">discovered</span>}
                        </span>
                        {!source.isDefault && (
                          <button onClick={() => removeSource(opportunitySources, setOpportunitySources, source.url)} className="opacity-0 group-hover:opacity-100" data-testid={`remove-opp-source-${source.name}`}>
                            <X size={12} className="text-white/40" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* search_index: DDG + Brave (server /api/search-urls) */}
                  <div className="mb-3">
                    <p className="text-white/50 text-xs mb-1.5 flex items-center gap-1">
                      <Search size={10} />
                      Discover sources (DuckDuckGo + Brave)
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. web3 developer jobs 2026..."
                        value={opportunitySearchQuery}
                        onChange={(e) => setOpportunitySearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchWeb(opportunitySearchQuery, opportunitySources, setOpportunitySources, setOpportunitySearching, setOpportunityError)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-emerald-500/50"
                        data-testid="opportunity-search-query-input"
                      />
                      <button
                        onClick={() => searchWeb(opportunitySearchQuery, opportunitySources, setOpportunitySources, setOpportunitySearching, setOpportunityError)}
                        disabled={opportunitySearching || !opportunitySearchQuery.trim()}
                        className="btn-glass px-3 disabled:opacity-50"
                        data-testid="opportunity-search-btn"
                      >
                        {opportunitySearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Manual URL add */}
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="Add custom URL..."
                      value={newOpportunityUrl}
                      onChange={(e) => setNewOpportunityUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { addSource(opportunitySources, setOpportunitySources, newOpportunityUrl); setNewOpportunityUrl(''); } }}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-emerald-500/50"
                      data-testid="add-opportunity-source-input"
                    />
                    <button onClick={() => { addSource(opportunitySources, setOpportunitySources, newOpportunityUrl); setNewOpportunityUrl(''); }} disabled={!newOpportunityUrl} className="btn-glass px-3 disabled:opacity-50" data-testid="add-opportunity-source-btn">
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Action Panel */}
                <div className="glass-card p-6 border border-emerald-500/20 flex flex-col">
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <motion.div
                      animate={opportunityScraping ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.5, repeat: opportunityScraping ? Infinity : 0 }}
                      className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/25"
                    >
                      {opportunityScraping ? <RefreshCw size={32} className="text-white animate-spin" /> : <Briefcase size={32} className="text-white" />}
                    </motion.div>
                    <h3 className="font-display font-bold text-white mb-2">
                      {opportunityScraping ? 'Hunting...' : 'Ready to Hunt'}
                    </h3>
                    <p className="text-white/40 text-sm mb-2 max-w-xs">
                      {opportunityScraping
                        ? "TinyFish is scraping each source for your goal. This may take several minutes."
                        : `${opportunitySources.length} sources configured. Enter a goal and scan.`}
                    </p>
                    {opportunityScraping && (
                      <div className="flex items-center justify-center gap-2 text-emerald-300 text-sm font-mono mt-2">
                        <Timer size={16} className="shrink-0" />
                        <span>{formatElapsed(oppScrapeElapsed)}</span>
                        <span className="text-white/35 text-xs font-body">elapsed</span>
                      </div>
                    )}
                    {!opportunityScraping && oppServerDurationMs != null && (
                      <p className="text-white/35 text-xs mt-2 font-mono">
                        Last run: {(oppServerDurationMs / 1000).toFixed(1)}s server time
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleOpportunityScrape}
                    disabled={opportunityScraping || !opportunityGoal.trim()}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
                    data-testid="search-opportunities-btn"
                  >
                    {opportunityScraping
                      ? `Hunting… ${formatElapsed(oppScrapeElapsed)}`
                      : `Start Opportunity Hunt (${opportunitySources.length} sources)`}
                  </button>

                  {opportunityError && <p className="text-red-400 text-xs mt-3 text-center" data-testid="opportunity-error">{opportunityError}</p>}
                </div>

                {/* Results */}
                {Object.keys(opportunityResults).length > 0 && (
                  <div className="lg:col-span-2 glass-card p-6 border border-emerald-500/20">
                    <h3 className="font-display font-bold text-white mb-4 flex items-center gap-2">
                      <Briefcase size={18} className="text-emerald-400" />
                      Found Opportunities
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(opportunityResults).map(([source, data]) => {
                        const opps = parseResults(data);
                        return opps.slice(0, 6).map((opp, i) => (
                          <div key={`${source}-${i}`} className="glass p-4 rounded-xl hover:bg-white/5 transition-all" data-testid={`opp-result-${source}-${i}`}>
                            <h4 className="font-semibold text-white text-sm mb-1 truncate">
                              {pickStr(opp, ["title", "name"]) || "Opportunity"}
                            </h4>
                            <p className="text-white/40 text-xs mb-2 line-clamp-2">
                              {pickStr(opp, ["description", "summary"]) || "No description"}
                            </p>
                            <div className="flex items-center gap-2 text-xs">
                              {pickStr(opp, ["company"]) && (
                                <span className="text-white/30">{pickStr(opp, ["company"])}</span>
                              )}
                              {(pickStr(opp, ["prize"]) || pickStr(opp, ["salary"])) && (
                                <span className="text-emerald-400">
                                  {pickStr(opp, ["prize"]) || pickStr(opp, ["salary"])}
                                </span>
                              )}
                            </div>
                          </div>
                        ));
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
