import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const sampleRows = [
  {
    flight: "SQ231",
    airline: "Singapore Airlines",
    from: "Singapore (SIN)",
    to: "Sydney (SYD)",
    dep: "2024-06-12 08:45",
    arr: "2024-06-12 19:20",
    status: "On time",
    gate: "B12",
    terminal: "2",
  },
  {
    flight: "QF12",
    airline: "Qantas",
    from: "Los Angeles (LAX)",
    to: "Sydney (SYD)",
    dep: "2024-06-12 10:15",
    arr: "2024-06-13 06:45",
    status: "Delayed 35m",
    gate: "T4",
    terminal: "B",
  },
  {
    flight: "DL404",
    airline: "Delta",
    from: "New York (JFK)",
    to: "Seattle (SEA)",
    dep: "2024-06-12 13:05",
    arr: "2024-06-12 16:08",
    status: "Boarding",
    gate: "C21",
    terminal: "4",
  },
  {
    flight: "LH789",
    airline: "Lufthansa",
    from: "Frankfurt (FRA)",
    to: "Dubai (DXB)",
    dep: "2024-06-12 17:30",
    arr: "2024-06-12 23:55",
    status: "On time",
    gate: "A6",
    terminal: "1",
  },
];

type FlightRow = {
  flight: string;
  airline: string;
  from: string;
  to: string;
  dep: string;
  arr: string;
  status: string;
  gate?: string;
  terminal?: string;
};

const statusStyles: Record<string, string> = {
  "On time": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Boarding": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "Delayed 35m": "bg-amber-50 text-amber-700 border-amber-100",
};

const summaryCards = [
  { label: "Departures today", value: "128", trend: "+6%" },
  { label: "Arrivals today", value: "119", trend: "+4%" },
  { label: "Delayed flights", value: "9", trend: "-3%" },
  { label: "Avg turn time", value: "42m", trend: "+2m" },
];

const steps = [
  {
    title: "Upload XLS from Vercel Blob",
    body: "Drop an XLS/XLSX file to preview flights. When connected to Vercel Blob, replace the file picker with signed URLs.",
  },
  {
    title: "Map columns",
    body: "Expected columns: Flight, Airline, From, To, Departure, Arrival, Status, Gate, Terminal. Adjust mapping as needed.",
  },
  {
    title: "Share live ops view",
    body: "Filter by airline, route, or status to keep the ops team synced across stations.",
  },
];

export function App() {
  const [rows, setRows] = useState<FlightRow[]>(sampleRows);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [uploadName, setUploadName] = useState("Sample data loaded");
  const [lastUpdated, setLastUpdated] = useState("Just now");
  const [uploadError, setUploadError] = useState("");

  const statuses = useMemo(() => {
    const unique = Array.from(new Set(rows.map((row) => row.status)));
    return ["All", ...unique];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "All" || row.status === statusFilter;
      const searchable = `${row.flight} ${row.airline} ${row.from} ${row.to}`.toLowerCase();
      return matchesStatus && searchable.includes(query.toLowerCase());
    });
  }, [rows, query, statusFilter]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploadError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number>>(worksheet, {
        defval: "",
      });

      const mapped = jsonData.map((row) => ({
        flight: String(row.Flight ?? row.flight ?? ""),
        airline: String(row.Airline ?? row.airline ?? ""),
        from: String(row.From ?? row.from ?? ""),
        to: String(row.To ?? row.to ?? ""),
        dep: String(row.Departure ?? row.dep ?? row.Dep ?? ""),
        arr: String(row.Arrival ?? row.arr ?? row.Arr ?? ""),
        status: String(row.Status ?? row.status ?? ""),
        gate: String(row.Gate ?? row.gate ?? ""),
        terminal: String(row.Terminal ?? row.terminal ?? ""),
      }));

      const validRows = mapped.filter((row) => row.flight || row.airline);
      setRows(validRows);
      setUploadName(file.name);
      setLastUpdated(new Date().toLocaleString());

      if (!validRows.length) {
        setUploadError(
          "No flight rows were found in this file. Check column names like Flight, Airline, From, To, Departure, and Arrival.",
        );
      }
    } catch {
      setUploadError("Couldn't read this workbook. Please upload a valid .xls, .xlsx, or .xlsm file.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Flight Data Ops
            </p>
            <h1 className="text-3xl font-semibold text-white">Vercel Blob Flight Dashboard</h1>
            <p className="text-sm text-slate-300">
              Upload XLS files from blob storage to monitor live departures and arrivals.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs text-slate-400">Last sync</p>
            <p className="text-lg font-semibold text-white">{lastUpdated}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">XLS ingestion</h2>
                <p className="text-sm text-slate-400">
                  Drag or browse for an Excel file exported from your flight systems.
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                {uploadName}
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-8 text-center hover:border-emerald-300/60 hover:bg-emerald-500/10">
                <input
                  type="file"
                  accept=".xls,.xlsx,.xlsm"
                  className="hidden"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
                <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-200">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Drop XLS/XLSX/XLSM file</p>
                  <p className="text-xs text-slate-400">or browse to load blob content</p>
                </div>
              </label>
              {uploadError && (
                <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
                  {uploadError}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase text-slate-400">Rows loaded</p>
                  <p className="text-2xl font-semibold text-white">{rows.length}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase text-slate-400">Statuses</p>
                  <p className="text-2xl font-semibold text-white">{statuses.length - 1}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase text-slate-400">Sync source</p>
                  <p className="text-sm font-semibold text-white">Vercel Blob</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div>
              <h3 className="text-lg font-semibold">Connection checklist</h3>
              <p className="text-sm text-slate-400">
                Follow these steps when wiring your Vercel Blob endpoint.
              </p>
            </div>
            <div className="space-y-4">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-200">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="text-xs text-slate-400">{step.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-100">
              Tip: Use signed URLs from Vercel Blob to download XLS files securely, then parse them here.
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Live departures & arrivals</h2>
                <p className="text-sm text-slate-400">
                  Filter by flight, route, or status for rapid operations checks.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  placeholder="Search flight, airline, route"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 w-56 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white focus:border-emerald-400 focus:outline-none"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_0.9fr_0.7fr] gap-4 border-b border-white/10 bg-slate-950/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>Flight</span>
                <span>Route</span>
                <span>Departure</span>
                <span>Arrival</span>
                <span>Status</span>
                <span>Gate</span>
              </div>
              <div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">
                {filtered.length ? (
                  filtered.map((row) => (
                    <div
                      key={`${row.flight}-${row.dep}`}
                      className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_0.9fr_0.7fr] gap-4 px-4 py-4 text-sm text-slate-200"
                    >
                      <div>
                        <p className="font-semibold text-white">{row.flight}</p>
                        <p className="text-xs text-slate-500">{row.airline}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white">{row.from}</p>
                        <p className="text-xs text-slate-500">{row.to}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white">{row.dep}</p>
                        <p className="text-xs text-slate-500">Terminal {row.terminal || "-"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white">{row.arr}</p>
                        <p className="text-xs text-slate-500">Gate {row.gate || "-"}</p>
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                            statusStyles[row.status] || "bg-white/5 text-slate-200 border-white/10"
                          }`}
                        >
                          {row.status || "Unknown"}
                        </span>
                      </div>
                      <div className="text-right text-xs text-slate-400">{row.gate || "--"}</div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-slate-400">
                    No flights found. Try another file or clear your search filters.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-slate-900/60 p-5"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-3xl font-semibold text-white">{card.value}</span>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    {card.trend}
                  </span>
                </div>
              </div>
            ))}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-sm font-semibold text-white">Blob endpoints</h3>
              <p className="mt-2 text-xs text-slate-400">
                Store XLS files in Vercel Blob and return signed URLs to this frontend. Parsing happens
                locally with SheetJS for instant previews.
              </p>
              <div className="mt-4 space-y-3 text-xs text-slate-300">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2">
                  <span>latest-departures.xls</span>
                  <span className="text-emerald-300">Synced</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2">
                  <span>latest-arrivals.xls</span>
                  <span className="text-emerald-300">Synced</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
