type FlightRow = Record<string, unknown>;

type RequestBody = {
  savedAt?: string;
  sheetName?: string;
  totalRows?: number;
  filteredRows?: number;
  columns?: string[];
  rows?: string[][];
  byColumn?: Record<string, string[]>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
};

type CloudflareD1QueryResult = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{
    results?: Array<Record<string, unknown>>;
    meta?: {
      last_row_id?: number;
    };
  }>;
};

async function executeD1Statement(statement: string, params: unknown[]) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      "Server missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, or CLOUDFLARE_API_TOKEN",
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: statement, params }),
    },
  );

  if (!response.ok) {
    throw new Error(`D1 query failed (${response.status})`);
  }

  const payload = (await response.json()) as CloudflareD1QueryResult;

  if (!payload.success) {
    const details = payload.errors?.map((entry) => entry.message).filter(Boolean).join("; ");
    throw new Error(details || "D1 query execution failed");
  }

  return payload.result?.[0];
}

function parseRequestBody(rawBody: unknown): RequestBody {
  if (!rawBody) return {};

  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody) as RequestBody;
    } catch {
      throw new Error("Request body must be valid JSON");
    }
  }

  if (typeof rawBody === "object") {
    return rawBody as RequestBody;
  }

  return {};
}

function toFlightRows(data: unknown): FlightRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      return row as FlightRow;
    }

    if (Array.isArray(row)) {
      return row.reduce<FlightRow>((acc, cell, idx) => {
        acc[`column_${idx + 1}`] = cell;
        return acc;
      }, {});
    }

    return { value: row };
  });
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeColumnKey(columnName: string): string {
  return columnName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_./-]/g, "");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseRequestBody(req.body);
    const rows = toFlightRows(body.data);

    if (rows.length === 0) {
      throw new Error("No rows received. Ensure the client sends parsed Excel rows in body.data.");
    }

    await executeD1Statement(
      `
      CREATE TABLE IF NOT EXISTS flight_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saved_at TEXT NOT NULL,
        sheet_name TEXT,
        total_rows INTEGER,
        filtered_rows INTEGER
      );
      `,
      [],
    );

    await executeD1Statement(
      `
      CREATE TABLE IF NOT EXISTS flight_snapshot_cells (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        column_name TEXT NOT NULL,
        column_key TEXT NOT NULL,
        cell_value TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES flight_snapshots(id)
      );
      `,
      [],
    );

    const savedAt = body.savedAt ?? new Date().toISOString();

    const insertSnapshot = await executeD1Statement(
      `
      INSERT INTO flight_snapshots (saved_at, sheet_name, total_rows, filtered_rows)
      VALUES (?, ?, ?, ?);
      `,
      [savedAt, body.sheetName ?? null, body.totalRows ?? rows.length, body.filteredRows ?? rows.length],
    );

    let snapshotId = insertSnapshot?.meta?.last_row_id;

    if (!snapshotId) {
      const lastInsert = await executeD1Statement(`SELECT last_insert_rowid() AS id;`, []);
      const rawId = lastInsert?.results?.[0]?.id;
      snapshotId = typeof rawId === "number" ? rawId : Number(rawId);
    }

    if (!snapshotId || Number.isNaN(snapshotId)) {
      throw new Error("Unable to determine inserted snapshot id");
    }

    let insertedCells = 0;

    for (const [rowIndex, row] of rows.entries()) {
      for (const [columnName, rawValue] of Object.entries(row)) {
        await executeD1Statement(
          `
          INSERT INTO flight_snapshot_cells (snapshot_id, row_index, column_name, column_key, cell_value)
          VALUES (?, ?, ?, ?, ?);
          `,
          [snapshotId, rowIndex, columnName, normalizeColumnKey(columnName), normalizeCellValue(rawValue)],
        );
        insertedCells += 1;
      }
    }

    res.status(200).json({
      savedAt,
      rowCount: rows.length,
      insertedCells,
      snapshotId,
      destination: "cloudflare-d1",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown D1 save failure";
    res.status(500).json({ error: message });
  }
}
