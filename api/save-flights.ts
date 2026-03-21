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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const uploadUrl = process.env.BLOB_UPLOAD_URL;

  if (!token || !uploadUrl) {
    res.status(500).json({
      error: "Server missing BLOB_READ_WRITE_TOKEN or BLOB_UPLOAD_URL",
    });
    return;
  }

  try {
    const body = (req.body ?? {}) as RequestBody;
    const targetUrl = uploadUrl.includes("?") ? `${uploadUrl}&${token}` : `${uploadUrl}?${token}`;

    const upload = await fetch(targetUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body, null, 2),
    });

    if (!upload.ok) {
      throw new Error(`Blob upload failed (${upload.status})`);
    }

    res.status(200).json({
      uploadedAt: new Date().toISOString(),
      rowCount: Array.isArray(body.rows) ? body.rows.length : 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown blob upload failure";
    res.status(500).json({ error: message });
  }
}
