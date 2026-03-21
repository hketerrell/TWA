import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import scheduleFileUrl from "../flightSearch - Copy (3).xlsm?url";

type FlightRow = Record<string, string | number | boolean | null | undefined>;

type SaveApiSuccess = {
  savedAt: string;
  rowCount: number;
  destination: string;
};

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString();
  return String(value).trim();
}

function inferStatus(row: FlightRow): string {
  const joined = Object.values(row)
    .map((v) => normalize(v).toLowerCase())
    .join(" ");

  if (joined.includes("cancel")) return "Cancelled";
  if (joined.includes("delay")) return "Delayed";
  if (joined.includes("board")) return "Boarding";
  return "On Time";
}

function getDisplayColumns(rows: FlightRow[]): string[] {
  const preferred = [
    "Flight",
    "Flight Number",
    "Airline",
    "From",
    "To",
    "Origin",
    "Destination",
    "Departure",
    "Departure Time",
    "Arrival",
    "Arrival Time",
    "Gate",
    "Status",
  ];

  const existing = new Set(rows.flatMap((r) => Object.keys(r)));
  const prioritized = preferred.filter((column) => existing.has(column));
  const remaining = [...existing].filter((column) => !prioritized.includes(column));
  return [...prioritized, ...remaining];
}

export function App() {
  const [rows, setRows] = useState<FlightRow[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadWorkbook() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(scheduleFileUrl);
        if (!response.ok) {
          throw new Error(`Unable to fetch ${scheduleFileUrl} (${response.status})`);
        }

        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];

        if (!firstSheet) {
          throw new Error("Workbook has no sheets.");
        }

        const worksheet = workbook.Sheets[firstSheet];
        const parsed = XLSX.utils.sheet_to_json<FlightRow>(worksheet, {
          defval: "",
          raw: false,
        });

        if (!active) return;
        setSheetName(firstSheet);
        setRows(parsed);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unknown loading error.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadWorkbook();

    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(() => getDisplayColumns(rows), [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter((row) => {
      const searchable = Object.values(row)
        .map((v) => normalize(v).toLowerCase())
        .join(" ");
      return searchable.includes(normalizedQuery);
    });
  }, [query, rows]);

  async function saveToCloudflareD1() {
    try {
      setSaveState("saving");
      setSaveMessage("");

      const payload = {
        savedAt: new Date().toISOString(),
        sheetName,
        totalRows: rows.length,
        filteredRows: filteredRows.length,
        data: filteredRows,
      };

      const response = await fetch("/api/save-flights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Cloudflare D1 API save failed (${response.status})`);
      }

      const result = (await response.json()) as SaveApiSuccess;
      setSaveState("success");
      setSaveMessage(`Data saved to Cloudflare D1 (${result.rowCount} rows).`);
    } catch (uploadError) {
      setSaveState("error");
      setSaveMessage(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1>Flight Schedule Dashboard</h1>
          <p className="hero-subtitle">{sheetName ? ` • Sheet: ${sheetName}` : ""}</p>
        </div>
        <div className="hero-stats">
          <article>
            <span>Total Flights</span>
            <strong>{rows.length}</strong>
          </article>
          <article>
            <span>Visible</span>
            <strong>{filteredRows.length}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <input
            aria-label="Search flights"
            className="search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by flight, route, status, gate..."
            value={query}
          />
          <button
            className="save-button"
            disabled={loading || !!error || filteredRows.length === 0 || saveState === "saving"}
            onClick={() => void saveToCloudflareD1()}
            type="button"
          >
            {saveState === "saving" ? "Saving..." : "Save to Cloudflare D1"}
          </button>
        </div>

        {saveMessage && (
          <p className={`state ${saveState === "error" ? "error" : "success"}`}>{saveMessage}</p>
        )}

        {loading && <p className="state">Loading schedule…</p>}
        {!loading && error && <p className="state error">{error}</p>}

        {!loading && !error && filteredRows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Derived Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map((column) => (
                      <td key={`${idx}-${column}`}>{normalize(row[column]) || "—"}</td>
                    ))}
                    <td>
                      <span className="status-pill">{inferStatus(row)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filteredRows.length === 0 && (
          <p className="state">No matching flights found.</p>
        )}
      </section>
    </main>
  );
}
