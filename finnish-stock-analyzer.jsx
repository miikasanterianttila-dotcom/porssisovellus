import { useState, useEffect, useRef } from "react";

// ============================================================
// API CONFIGURATION
// ============================================================
// To use real data, create a .env file in your project root with:
//   VITE_STOCK_API_KEY=your_fmp_api_key_here
// Get a free key at: https://financialmodelingprep.com
//
// Without an API key, the app uses high-quality mock data.
// ============================================================

const API_KEY = import.meta.env.VITE_STOCK_API_KEY;
const FMP_BASE = "https://financialmodelingprep.com/api/v3";

// Ensure ticker always has .HE suffix for Helsinki stocks
function toHelsinkiTicker(input) {
  if (!input) return "";
  const upper = input.trim().toUpperCase();
  // Already has exchange suffix — keep as-is only if it's .HE
  if (upper.includes(".")) {
    return upper.endsWith(".HE") ? upper : upper.split(".")[0] + ".HE";
  }
  return upper + ".HE";
}

// Check if API key is available
function hasApiKey() {
  return typeof API_KEY === "string" && API_KEY.trim().length > 0;
}

// ============================================================
// API FETCH FUNCTIONS (Financial Modeling Prep)
// These replace MOCK_STOCKS when a real API key is present.
// ============================================================

async function fetchFMPProfile(ticker) {
  const t = toHelsinkiTicker(ticker);
  const res = await fetch(`${FMP_BASE}/profile/${t}?apikey=${API_KEY}`);
  if (!res.ok) throw new Error(`Profiilin haku epäonnistui: ${res.status}`);
  const data = await res.json();
  if (!data || data.length === 0) throw new Error(`Osaketta ${t} ei löytynyt`);
  return data[0];
}

async function fetchFMPKeyMetrics(ticker, years = 5) {
  const t = toHelsinkiTicker(ticker);
  const res = await fetch(`${FMP_BASE}/key-metrics/${t}?limit=${years}&apikey=${API_KEY}`);
  if (!res.ok) throw new Error(`Tunnuslukujen haku epäonnistui: ${res.status}`);
  return await res.json();
}

async function fetchFMPIncomeStatement(ticker, years = 5) {
  const t = toHelsinkiTicker(ticker);
  const res = await fetch(`${FMP_BASE}/income-statement/${t}?limit=${years}&apikey=${API_KEY}`);
  if (!res.ok) throw new Error(`Tuloslaskelman haku epäonnistui: ${res.status}`);
  return await res.json();
}

async function fetchFMPBalanceSheet(ticker, years = 5) {
  const t = toHelsinkiTicker(ticker);
  const res = await fetch(`${FMP_BASE}/balance-sheet-statement/${t}?limit=${years}&apikey=${API_KEY}`);
  if (!res.ok) throw new Error(`Taseen haku epäonnistui: ${res.status}`);
  return await res.json();
}

// Combine all FMP endpoints into the app's internal data shape
async function fetchStockData(ticker) {
  const t = toHelsinkiTicker(ticker);
  const [profile, metrics, income, balance] = await Promise.all([
    fetchFMPProfile(t),
    fetchFMPKeyMetrics(t),
    fetchFMPIncomeStatement(t),
    fetchFMPBalanceSheet(t),
  ]);

  // Build years object from oldest → newest
  const years = {};
  const n = Math.min(metrics.length, income.length, balance.length, 5);
  for (let i = n - 1; i >= 0; i--) {
    const m = metrics[i];
    const inc = income[i];
    const bal = balance[i];
    const year = new Date(m.date).getFullYear();
    const prevInc = income[i + 1];
    const revenueGrowth = prevInc
      ? ((inc.revenue - prevInc.revenue) / Math.abs(prevInc.revenue)) * 100
      : 0;
    const prevEps = prevInc?.eps;
    const earningsGrowth = prevEps && prevEps !== 0
      ? ((inc.eps - prevEps) / Math.abs(prevEps)) * 100
      : 0;
    const totalAssets = bal.totalAssets || 1;
    const totalEquity = bal.totalStockholdersEquity || 0;
    const totalDebt = (bal.longTermDebt || 0) + (bal.shortTermDebt || 0);
    const cash = bal.cashAndCashEquivalents || 0;
    years[year] = {
      pe:             m.peRatio              ?? null,
      peg:            m.pegRatio             ?? null,
      pb:             m.pbRatio              ?? null,
      pfcf:           m.priceToFreeCashFlowsRatio ?? null,
      eps:            inc.eps                ?? null,
      roe:            (m.roe ?? 0) * 100,
      ebit:           inc.ebitdaratio != null ? inc.ebitdaratio * 100 : (inc.ebitda / inc.revenue) * 100,
      dy:             (m.dividendYield ?? 0) * 100,
      dps:            inc.dividendsPaid != null
                        ? Math.abs(inc.dividendsPaid / (profile.sharesOutstanding || 1))
                        : null,
      eq:             totalEquity / totalAssets * 100,
      nettovelka:     (totalDebt - cash) / totalEquity * 100,
      revenue:        Math.round((inc.revenue || 0) / 1e6),
      revenueGrowth,
      earningsGrowth,
    };
  }

  return {
    name:         profile.companyName,
    ticker:       t,
    sector:       profile.sector || "Tuntematon",
    logo:         "🏢",
    description:  profile.description?.slice(0, 100) + "…" || "",
    currentPrice: profile.price,
    pegRatio:     metrics[0]?.pegRatio ?? null,
    years,
  };
}

const MOCK_STOCKS = {
  "NOKIA.HE": {
    name: "Nokia Oyj", ticker: "NOKIA.HE", sector: "Teknologia", logo: "📡",
    description: "Globaali teknologiayritys, 5G-verkkolaitteet ja patentit",
    years: {
      2021: { pe: 18.2, pb: 1.8, pfcf: 22.1, eps: 0.21, roe: 9.8, ebit: 8.2, dy: 0.0, dps: 0.00, eq: 42.1, nettovelka: 18.4, revenue: 22202, revenueGrowth: 2.1, earningsGrowth: 145.2, peg: null },
      2022: { pe: 14.1, pb: 1.6, pfcf: 18.4, eps: 0.28, roe: 11.2, ebit: 9.4, dy: 0.9, dps: 0.02, eq: 44.8, nettovelka: 15.2, revenue: 24911, revenueGrowth: 12.2, earningsGrowth: 33.3, peg: 0.42 },
      2023: { pe: 9.8, pb: 1.2, pfcf: 12.2, eps: 0.32, roe: 13.1, ebit: 10.8, dy: 1.8, dps: 0.06, eq: 46.2, nettovelka: 12.1, revenue: 22278, revenueGrowth: -10.5, earningsGrowth: 14.3, peg: 0.68 },
      2024: { pe: 11.4, pb: 1.1, pfcf: 14.8, eps: 0.28, roe: 9.8, ebit: 8.9, dy: 2.2, dps: 0.08, eq: 48.1, nettovelka: 9.8, revenue: 22114, revenueGrowth: -0.7, earningsGrowth: -12.5, peg: null },
      2025: { pe: 13.2, pb: 1.3, pfcf: 16.1, eps: 0.31, roe: 10.4, ebit: 9.6, dy: 2.4, dps: 0.10, eq: 49.8, nettovelka: 8.4, revenue: 22890, revenueGrowth: 3.5, earningsGrowth: 10.7, peg: 1.23 },
    },
    currentPrice: 4.09, pegRatio: 1.23,
  },
  "SAMPO.HE": {
    name: "Sampo Oyj", ticker: "SAMPO.HE", sector: "Rahoitus", logo: "🏦",
    description: "Johtava pohjoismainen vakuutusyhtiö, If ja Topdanmark",
    years: {
      2021: { pe: 14.8, pb: 1.9, pfcf: 11.2, eps: 3.12, roe: 13.2, ebit: 18.4, dy: 4.2, dps: 2.00, eq: 38.2, nettovelka: 22.1, revenue: 4812, revenueGrowth: 8.4, earningsGrowth: 22.1, peg: 0.67 },
      2022: { pe: 12.2, pb: 2.1, pfcf: 9.8, eps: 3.68, roe: 17.1, ebit: 21.2, dy: 4.8, dps: 2.20, eq: 36.8, nettovelka: 24.4, revenue: 5214, revenueGrowth: 8.4, earningsGrowth: 17.9, peg: 0.68 },
      2023: { pe: 13.4, pb: 2.3, pfcf: 10.4, eps: 3.21, roe: 17.4, ebit: 22.8, dy: 5.1, dps: 2.40, eq: 37.4, nettovelka: 23.8, revenue: 5688, revenueGrowth: 9.1, earningsGrowth: -12.8, peg: null },
      2024: { pe: 14.1, pb: 2.2, pfcf: 11.8, eps: 3.44, roe: 15.8, ebit: 20.4, dy: 5.4, dps: 2.70, eq: 38.9, nettovelka: 21.2, revenue: 6012, revenueGrowth: 5.7, earningsGrowth: 7.2, peg: 1.96 },
      2025: { pe: 13.8, pb: 2.4, pfcf: 10.9, eps: 3.72, roe: 17.2, ebit: 22.1, dy: 5.8, dps: 2.95, eq: 40.2, nettovelka: 19.8, revenue: 6401, revenueGrowth: 6.5, earningsGrowth: 8.1, peg: 1.71 },
    },
    currentPrice: 51.28, pegRatio: 1.71,
  },
  "KNEBV.HE": {
    name: "KONE Oyj", ticker: "KNEBV.HE", sector: "Teollisuus", logo: "🏗️",
    description: "Hissit, liukuportaat ja älyrakennusratkaisut maailmanlaajuisesti",
    years: {
      2021: { pe: 38.4, pb: 14.2, pfcf: 32.8, eps: 1.88, roe: 38.2, ebit: 12.8, dy: 2.8, dps: 1.65, eq: 28.4, nettovelka: -12.4, revenue: 10484, revenueGrowth: 11.2, earningsGrowth: 18.4, peg: 2.09 },
      2022: { pe: 28.1, pb: 11.4, pfcf: 24.2, eps: 1.92, roe: 34.8, ebit: 11.4, dy: 3.2, dps: 1.75, eq: 26.8, nettovelka: -8.2, revenue: 10906, revenueGrowth: 4.0, earningsGrowth: 2.1, peg: 13.38 },
      2023: { pe: 24.8, pb: 10.8, pfcf: 21.4, eps: 1.74, roe: 32.4, ebit: 10.8, dy: 3.6, dps: 1.78, eq: 27.2, nettovelka: -6.4, revenue: 10704, revenueGrowth: -1.8, earningsGrowth: -9.4, peg: null },
      2024: { pe: 26.4, pb: 11.2, pfcf: 22.8, eps: 1.81, roe: 33.8, ebit: 11.6, dy: 3.8, dps: 1.85, eq: 28.8, nettovelka: -9.8, revenue: 11124, revenueGrowth: 3.9, earningsGrowth: 4.0, peg: 6.60 },
      2025: { pe: 25.2, pb: 10.9, pfcf: 21.9, eps: 1.94, roe: 35.2, ebit: 12.2, dy: 4.0, dps: 1.95, eq: 29.4, nettovelka: -11.2, revenue: 11602, revenueGrowth: 4.3, earningsGrowth: 7.2, peg: 3.50 },
    },
    currentPrice: 48.88, pegRatio: 3.50,
  },
  "NESTE.HE": {
    name: "Neste Oyj", ticker: "NESTE.HE", sector: "Energia", logo: "⚡",
    description: "Uusiutuvan dieselin ja kerosiinin maailmanjohtaja",
    years: {
      2021: { pe: 22.4, pb: 4.8, pfcf: 18.4, eps: 1.84, roe: 21.4, ebit: 11.8, dy: 1.8, dps: 0.72, eq: 48.2, nettovelka: 14.2, revenue: 11822, revenueGrowth: 28.4, earningsGrowth: 48.2, peg: 0.46 },
      2022: { pe: 14.8, pb: 5.2, pfcf: 12.4, eps: 3.18, roe: 38.2, ebit: 18.4, dy: 2.2, dps: 1.01, eq: 44.8, nettovelka: 22.4, revenue: 22936, revenueGrowth: 93.9, earningsGrowth: 72.8, peg: 0.20 },
      2023: { pe: 16.2, pb: 4.4, pfcf: 14.2, eps: 2.84, roe: 28.4, ebit: 14.8, dy: 2.8, dps: 1.05, eq: 42.4, nettovelka: 28.4, revenue: 20522, revenueGrowth: -10.5, earningsGrowth: -10.7, peg: null },
      2024: { pe: 18.8, pb: 2.8, pfcf: 22.4, eps: 1.24, roe: 9.8, ebit: 6.4, dy: 3.4, dps: 0.71, eq: 38.8, nettovelka: 38.4, revenue: 16408, revenueGrowth: -20.0, earningsGrowth: -56.3, peg: null },
      2025: { pe: 14.2, pb: 2.4, pfcf: 14.8, eps: 1.48, roe: 11.2, ebit: 8.2, dy: 3.8, dps: 0.80, eq: 40.2, nettovelka: 34.2, revenue: 17204, revenueGrowth: 4.8, earningsGrowth: 19.4, peg: 0.73 },
    },
    currentPrice: 20.98, pegRatio: 0.73,
  },
  "FORTUM.HE": {
    name: "Fortum Oyj", ticker: "FORTUM.HE", sector: "Energia", logo: "🔋",
    description: "Pohjoismainen energiayhtiö, vesivoima ja sähkömarkkinat",
    years: {
      2021: { pe: 14.2, pb: 1.8, pfcf: 12.4, eps: 1.12, roe: 12.8, ebit: 14.4, dy: 3.2, dps: 0.51, eq: 34.8, nettovelka: 42.4, revenue: 6191, revenueGrowth: 22.4, earningsGrowth: 18.4, peg: 0.77 },
      2022: { pe: 8.4, pb: 1.2, pfcf: 6.8, eps: 1.84, roe: 14.8, ebit: 16.2, dy: 2.4, dps: 0.46, eq: 28.4, nettovelka: 84.8, revenue: 24921, revenueGrowth: 302.5, earningsGrowth: 64.3, peg: 0.13 },
      2023: { pe: 11.4, pb: 1.1, pfcf: 9.8, eps: 1.04, roe: 9.8, ebit: 11.4, dy: 1.2, dps: 0.23, eq: 32.4, nettovelka: 68.4, revenue: 8484, revenueGrowth: -66.0, earningsGrowth: -43.5, peg: null },
      2024: { pe: 12.8, pb: 1.2, pfcf: 11.4, eps: 0.98, roe: 9.4, ebit: 12.8, dy: 2.2, dps: 0.30, eq: 36.2, nettovelka: 52.4, revenue: 7902, revenueGrowth: -6.9, earningsGrowth: -5.8, peg: null },
      2025: { pe: 11.8, pb: 1.3, pfcf: 10.8, eps: 1.08, roe: 10.4, ebit: 13.4, dy: 2.8, dps: 0.36, eq: 38.4, nettovelka: 48.2, revenue: 8284, revenueGrowth: 4.8, earningsGrowth: 10.2, peg: 1.16 },
    },
    currentPrice: 12.74, pegRatio: 1.16,
  },
};

const SECTOR_AVERAGES = {
  Teknologia: { pe: 18.4, peg: 1.8, pb: 2.8, roe: 12.4, ebit: 9.8, dy: 1.2, eq: 44.2 },
  Rahoitus:   { pe: 11.8, peg: 1.4, pb: 1.4, roe: 11.8, ebit: 16.4, dy: 5.2, eq: 22.4 },
  Teollisuus: { pe: 22.4, peg: 2.8, pb: 4.2, roe: 18.4, ebit: 10.2, dy: 3.2, eq: 38.4 },
  Energia:    { pe: 14.8, peg: 1.6, pb: 2.1, roe: 14.2, ebit: 11.8, dy: 3.4, eq: 38.8 },
};
const MARKET_AVERAGE = { pe: 16.2, peg: 1.9, pb: 2.4, roe: 14.8, ebit: 11.4, dy: 3.8, eq: 42.2 };

// Finnish palette
const C = {
  blue:      "#003580",
  blueMid:   "#0052A5",
  blueLight: "#4A80C4",
  bluePale:  "#E4EDF9",
  blueBorder:"#B8CEE8",
  white:     "#FFFFFF",
  bg:        "#F2F6FC",
  text:      "#0A1F44",
  textMid:   "#3A5A8C",
  textLight: "#6B8CC4",
  good:      "#15803d",
  warn:      "#b45309",
  bad:       "#b91c1c",
  goodBg:    "#dcfce7",
  warnBg:    "#fef3c7",
  badBg:     "#fee2e2",
};

// ============================================================
// SCORING ENGINE
// ============================================================
function calculateScore(stock) {
  const latestYear = Math.max(...Object.keys(stock.years).map(Number));
  const data = stock.years[latestYear];
  const s = {};
  // Arvostus: P/E 30%, PEG 20%, P/B 25%, P/FCF 25%
  s.arvostus = Math.round(
    Math.max(0, Math.min(100, ((25 - data.pe) / 20) * 100)) * 0.30 +
    Math.max(0, Math.min(100, ((3 - stock.pegRatio) / 2.5) * 100)) * 0.20 +
    Math.max(0, Math.min(100, ((5 - data.pb) / 4.5) * 100)) * 0.25 +
    Math.max(0, Math.min(100, ((30 - data.pfcf) / 25) * 100)) * 0.25
  );
  s.laatu = Math.round(
    Math.max(0, Math.min(100, (data.roe / 30) * 100)) * 0.55 +
    Math.max(0, Math.min(100, (data.ebit / 22) * 100)) * 0.45
  );
  const avgRev = Object.values(stock.years).reduce((a, y) => a + y.revenueGrowth, 0) / Object.keys(stock.years).length;
  const avgEar = Object.values(stock.years).reduce((a, y) => a + y.earningsGrowth, 0) / Object.keys(stock.years).length;
  s.kasvu = Math.round(
    Math.max(0, Math.min(100, ((avgRev + 5) / 20) * 100)) * 0.5 +
    Math.max(0, Math.min(100, ((avgEar + 5) / 40) * 100)) * 0.5
  );
  s.vakavaraisuus = Math.round(
    Math.max(0, Math.min(100, (data.eq / 60) * 100)) * 0.4 +
    Math.max(0, Math.min(100, ((60 - Math.max(0, data.nettovelka)) / 60) * 100)) * 0.35 +
    Math.max(0, Math.min(100, (data.dy / 7) * 100)) * 0.25
  );
  s.total = Math.round(s.arvostus * 0.30 + s.laatu * 0.30 + s.kasvu * 0.20 + s.vakavaraisuus * 0.20);
  return s;
}

// ============================================================
// COMPONENTS
// ============================================================
function ScoreBar({ value }) {
  const clr = value >= 70 ? C.good : value >= 45 ? C.warn : C.bad;
  return (
    <div style={{ background: C.blueBorder, borderRadius: 99, height: 7, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: "100%", background: clr, borderRadius: 99, transition: "width .6s" }} />
    </div>
  );
}

function Badge({ text, blue = false }) {
  return (
    <span style={{
      background: blue ? C.bluePale : C.bg,
      color: C.blue, border: `1px solid ${C.blueBorder}`,
      borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase"
    }}>{text}</span>
  );
}

function ScoreRing({ score }) {
  const r = 42, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const clr = score >= 70 ? C.good : score >= 50 ? C.warn : C.bad;
  const label = score >= 70 ? "Vahva" : score >= 55 ? "Hyvä" : score >= 40 ? "Neutraali" : "Heikko";
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke={C.blueBorder} strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={clr} strokeWidth="10"
        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
        strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${clr}88)` }} />
      <text x="55" y="52" textAnchor="middle" fill={C.blue} fontSize="20" fontWeight="800">{score}</text>
      <text x="55" y="67" textAnchor="middle" fill={clr} fontSize="10" fontWeight="700">{label}</text>
    </svg>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.blueBorder}`, borderRadius: 14, boxShadow: "0 2px 10px rgba(0,53,128,0.07)", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>
      {children}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("NOKIA.HE");
  const [watchlist, setWatchlist] = useState(["SAMPO.HE", "KNEBV.HE"]);
  const [suggestions, setSuggestions] = useState([]);
  const [activeTab, setActiveTab] = useState("yhteenveto");
  const [loaded, setLoaded] = useState(false);

  // Live API state
  const [liveStock, setLiveStock] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const inputRef = useRef();
  const apiKeyPresent = hasApiKey();

  // When API key is present, fetch real data on ticker change
  useEffect(() => {
    if (!apiKeyPresent) {
      setLoaded(true);
      return;
    }
    setApiLoading(true);
    setApiError(null);
    setLiveStock(null);
    fetchStockData(selected)
      .then(data => { setLiveStock(data); setApiLoading(false); setLoaded(true); })
      .catch(err => { setApiError(err.message); setApiLoading(false); setLoaded(true); });
  }, [selected, apiKeyPresent]);

  // Use live data if available, otherwise fall back to mock
  const stock = liveStock ?? MOCK_STOCKS[selected] ?? Object.values(MOCK_STOCKS)[0];
  const scores = calculateScore(stock);
  const sectorAvg = SECTOR_AVERAGES[stock.sector] ?? SECTOR_AVERAGES["Teknologia"];
  const years = Object.keys(stock.years).map(Number).sort((a, b) => a - b);
  const inWatchlist = watchlist.includes(selected);

  // Search: always searches mock keys; with API key also allows free-text .HE lookup
  function handleSearch(val) {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); return; }
    const local = Object.values(MOCK_STOCKS).filter(s =>
      s.ticker.toLowerCase().includes(val.toLowerCase()) ||
      s.name.toLowerCase().includes(val.toLowerCase())
    );
    // Show a "live search" entry if the input looks like a ticker and we have an API key
    const looksLikeTicker = /^[A-Za-z0-9]{2,8}$/.test(val.trim());
    const heTickerSuggestion = apiKeyPresent && looksLikeTicker
      ? [{ ticker: toHelsinkiTicker(val), name: `Hae: ${toHelsinkiTicker(val)}`, sector: "Nasdaq Helsinki", logo: "🔍", _live: true }]
      : [];
    const merged = [...local];
    // Add live suggestion only if not already in mock results
    heTickerSuggestion.forEach(s => { if (!merged.find(m => m.ticker === s.ticker)) merged.push(s); });
    setSuggestions(merged);
  }

  function selectStock(ticker) { setSelected(ticker); setQuery(""); setSuggestions([]); }
  function toggleWatchlist(ticker) {
    setWatchlist(p => p.includes(ticker) ? p.filter(t => t !== ticker) : [...p, ticker]);
  }

  const tabs = [
    { id: "yhteenveto", label: "Yhteenveto" },
    { id: "historia",   label: "Tunnusluvut" },
    { id: "vertailu",   label: "Vertailu" },
    { id: "seuranta",   label: `Seuranta (${watchlist.length})` },
  ];

  const fmtVal = (val, fmt) => {
    if (val === undefined || val === null) return "—";
    if (fmt === "percent") return `${val.toFixed(1)}%`;
    if (fmt === "eps")     return `€${val.toFixed(2)}`;
    if (fmt === "ratio")   return `${val.toFixed(1)}x`;
    if (fmt === "num0")    return val.toLocaleString("fi-FI");
    return val.toFixed(1);
  };

  // ── API KEY MISSING BANNER ──────────────────────────────────
  const ApiKeyBanner = () => (
    <div style={{
      background: "#fff8e1", border: `1.5px solid #f59e0b`,
      borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14
    }}>
      <span style={{ fontSize: 22 }}>🔑</span>
      <div>
        <div style={{ fontWeight: 800, color: "#92400e", fontSize: 14 }}>
          API-avain puuttuu — käytetään esimerkkidataa
        </div>
        <div style={{ fontSize: 12, color: "#b45309", marginTop: 3 }}>
          Lisää oikea data luomalla projektin juureen <code style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 4 }}>.env</code>-tiedosto
          ja lisäämällä rivi: <code style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 4 }}>VITE_STOCK_API_KEY=avaimesi_tähän</code>
          &nbsp;— ilmainen avain osoitteesta <strong>financialmodelingprep.com</strong>
        </div>
      </div>
    </div>
  );

  // ── API ERROR BANNER ────────────────────────────────────────
  const ApiErrorBanner = () => (
    <div style={{
      background: "#fee2e2", border: `1.5px solid ${C.bad}`,
      borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14
    }}>
      <span style={{ fontSize: 22 }}>⚠️</span>
      <div>
        <div style={{ fontWeight: 800, color: C.bad, fontSize: 14 }}>API-virhe — näytetään esimerkkidata</div>
        <div style={{ fontSize: 12, color: "#7f1d1d", marginTop: 3 }}>{apiError}</div>
      </div>
    </div>
  );

  // ── API LOADING SPINNER ─────────────────────────────────────
  const LoadingOverlay = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 0", color: C.textMid }}>
      <div style={{ width: 20, height: 20, border: `3px solid ${C.blueBorder}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 14, fontWeight: 600 }}>Haetaan dataa Helsingin pörssistä…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );


  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.text }}>

      {/* Finnish flag top stripe */}
      <div style={{ height: 5, background: `linear-gradient(90deg, ${C.blue} 0%, ${C.blueMid} 50%, ${C.blue} 100%)` }} />

      {/* ── HEADER ── */}
      <header style={{ background: C.white, borderBottom: `2px solid ${C.blueBorder}`, boxShadow: "0 2px 8px rgba(0,53,128,0.08)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: `0 3px 10px ${C.blue}55` }}>📈</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.blue, letterSpacing: "-0.02em", lineHeight: 1 }}>
                OSAKE<span style={{ color: C.blueMid }}>APURI</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
                Helsingin pörssi
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: "relative", width: "100%", maxWidth: 380 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textLight, fontSize: 14 }}>🔍</span>
            <input
              ref={inputRef} value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Hae osaketta... (esim. Nokia, KNEBV)"
              style={{
                width: "100%", boxSizing: "border-box",
                background: C.bluePale, border: `1.5px solid ${C.blueBorder}`,
                borderRadius: 10, padding: "10px 16px 10px 36px",
                fontSize: 13, color: C.text, outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = C.blue}
              onBlur={e => e.target.style.borderColor = C.blueBorder}
            />
            {suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
                background: C.white, border: `1.5px solid ${C.blueBorder}`,
                borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 28px rgba(0,53,128,0.14)"
              }}>
                {suggestions.map(s => (
                  <button key={s.ticker} onClick={() => selectStock(s.ticker)}
                    style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", borderBottom: `1px solid ${C.bluePale}`, textAlign: "left" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bluePale}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <span style={{ fontSize: 20 }}>{s.logo}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: C.textLight }}>{s.ticker} · {s.sector}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: 140, flexShrink: 0 }} />
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 4, background: C.bluePale, border: `1.5px solid ${C.blueBorder}`, borderRadius: 12, padding: 4, width: "fit-content" }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", transition: "all .2s",
                ...(activeTab === tab.id
                  ? { background: C.blue, color: C.white, boxShadow: `0 2px 8px ${C.blue}44` }
                  : { background: "transparent", color: C.textMid })
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── STATUS BANNERS ── */}
        {!apiKeyPresent && <ApiKeyBanner />}
        {apiKeyPresent && apiError && <ApiErrorBanner />}
        {apiKeyPresent && apiLoading && <LoadingOverlay />}

        {/* ── STOCK HERO ── */}
        {!apiLoading && (
        <Card style={{
          padding: 24, opacity: loaded ? 1 : 0, transform: loaded ? "none" : "translateY(12px)",
          transition: "opacity .4s, transform .4s",
          borderTop: `4px solid ${C.blue}`,
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: C.bluePale, border: `2px solid ${C.blueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
                {stock.logo}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: C.blue }}>{stock.name}</span>
                  <Badge text={stock.ticker} blue />
                  <Badge text={stock.sector} />
                  {liveStock && <Badge text="● Live" blue />}
                </div>
                <div style={{ fontSize: 13, color: C.textMid, marginBottom: 6 }}>{stock.description}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: C.blue }}>€{stock.currentPrice?.toFixed(2) ?? "—"}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ScoreRing score={scores.total} />
              <button onClick={() => toggleWatchlist(selected)}
                style={{
                  padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  ...(inWatchlist
                    ? { background: C.warnBg, color: C.warn, border: `1.5px solid #f59e0b` }
                    : { background: C.bluePale, color: C.blue, border: `1.5px solid ${C.blueBorder}` })
                }}>
                {inWatchlist ? "★ Seurannassa" : "☆ Lisää seurantaan"}
              </button>
            </div>
          </div>
        </Card>
        )}

        {/* ── TAB CONTENT — hidden while loading ── */}
        {!apiLoading && (<>

        {/* ── TAB: YHTEENVETO ── */}
        {activeTab === "yhteenveto" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Score cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { key: "arvostus",     label: "Arvostus",     weight: "30%", icon: "💰", desc: "P/E, PEG, P/B, P/FCF" },
                { key: "laatu",        label: "Laatu",        weight: "30%", icon: "⭐", desc: "ROE, EBIT-%" },
                { key: "kasvu",        label: "Kasvu",        weight: "20%", icon: "🚀", desc: "Liikevaihto, EPS" },
                { key: "vakavaraisuus",label: "Vakavaraisuus",weight: "20%", icon: "🛡️", desc: "Omavaraisuus, Nettovelkaantuminen" },
              ].map(cat => {
                const val = scores[cat.key];
                const clr = val >= 70 ? C.good : val >= 45 ? C.warn : C.bad;
                const bg  = val >= 70 ? C.goodBg : val >= 45 ? C.warnBg : C.badBg;
                return (
                  <Card key={cat.key} style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.blue, textTransform: "uppercase", letterSpacing: "0.08em" }}>{cat.icon} {cat.label}</div>
                        <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{cat.desc}</div>
                      </div>
                      <span style={{ background: C.bluePale, color: C.blue, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 800 }}>{cat.weight}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 10 }}>
                      <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: clr }}>{val}</span>
                      <span style={{ fontSize: 12, color: C.textLight, marginBottom: 4 }}>/100</span>
                      <span style={{ marginLeft: "auto", background: bg, color: clr, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        {val >= 70 ? "Hyvä" : val >= 45 ? "OK" : "Heikko"}
                      </span>
                    </div>
                    <ScoreBar value={val} />
                  </Card>
                );
              })}
            </div>

          </div>
        )}

        {/* ── TAB: TUNNUSLUVUT (historia) ── */}
        {activeTab === "historia" && (
          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.blueBorder}`, background: C.bluePale }}>
              <SectionTitle>📊 {stock.name.toUpperCase()} – TUNNUSLUVUT</SectionTitle>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.blue }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", color: C.white, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tunnusluku</th>
                    {years.map(y => (
                      <th key={y} style={{ padding: "10px 14px", textAlign: "right", color: y === 2025 ? "#FFE066" : "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em" }}>
                        {y}{y === 2025 ? " ★" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "P/E-luku",                  key: "pe",             fmt: "ratio",   lo: true, bm: sectorAvg.pe },
                    { label: "PEG-luku",                  key: "peg",            fmt: "ratio",   lo: true, bm: sectorAvg.peg },
                    { label: "P/B-luku",                  key: "pb",             fmt: "ratio",   lo: true, bm: sectorAvg.pb },
                    { label: "P/FCF",                     key: "pfcf",           fmt: "ratio",   lo: true, bm: 20 },
                    { label: "EPS (€)",                   key: "eps",            fmt: "eps",     bm: 0 },
                    { label: "ROE-%",                     key: "roe",            fmt: "percent", bm: sectorAvg.roe },
                    { label: "EBIT-%",                    key: "ebit",           fmt: "percent", bm: sectorAvg.ebit },
                    { label: "Osinkoa per osake (€)",     key: "dps",            fmt: "eps",     bm: null },
                    { label: "Osinkotuotto-%",            key: "dy",             fmt: "percent", bm: sectorAvg.dy },
                    { label: "Omavaraisuus-%",            key: "eq",             fmt: "percent", bm: sectorAvg.eq },
                    { label: "Nettovelkaantuminen-%",     key: "nettovelka",     fmt: "percent", lo: true, bm: 30 },
                    { label: "Liikevaihto (M€)",          key: "revenue",        fmt: "num0",    bm: null },
                    { label: "Liikevaihto-kasvu-%",       key: "revenueGrowth",  fmt: "percent", bm: 0 },
                    { label: "EPS-kasvu-%",               key: "earningsGrowth", fmt: "percent", bm: 0 },
                  ].map((row, i) => (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? C.white : C.bluePale, borderBottom: `1px solid ${C.blueBorder}40` }}>
                      <td style={{ padding: "9px 14px", color: C.textMid, fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 }}>{row.label}</td>
                      {years.map(y => {
                        const latestYear = Math.max(...years);
                        const val = stock.years[y][row.key];
                        let color = C.text;
                        if (row.bm !== null && val !== undefined && val !== null) {
                          color = (row.lo ? val < row.bm : val > row.bm) ? C.good : C.bad;
                        }
                        return (
                          <td key={y} style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color, fontWeight: y === latestYear ? 800 : 400 }}>
                            {fmtVal(val, row.fmt)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 20px", background: C.bluePale, borderTop: `1px solid ${C.blueBorder}`, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11 }}>
              <span style={{ color: C.good, fontWeight: 700 }}>● Toimiala-ka parempi</span>
              <span style={{ color: C.bad, fontWeight: 700 }}>● Toimiala-ka heikompi</span>
              <span style={{ color: C.blue, fontWeight: 800 }}>★ Viimeisin vuosi</span>
            </div>
          </Card>
        )}

        {/* ── TAB: VERTAILU ── */}
        {activeTab === "vertailu" && (() => {
          const latestYear = Math.max(...years);
          const stockPe = stock.years[latestYear].pe;
          const maxPe = Math.max(stockPe, sectorAvg.pe, MARKET_AVERAGE.pe) * 1.2;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "stretch" }}>

              {/* LEFT: Toimialavertailu */}
              <Card style={{ padding: 20, display: "flex", flexDirection: "column" }}>
                <SectionTitle>🏢 Toimialavertailu · {stock.sector}</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, justifyContent: "space-between" }}>
                  {[
                    { label: "P/E-luku",       sv: stockPe,                     av: sectorAvg.pe,   lo: true },
                    { label: "PEG-luku",        sv: stock.pegRatio,               av: sectorAvg.peg,  lo: true },
                    { label: "P/B-luku",       sv: stock.years[latestYear].pb,   av: sectorAvg.pb,   lo: true },
                    { label: "ROE-%",          sv: stock.years[latestYear].roe,  av: sectorAvg.roe },
                    { label: "EBIT-%",         sv: stock.years[latestYear].ebit, av: sectorAvg.ebit },
                    { label: "Osinkotuotto-%", sv: stock.years[latestYear].dy,   av: sectorAvg.dy },
                    { label: "Omavaraisuus-%", sv: stock.years[latestYear].eq,   av: sectorAvg.eq },
                  ].map(item => {
                    const better = item.lo ? item.sv < item.av : item.sv > item.av;
                    const clr = better ? C.good : C.bad;
                    const max = Math.max(item.sv, item.av) * 1.2 || 1;
                    return (
                      <div key={item.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                          <span style={{ color: C.textMid, fontWeight: 700 }}>{item.label}</span>
                          <span>
                            <span style={{ color: clr, fontWeight: 800 }}>{item.sv.toFixed(1)}</span>
                            <span style={{ color: C.textLight }}> vs {item.av.toFixed(1)}</span>
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 99, overflow: "hidden", background: C.bluePale }}>
                          <div style={{ width: `${(item.sv / max) * 50}%`, background: clr, borderRadius: 99, transition: "width .6s" }} />
                          <div style={{ width: `${(item.av / max) * 50}%`, background: C.blueBorder, borderRadius: 99 }} />
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: 10, marginTop: 3 }}>
                          <span style={{ color: clr, fontWeight: 700 }}>● {stock.name.split(" ")[0]}</span>
                          <span style={{ color: C.textLight }}>● Toimiala-ka</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* RIGHT: P/E stacked comparison */}
              <Card style={{ padding: 20, display: "flex", flexDirection: "column" }}>
                <SectionTitle>📈 P/E-luvun vertailu</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {[
                    { label: stock.name.split(" ")[0], sublabel: "Valittu osake", value: stockPe, isStock: true },
                    { label: `${stock.sector}`, sublabel: "Toimialakohtainen ka", value: sectorAvg.pe, isStock: false },
                    { label: "Helsingin pörssi", sublabel: "Markkinakeskiarvo", value: MARKET_AVERAGE.pe, isStock: false },
                  ].map(row => {
                    const clr = row.isStock ? (stockPe < sectorAvg.pe ? C.good : C.bad) : C.blueMid;
                    const bg  = row.isStock ? (stockPe < sectorAvg.pe ? C.goodBg : C.badBg) : C.bluePale;
                    const bd  = row.isStock ? (stockPe < sectorAvg.pe ? C.good : C.bad) : C.blueBorder;
                    return (
                      <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderRadius: 12, background: bg, border: `1.5px solid ${bd}`, flex: 1 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.blue }}>{row.label}</div>
                          <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{row.sublabel}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 36, fontWeight: 900, color: clr, lineHeight: 1 }}>
                            {row.value.toFixed(1)}<span style={{ fontSize: 16, fontWeight: 700 }}>x</span>
                          </div>
                          {row.isStock && (
                            <div style={{ fontSize: 11, color: clr, fontWeight: 700, marginTop: 4 }}>
                              {stockPe < sectorAvg.pe ? "▼ Alle toimiala-ka" : "▲ Yli toimiala-ka"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

            </div>
          );
        })()}

        {/* ── TAB: SEURANTA ── */}
        {activeTab === "seuranta" && (
          <Card style={{ padding: 20 }}>
            <SectionTitle>⭐ Seurantalista</SectionTitle>
            {watchlist.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>☆</div>
                <div style={{ color: C.textMid, fontWeight: 600 }}>Seurantalista on tyhjä</div>
                <div style={{ color: C.textLight, fontSize: 12, marginTop: 4 }}>Lisää osakkeita painamalla "Lisää seurantaan"</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {watchlist.map(ticker => {
                  const s = MOCK_STOCKS[ticker];
                  if (!s) return null;
                  const sc = calculateScore(s);
                  const d = s.years[2025];
                  const clr = sc.total >= 70 ? C.good : sc.total >= 50 ? C.warn : C.bad;
                  return (
                    <div key={ticker} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: 16, background: C.bluePale, borderRadius: 12, border: `1.5px solid ${C.blueBorder}` }}>
                      <button onClick={() => selectStock(ticker)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 180, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 24 }}>{s.logo}</span>
                        <div>
                          <div style={{ fontWeight: 800, color: C.blue }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: C.textLight }}>{s.ticker} · {s.sector}</div>
                        </div>
                      </button>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(56px, 1fr))", gap: 12, textAlign: "center" }}>
                        {[
                          { l: "Hinta",  v: `€${s.currentPrice.toFixed(2)}` },
                          { l: "P/E",    v: `${d.pe.toFixed(1)}x` },
                          { l: "ROE",    v: `${d.roe.toFixed(1)}%` },
                          { l: "Osinko", v: `${d.dy.toFixed(1)}%` },
                        ].map(m => (
                          <div key={m.l}>
                            <div style={{ fontSize: 10, color: C.textLight }}>{m.l}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.blue }}>{m.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: C.textLight }}>Pisteet</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: clr }}>{sc.total}</div>
                        </div>
                        <button onClick={() => toggleWatchlist(ticker)}
                          style={{ fontSize: 20, color: "#d97706", background: "none", border: "none", cursor: "pointer" }}
                          title="Poista seurannasta">★</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 16, padding: 14, background: C.bluePale, borderRadius: 10, border: `1px dashed ${C.blueBorder}`, textAlign: "center", fontSize: 12, color: C.textMid }}>
              {apiKeyPresent
                ? <>✅ <strong style={{ color: C.blue }}>Live-data aktiivinen</strong> — Financial Modeling Prep API</>
                : <>💡 <strong style={{ color: C.blue }}>API-integraatio:</strong> Lisää <code>VITE_STOCK_API_KEY</code> ympäristömuuttujiin ottaaksesi live-datan käyttöön</>
              }
            </div>
          </Card>
        )}

        </>) /* end !apiLoading fragment */}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: C.textLight, borderTop: `1px solid ${C.blueBorder}` }}>
          Osakeapuri · {apiKeyPresent ? "Live-data: Financial Modeling Prep" : "Esimerkkidata — ei sijoitusneuvontaa"} · .HE = Nasdaq Helsinki
        </div>
      </main>

      {/* Finnish flag bottom stripe */}
      <div style={{ height: 5, background: `linear-gradient(90deg, ${C.blue} 0%, ${C.blueMid} 50%, ${C.blue} 100%)` }} />
    </div>
  );
}
