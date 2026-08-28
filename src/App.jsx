import { useState, useMemo, useCallback } from "react";
import { Loader2, Search, ChevronDown, ChevronUp, Check, AlertTriangle, Copy, Feather } from "lucide-react";

const API_BASE = "https://explorer.inkonchain.com/api/v2";
const LEGACY_API_BASE = "https://explorer.inkonchain.com/api";

// Ink mainnet went live on December 18, 2024.
const LAUNCH_DATE = new Date("2024-12-18T00:00:00Z");
const OG_CUTOFF = new Date(LAUNCH_DATE);
OG_CUTOFF.setUTCMonth(OG_CUTOFF.getUTCMonth() + 3);

function formatDate(d) {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const TIERS = [
  { min: 0, label: "Blank Page", color: "#4A4160", glow: "#6E4BFF33" },
  { min: 20, label: "First Stroke", color: "#7C5CFF", glow: "#7C5CFF55" },
  { min: 40, label: "Sketch", color: "#9B6BFF", glow: "#9B6BFF66" },
  { min: 60, label: "Fresh Ink", color: "#C77DFF", glow: "#C77DFF77" },
  { min: 80, label: "Master Calligrapher", color: "#F0A6FF", glow: "#F0A6FF99" },
];

function getTier(score) {
  let t = TIERS[0];
  for (const tier of TIERS) if (score >= tier.min) t = tier;
  return t;
}

// Rough, illustrative percentile: higher scores get skewed rarer since most wallets
// on any chain cluster at low activity. Not a statistically exact percentile —
// we don't have the full network's score distribution, just total wallet count.
function estimatePower(score, totalWallets) {
  const topPct = Math.max(0.1, 100 - Math.pow(Math.max(score, 0) / 100, 1.6) * 100);
  const outranked = totalWallets ? Math.round(totalWallets * ((100 - topPct) / 100)) : null;
  return { topPct, outranked };
}

const DEFAULT_METRICS = {
  tx: { label: "Transactions", cap: 300, weight: 18, source: "auto", type: "number", unit: "" },
  volume: { label: "Volume (ETH)", cap: 5, weight: 18, source: "auto", type: "number", unit: "Ξ" },
  nft: { label: "NFTs held", cap: 15, weight: 12, source: "auto", type: "number", unit: "" },
  og: { label: "OG (first 3 months)", cap: 1, weight: 10, source: "auto", type: "boolean", unit: "" },
  tydro: { label: "Tydro points", cap: 5000, weight: 18, source: "manual", type: "number", unit: "pts" },
  nado: { label: "Nado points", cap: 5000, weight: 14, source: "manual", type: "number", unit: "pts" },
  kraken: { label: "Kraken verified", cap: 1, weight: 10, source: "manual", type: "boolean", unit: "" },
};

function isValidAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

async function safeJson(res) {
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchAutoData(address) {
  const [countersRes, nftRes, txRes, firstTxRes, statsRes] = await Promise.allSettled([
    fetch(`${API_BASE}/addresses/${address}/counters`),
    fetch(`${API_BASE}/addresses/${address}/nft?type=ERC-721,ERC-1155`),
    fetch(`${API_BASE}/addresses/${address}/transactions`),
    fetch(`${LEGACY_API_BASE}?module=account&action=txlist&address=${address}&sort=asc&page=1&offset=1`),
    fetch(`${API_BASE}/stats`),
  ]);

  let totalWallets = null;
  if (statsRes.status === "fulfilled") {
    const data = await safeJson(statsRes.value);
    if (data && data.total_addresses) totalWallets = parseInt(data.total_addresses, 10) || null;
  }

  let firstTxDate = null;
  if (firstTxRes.status === "fulfilled") {
    const data = await safeJson(firstTxRes.value);
    const first = data && Array.isArray(data.result) ? data.result[0] : null;
    if (first && first.timeStamp) {
      firstTxDate = new Date(parseInt(first.timeStamp, 10) * 1000);
    }
  }
  const isOG = !!(firstTxDate && firstTxDate <= OG_CUTOFF);

  let txCount = 0;
  if (countersRes.status === "fulfilled") {
    const data = await safeJson(countersRes.value);
    if (data && data.transactions_count) txCount = parseInt(data.transactions_count, 10) || 0;
  }

  let nftCount = 0;
  let nftMore = false;
  if (nftRes.status === "fulfilled") {
    const data = await safeJson(nftRes.value);
    if (data && Array.isArray(data.items)) {
      nftCount = data.items.length;
      nftMore = !!data.next_page_params;
    }
  }

  let volumeEth = 0;
  let sampledTx = 0;
  let volumeMore = false;
  if (txRes.status === "fulfilled") {
    const data = await safeJson(txRes.value);
    if (data && Array.isArray(data.items)) {
      sampledTx = data.items.length;
      volumeMore = !!data.next_page_params;
      let totalWei = 0n;
      for (const tx of data.items) {
        try {
          if (tx.value) totalWei += BigInt(tx.value);
        } catch {
          /* skip malformed value */
        }
      }
      volumeEth = Number(totalWei) / 1e18;
    }
  }

  const reached = countersRes.status === "fulfilled" || nftRes.status === "fulfilled" || txRes.status === "fulfilled";

  return { txCount, nftCount, nftMore, volumeEth, sampledTx, volumeMore, reached, firstTxDate, isOG, totalWallets };
}

function InkBlotGauge({ percent, color }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative w-44 h-44 sm:w-52 sm:h-52 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <clipPath id="blotClip">
            <path d="M50 4C64 4 76 9 85 20C94 31 96 47 91 61C86 75 74 87 59 92C44 97 27 94 16 83C5 72 1 55 4 40C7 25 16 13 29 8C36 5 43 4 50 4Z" />
          </clipPath>
          <linearGradient id="inkFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
          <filter id="inkGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M50 4C64 4 76 9 85 20C94 31 96 47 91 61C86 75 74 87 59 92C44 97 27 94 16 83C5 72 1 55 4 40C7 25 16 13 29 8C36 5 43 4 50 4Z"
          fill="#14101F"
          stroke="#3A3155"
          strokeWidth="1"
        />

        <g clipPath="url(#blotClip)">
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="url(#inkFill)"
            style={{
              transform: `translateY(${100 - clamped}%)`,
              transition: "transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            filter="url(#inkGlow)"
          />
        </g>

        <path
          d="M50 4C64 4 76 9 85 20C94 31 96 47 91 61C86 75 74 87 59 92C44 97 27 94 16 83C5 72 1 55 4 40C7 25 16 13 29 8C36 5 43 4 50 4Z"
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          opacity="0.9"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl sm:text-5xl font-semibold tracking-tight" style={{ color: "#F4F0FF" }}>
          {Math.round(clamped)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "#9186B0" }}>
          / 100
        </span>
      </div>
    </div>
  );
}

function MetricRow({ id, cfg, value, onValueChange, onWeightChange, onCapChange, showAdvanced, extraNote }) {
  const isBoolean = cfg.type === "boolean";
  const ratio = isBoolean ? (value ? 1 : 0) : cfg.cap > 0 ? Math.min(value / cfg.cap, 1) : 0;
  return (
    <div className="border-b border-[#241C38] py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: cfg.source === "auto" ? "#7C5CFF" : "#F0A6FF" }}
          />
          <span className="text-sm text-[#D8D2EC] truncate">{cfg.label}</span>
          <span className="text-[10px] font-mono uppercase tracking-wide text-[#635A80] shrink-0">
            {cfg.source === "auto" ? "on-chain" : "manual"}
          </span>
        </div>

        {isBoolean && cfg.source === "manual" ? (
          <button
            onClick={() => onValueChange(value ? 0 : 1)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-colors ${
              value ? "bg-[#7C5CFF] text-white" : "bg-[#1C1630] text-[#8B81A8] border border-[#332A4D]"
            }`}
          >
            {value ? <Check size={12} /> : null}
            {value ? "Verified" : "Not verified"}
          </button>
        ) : isBoolean && cfg.source === "auto" ? (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono ${
              value ? "" : "bg-[#1C1630] text-[#635A80] border border-[#332A4D]"
            }`}
            style={value ? { background: "#3A2A0F", color: "#F0C060", border: "1px solid #6B4E1A" } : undefined}
          >
            {value ? <Check size={12} /> : null}
            {value ? "Yes" : "No"}
          </span>
        ) : cfg.source === "manual" ? (
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => onValueChange(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 bg-[#1C1630] border border-[#332A4D] rounded-md px-2 py-1 text-sm font-mono text-right text-[#F4F0FF] focus:outline-none focus:border-[#7C5CFF]"
          />
        ) : (
          <span className="font-mono text-sm text-[#F4F0FF]">
            {value.toLocaleString("en-US")}
            {cfg.unit ? ` ${cfg.unit}` : ""}
          </span>
        )}
      </div>
      {extraNote && (
        <p className="text-[11px] font-mono mt-1 ml-3.5" style={{ color: "#635A80" }}>
          {extraNote}
        </p>
      )}

      <div className="mt-2 h-1 rounded-full bg-[#1C1630] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${ratio * 100}%`,
            background: "linear-gradient(90deg,#7C5CFF,#F0A6FF)",
            transition: "width 0.6s ease",
          }}
        />
      </div>

      {showAdvanced && (
        <div className="mt-2 flex items-center gap-4 text-[11px] font-mono text-[#8B81A8]">
          <label className="flex items-center gap-1.5">
            weight
            <input
              type="number"
              min="0"
              value={cfg.weight}
              onChange={(e) => onWeightChange(Math.max(0, Number(e.target.value) || 0))}
              className="w-14 bg-[#1C1630] border border-[#332A4D] rounded px-1.5 py-0.5 text-right"
            />
          </label>
          {!isBoolean && (
            <label className="flex items-center gap-1.5">
              cap (100%)
              <input
                type="number"
                min="1"
                value={cfg.cap}
                onChange={(e) => onCapChange(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 bg-[#1C1630] border border-[#332A4D] rounded px-1.5 py-0.5 text-right"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default function InkChecker() {
  const [addressInput, setAddressInput] = useState("");
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchIncomplete, setFetchIncomplete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const [metrics, setMetrics] = useState(DEFAULT_METRICS);
  const [values, setValues] = useState({ tx: 0, volume: 0, nft: 0, og: 0, tydro: 0, nado: 0, kraken: 0 });
  const [sampleNote, setSampleNote] = useState(null);
  const [firstTxDate, setFirstTxDate] = useState(null);
  const [totalWallets, setTotalWallets] = useState(null);

  const handleCheck = useCallback(async () => {
    const addr = addressInput.trim();
    setError(null);
    setFetchIncomplete(false);
    setSampleNote(null);
    setFirstTxDate(null);

    if (!isValidAddress(addr)) {
      setError("That's not a valid Ink address (format: 0x + 40 hex characters).");
      return;
    }

    setAddress(addr);
    setLoading(true);
    try {
      const data = await fetchAutoData(addr);
      if (!data.reached) {
        setFetchIncomplete(true);
      }
      setValues((prev) => ({
        ...prev,
        tx: data.txCount,
        volume: Math.round(data.volumeEth * 10000) / 10000,
        nft: data.nftCount,
        og: data.isOG ? 1 : 0,
      }));
      setFirstTxDate(data.firstTxDate || null);
      setTotalWallets(data.totalWallets || null);
      if (data.volumeMore || data.nftMore) {
        setSampleNote(
          `Volume calculated from the last ${data.sampledTx || 50} tx${
            data.nftMore ? " · there may be more NFTs than shown" : ""
          }.`
        );
      }
    } catch (e) {
      setFetchIncomplete(true);
      setError("Couldn't connect to the Ink explorer. Check your connection or enter the data manually.");
    } finally {
      setLoading(false);
    }
  }, [addressInput]);

  const score = useMemo(() => {
    const totalWeight = Object.values(metrics).reduce((s, m) => s + m.weight, 0) || 1;
    let acc = 0;
    for (const key of Object.keys(metrics)) {
      const cfg = metrics[key];
      const val = values[key] || 0;
      const ratio = cfg.type === "boolean" ? (val ? 1 : 0) : Math.min(val / cfg.cap, 1);
      acc += ratio * cfg.weight;
    }
    return (acc / totalWeight) * 100;
  }, [metrics, values]);

  const tier = getTier(score);
  const power = useMemo(() => estimatePower(score, totalWallets), [score, totalWallets]);

  const updateValue = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));
  const updateWeight = (key, w) => setMetrics((prev) => ({ ...prev, [key]: { ...prev[key], weight: w } }));
  const updateCap = (key, c) => setMetrics((prev) => ({ ...prev, [key]: { ...prev[key], cap: c } }));

  const handleCopy = () => {
    const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "wallet";
    const text = `Ink Checker — ${short}\nScore: ${Math.round(score)}/100 · ${tier.label}${
      values.og ? " · OG" : ""
    }\nPower: top ~${power.topPct.toFixed(1)}%${
      totalWallets ? ` of ~${totalWallets.toLocaleString("en-US")} wallets` : ""
    }\nFirst tx: ${firstTxDate ? formatDate(firstTxDate) : "n/a"}\nTX: ${values.tx} · Vol: ${values.volume}Ξ · NFTs: ${values.nft} · Tydro: ${values.tydro} · Nado: ${values.nado} · Kraken: ${values.kraken ? "yes" : "no"}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-4 py-10 sm:py-14"
      style={{
        background: "radial-gradient(120% 100% at 50% -10%, #1C1433 0%, #0C0916 55%, #08060E 100%)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .font-display { font-family: 'Fraunces', serif; font-feature-settings: 'liga' 1; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2.5 mb-3">
          <Feather size={18} style={{ color: "#9B6BFF" }} />
          <span className="font-mono text-xs uppercase tracking-[0.25em]" style={{ color: "#8B81A8" }}>
            Ink Chain · Wallet Checker
          </span>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] mb-2" style={{ color: "#F4F0FF" }}>
          How much ink<br />did your wallet leave?
        </h1>
        <p className="text-sm mb-8" style={{ color: "#9186B0" }}>
          Combines on-chain TX, volume, and NFTs with your Tydro points, Nado points, and Kraken verification into a
          single score.
        </p>

        <div className="flex gap-2 mb-2">
          <input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            placeholder="0x..."
            className="flex-1 min-w-0 bg-[#14101F] border border-[#332A4D] rounded-lg px-4 py-3 text-sm font-mono text-[#F4F0FF] placeholder-[#544A70] focus:outline-none focus:border-[#7C5CFF] transition-colors"
          />
          <button
            onClick={handleCheck}
            disabled={loading}
            className="shrink-0 flex items-center gap-2 px-4 sm:px-5 py-3 rounded-lg text-sm font-medium text-white transition-transform active:scale-95 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#7C5CFF,#B26BFF)" }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? "Reading..." : "Check"}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "#2A1730", color: "#F0A6FF" }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {fetchIncomplete && !error && (
          <div className="flex items-start gap-2 text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "#221A38", color: "#C4B8E8" }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>Some on-chain data didn't load. You can fill it in manually below.</span>
          </div>
        )}
        {sampleNote && (
          <p className="text-[11px] font-mono mb-4" style={{ color: "#635A80" }}>
            {sampleNote}
          </p>
        )}

        {address && (
          <>
            <div
              className="rounded-2xl p-5 sm:p-6 mb-5 flex flex-col sm:flex-row items-center gap-6"
              style={{ background: "#120D1E", border: "1px solid #241C38" }}
            >
              <InkBlotGauge percent={score} color={tier.color} />
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "#635A80" }}>
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </p>
                  {values.og ? (
                    <span
                      className="font-mono text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ background: "#3A2A0F", color: "#F0C060", border: "1px solid #6B4E1A" }}
                    >
                      OG
                    </span>
                  ) : null}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl mb-1" style={{ color: tier.color }}>
                  {tier.label}
                </h2>
                <p className="font-mono text-[11px] mb-2" style={{ color: "#8B81A8" }}>
                  {firstTxDate
                    ? `First tx: ${formatDate(firstTxDate)}`
                    : "No transactions detected on Ink"}
                </p>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full border transition-colors"
                  style={{ borderColor: "#332A4D", color: copied ? "#B7F0C4" : "#9186B0" }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy summary"}
                </button>
              </div>
            </div>

            <div
              className="rounded-2xl p-5 sm:p-6 mb-5"
              style={{ background: "#120D1E", border: "1px solid #241C38" }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium" style={{ color: "#D8D2EC" }}>
                  Power Rank
                </h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded-full" style={{ background: "#1C1630", color: "#C77DFF" }}>
                  top ~{power.topPct >= 10 ? power.topPct.toFixed(0) : power.topPct.toFixed(1)}%
                </span>
              </div>

              <div className="h-2 rounded-full bg-[#1C1630] overflow-hidden mb-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${100 - power.topPct}%`,
                    background: "linear-gradient(90deg,#7C5CFF,#C77DFF,#F0C060)",
                    transition: "width 0.8s ease",
                  }}
                />
              </div>

              <p className="text-xs" style={{ color: "#9186B0" }}>
                {totalWallets
                  ? `Outranks an estimated ${power.outranked.toLocaleString("en-US")} of ~${totalWallets.toLocaleString(
                      "en-US"
                    )} wallets that have ever touched Ink.`
                  : "Wallet count unavailable right now — showing score-based estimate only."}
              </p>
              <p className="text-[10px] font-mono mt-2" style={{ color: "#544A70" }}>
                Illustrative estimate derived from your score, not a measured percentile of the full network.
              </p>
            </div>

            <div className="rounded-2xl p-5 sm:p-6" style={{ background: "#120D1E", border: "1px solid #241C38" }}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium" style={{ color: "#D8D2EC" }}>
                  Breakdown
                </h3>
                <button
                  onClick={() => setShowAdvanced((s) => !s)}
                  className="flex items-center gap-1 text-[11px] font-mono"
                  style={{ color: "#8B81A8" }}
                >
                  Settings {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {Object.keys(metrics).map((key) => (
                <MetricRow
                  key={key}
                  id={key}
                  cfg={metrics[key]}
                  value={values[key]}
                  onValueChange={(v) => updateValue(key, v)}
                  onWeightChange={(w) => updateWeight(key, w)}
                  onCapChange={(c) => updateCap(key, c)}
                  showAdvanced={showAdvanced}
                  extraNote={
                    key === "og"
                      ? `OG window: Dec 18, 2024 – Mar 18, 2025${firstTxDate ? ` · detected: ${formatDate(firstTxDate)}` : ""}`
                      : null
                  }
                />
              ))}
            </div>
          </>
        )}

        {!address && !loading && (
          <p className="text-xs font-mono mt-2" style={{ color: "#544A70" }}>
            TX, volume, and NFTs are read automatically from the Ink explorer. You enter Tydro, Nado, and Kraken
            yourself.
          </p>
        )}
      </div>
    </div>
  );
}
