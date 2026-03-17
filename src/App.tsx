import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import scheduleFileUrl from "../flightSearch - Copy (3).xlsm?url";

type FlightRow = Record<string, string | number | boolean | null | undefined>;

const SCHEDULE_FILE = scheduleFileUrl;

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

  useEffect(() => {
    let active = true;

    async function loadWorkbook() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(SCHEDULE_FILE);
        if (!response.ok) {
          throw new Error(`Unable to fetch ${SCHEDULE_FILE} (${response.status})`);
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

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1>Flight Schedule Dashboard</h1>
          <p className="hero-subtitle">
            Live view from <code>{SCHEDULE_FILE}</code>
            {sheetName ? ` • Sheet: ${sheetName}` : ""}
          </p>
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
        </div>

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
