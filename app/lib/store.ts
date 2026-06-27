// ════════════════════════════════════════════════════════════════════
// LOCALSTORAGE STORE — admin unosi → publisher cita
// Kljucevi:
//   revradar_publishers → metadata svih publishera
//   revradar_data       → dnevni podaci po publisheru
//   revradar_adunits    → ad units po publisheru
//   revradar_messages   → poruke publisherima
// ════════════════════════════════════════════════════════════════════

export type PubStatus = "Aktivan" | "Neaktivan" | "Suspendovan";
export type PublisherMeta = { name: string; country: string; status: PubStatus; note: string };
export type DailyEntry = { date: string; impressions: number; revenue: number; rpm: number };
export type AdUnitEntry = { id: string; name: string; impressions: number; revenue: number; rpm: number; fillRate: number; viewability: number };

export const KEYS = {
  publishers: "revradar_publishers",
  data: "revradar_data",
  adunits: "revradar_adunits",
  messages: "revradar_messages",
} as const;

export const STORE_EVENT = "revradar-store-change";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  // obavesti sve komponente u istom tabu da se podaci promenili
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key } }));
}

// ── Publishers (metadata) ──
export const getPublishers = () => read<Record<string, PublisherMeta>>(KEYS.publishers, {});
export const setPublishers = (v: Record<string, PublisherMeta>) => write(KEYS.publishers, v);

// ── Dnevni podaci ──
export const getAllData = () => read<Record<string, DailyEntry[]>>(KEYS.data, {});
export const setAllData = (v: Record<string, DailyEntry[]>) => write(KEYS.data, v);
export const getPublisherData = (pub: string): DailyEntry[] =>
  [...(getAllData()[pub] ?? [])].sort((a, b) => a.date.localeCompare(b.date));

// ── Ad units ──
export const getAllAdUnits = () => read<Record<string, AdUnitEntry[]>>(KEYS.adunits, {});
export const setAllAdUnits = (v: Record<string, AdUnitEntry[]>) => write(KEYS.adunits, v);
export const getPublisherAdUnits = (pub: string): AdUnitEntry[] => getAllAdUnits()[pub] ?? [];

// ── Poruke ──
export const getMessages = () => read<Record<string, string>>(KEYS.messages, {});
export const setMessages = (v: Record<string, string>) => write(KEYS.messages, v);
export const getPublisherMessage = (pub: string): string => getMessages()[pub] ?? "";

// ── Helper: RPM iz impresija i prihoda ──
export const calcRpm = (impressions: number, revenue: number): number =>
  impressions > 0 ? +(revenue / (impressions / 1000)).toFixed(3) : 0;
