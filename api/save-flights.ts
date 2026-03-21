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
  body?: RequestBody;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
};

type CloudflareD1Result = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
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
      body: JSON.stringify({
        sql: statement,
        params,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`D1 query failed (${response.status})`);
  }

  const payload = (await response.json()) as CloudflareD1Result;

  if (!payload.success) {
    const details = payload.errors?.map((entry) => entry.message).filter(Boolean).join("; ");
    throw new Error(details || "D1 query execution failed");
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = (req.body ?? {}) as RequestBody;

    await executeD1Statement(
      `
      CREATE TABLE IF NOT EXISTS flight_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saved_at TEXT NOT NULL,
        sheet_name TEXT,
        total_rows INTEGER,
        filtered_rows INTEGER,
        payload_json TEXT NOT NULL
      );
      `,
      [],
    );

    const savedAt = body.savedAt ?? new Date().toISOString();
    const rowCount = Array.isArray(body.data) ? body.data.length : 0;

    await executeD1Statement(
      `
      INSERT INTO flight_snapshots (saved_at, sheet_name, total_rows, filtered_rows, payload_json)
      VALUES (?, ?, ?, ?, ?);
      `,
      [
        savedAt,
        body.sheetName ?? null,
        body.totalRows ?? 0,
        body.filteredRows ?? rowCount,
        JSON.stringify(body.data ?? []),
      ],
    );

    res.status(200).json({
      savedAt,
      rowCount,
      destination: "cloudflare-d1",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown D1 save failure";
    res.status(500).json({ error: message });
  }
}
