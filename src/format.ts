import { redactValue } from "@aplanatic/iserv-api";

const MAX_TEXT = 48_000;

/**
 * Formats a value for MCP text output with rich structure, summaries,
 * and agent-friendly compact representations.
 */
export function formatForAgent(value: unknown): string {
  const redacted = redactValue(value);
  return formatValue(redacted, 0);
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value: unknown, depth: number): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return formatArray(value, depth);
  if (isRecord(value)) return formatRecord(value, depth);
  return String(value);
}

function formatArray(arr: unknown[], depth: number): string {
  if (arr.length === 0) return "[]";

  // If shallow depth and records, format as structured
  if (arr.length > 0 && isRecord(arr[0]) && depth < 2) {
    const parts: string[] = [`[${arr.length} items]`];
    const keys = [
      ...new Set(arr.slice(0, 5).flatMap((item) => Object.keys(item as Record<string, unknown>))),
    ].slice(0, 8);

    for (let i = 0; i < Math.min(arr.length, 20); i++) {
      const item = arr[i] as Record<string, unknown>;
      const values = keys
        .map((k) => {
          const v = item[k];
          return v !== undefined && v !== null ? formatCell(v) : "";
        })
        .filter(Boolean)
        .join(" | ");
      parts.push(`  ${i + 1}. ${values}`);
    }
    if (arr.length > 20) {
      parts.push(`  ... ${arr.length - 20} more`);
    }
    return parts.join("\n");
  }

  // Scalar array
  const items = arr.slice(0, 15).map((item) => formatCell(item));
  const preview = items.join(", ");
  if (arr.length <= 15) return `[${preview}]`;
  return `[${preview} ... (${arr.length - 15} more)]`;
}

function formatRecord(
  obj: Record<string, unknown>,
  depth: number,
): string {
  const parts: string[] = [];
  const keys = Object.keys(obj);

  // Extract _summary as prefix if present
  if (obj._summary && typeof obj._summary === "string") {
    parts.push(`Summary: ${obj._summary}`);
  }

  // Handle HtmlExtractedData
  if (obj.kind === "html-extracted") {
    return formatHtmlExtracted(obj as unknown as {
      title?: string;
      tables: Array<{ caption?: string; headers: string[]; rows: Record<string, string>[] }>;
      keyValues: Record<string, string>;
      sections: Array<{ level: number; heading: string; content: string[] }>;
      links: Array<{ text: string; href: string }>;
      lists: Array<{ label?: string; items: string[] }>;
      metadata: Record<string, string>;
      bytes: number;
    });
  }

  // Special readable formats
  if (obj.kind === "html-structure") {
    // Legacy fallback
    return JSON.stringify(obj, null, 2);
  }

  // For route results with routeId
  if (obj.routeId && typeof obj.routeId === "string") {
    parts.push(`Route: ${obj.routeId}`);
    if (typeof obj.status === "number") {
      const statusText = obj.status >= 200 && obj.status < 300 ? "OK" : "Error";
      parts.push(`Status: ${obj.status} ${statusText}`);
    }
    if (typeof obj.durationMs === "number") {
      parts.push(`Duration: ${obj.durationMs}ms`);
    }
    if (obj.data !== undefined && obj.data !== null) {
      parts.push(`Data: ${formatValue(obj.data, depth + 1)}`);
    }
    return parts.join("\n");
  }

  // Standard key-value rendering
  const scalars = keys.filter(
    (k) => k !== "_summary" && scalar(obj[k]),
  );
  const arrays = keys.filter(
    (k) => k !== "_summary" && Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0,
  );
  const records = keys.filter(
    (k) => k !== "_summary" && isRecord(obj[k]),
  );

  for (const key of scalars) {
    parts.push(`${humanize(key)}: ${formatCell(obj[key])}`);
  }

  for (const key of arrays) {
    const arr = obj[key] as unknown[];
    parts.push(`${humanize(key)} (${arr.length}):`);
    const formatted = formatArray(arr, depth + 1);
    if (formatted !== "[]") {
      parts.push(indent(formatted, 2));
    }
  }

  for (const key of records) {
    const val = obj[key] as Record<string, unknown>;
    const subKeys = Object.keys(val);
    if (subKeys.length <= 8) {
      parts.push(`${humanize(key)}:`);
      for (const sk of subKeys) {
        parts.push(`  ${humanize(sk)}: ${formatCell(val[sk])}`);
      }
    } else {
      parts.push(`${humanize(key)}: ${JSON.stringify(val).slice(0, 200)}`);
    }
  }

  if (parts.length === 0) return JSON.stringify(obj, null, 2);

  const result = parts.join("\n");
  if (result.length > MAX_TEXT) {
    return `${result.slice(0, MAX_TEXT)}\n...[truncated]`;
  }
  return result;
}

function formatHtmlExtracted(extracted: {
  title?: string;
  tables: Array<{ caption?: string; headers: string[]; rows: Record<string, string>[] }>;
  keyValues: Record<string, string>;
  sections: Array<{ level: number; heading: string; content: string[] }>;
  links: Array<{ text: string; href: string }>;
  lists: Array<{ label?: string; items: string[] }>;
  metadata: Record<string, string>;
  bytes: number;
}): string {
  const parts: string[] = [];

  if (extracted.title) {
    parts.push(`# ${extracted.title}`);
  }

  // Key values (most important)
  const kvEntries = Object.entries(extracted.keyValues);
  if (kvEntries.length > 0) {
    parts.push("", "## Fields");
    for (const [k, v] of kvEntries.slice(0, 30)) {
      parts.push(`  ${k}: ${v.length > 120 ? v.slice(0, 120) + "..." : v}`);
    }
  }

  // Tables
  for (const table of extracted.tables.slice(0, 10)) {
    parts.push("", `## Table${table.caption ? `: ${table.caption}` : ""} (${table.rows.length} rows)`);
    if (table.headers.length > 0 && table.rows.length > 0) {
      parts.push(`  Headers: ${table.headers.join(" | ")}`);
      for (let i = 0; i < Math.min(table.rows.length, 30); i++) {
        const row = table.rows[i]!;
        const values = table.headers
          .map((h) => row[h] || "")
          .join(" | ");
        parts.push(`  ${i + 1}. ${values}`);
      }
      if (table.rows.length > 30) {
        parts.push(`  ... ${table.rows.length - 30} more rows`);
      }
    } else {
      for (let i = 0; i < Math.min(table.rows.length, 30); i++) {
        const row = table.rows[i]!;
        parts.push(`  ${i + 1}. ${Object.values(row).join(" | ")}`);
      }
    }
  }

  // Sections
  for (const section of extracted.sections.slice(0, 20)) {
    const prefix = "#".repeat(section.level + 1);
    parts.push("", `${prefix} ${section.heading}`);
    for (const content of section.content.slice(0, 5)) {
      parts.push(`  ${content.length > 200 ? content.slice(0, 200) + "..." : content}`);
    }
  }

  // Lists
  for (const list of extracted.lists.slice(0, 10)) {
    parts.push("", `## ${list.label || "List"} (${list.items.length} items)`);
    for (const item of list.items.slice(0, 20)) {
      parts.push(`  - ${item.length > 120 ? item.slice(0, 120) + "..." : item}`);
    }
    if (list.items.length > 20) {
      parts.push(`  ... ${list.items.length - 20} more`);
    }
  }

  // Links
  if (extracted.links.length > 0) {
    parts.push("", `## Links (${extracted.links.length})`);
    for (const link of extracted.links.slice(0, 15)) {
      parts.push(`  - ${link.text}: ${link.href}`);
    }
    if (extracted.links.length > 15) {
      parts.push(`  ... ${extracted.links.length - 15} more`);
    }
  }

  // Metadata
  const metaEntries = Object.entries(extracted.metadata).filter(
    ([k]) => !k.startsWith("_"),
  );
  if (metaEntries.length > 0) {
    parts.push("", "## Metadata");
    for (const [k, v] of metaEntries) {
      parts.push(`  ${k}: ${v}`);
    }
  }

  const result = parts.join("\n");
  if (result.length > MAX_TEXT) {
    return `${result.slice(0, MAX_TEXT)}\n...[truncated]`;
  }
  return result;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > 80 ? clean.slice(0, 80) + "..." : clean;
  }
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (isRecord(value)) return `{${Object.keys(value).length} fields}`;
  return String(value);
}

function scalar(value: unknown): boolean {
  return (
    value === null ||
    ["string", "number", "boolean", "undefined"].includes(typeof value)
  );
}

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^_/, "")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

export function success(value: unknown) {
  const text = formatForAgent(value);
  if (text.length > MAX_TEXT) {
    return {
      content: [
        { type: "text" as const, text: `${text.slice(0, MAX_TEXT)}\n...[truncated]` },
      ],
    };
  }
  return { content: [{ type: "text" as const, text }] };
}

export function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `Error: ${message.length > 500 ? message.slice(0, 500) + "..." : message}`,
      },
    ],
  };
}
