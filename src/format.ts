import { presentForDisplay, redactValue } from "@aplanatic/iserv-api";

const MAX_TEXT = 48_000;

/**
 * Formats a value for MCP text output as clean, agent-readable structured data.
 * Prefer tables/lists over HTML dumps.
 */
export function formatForAgent(value: unknown): string {
  const redacted = presentForDisplay(redactValue(value));
  const text = formatValue(redacted, 0);
  if (text.length > MAX_TEXT) {
    return `${text.slice(0, MAX_TEXT)}\n…[truncated]`;
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
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
  if (arr.length === 0) return "(empty)";

  if (arr.length > 0 && isRecord(arr[0]) && depth < 3) {
    const keys = [
      ...new Set(
        arr
          .slice(0, 8)
          .flatMap((item) => Object.keys(item as Record<string, unknown>)),
      ),
    ].slice(0, 10);

    const parts: string[] = [`[${arr.length} rows]`];
    if (keys.length > 0) parts.push(keys.join(" | "));
    for (let i = 0; i < Math.min(arr.length, 40); i++) {
      const item = arr[i] as Record<string, unknown>;
      const values = keys.map((k) => formatCell(item[k])).join(" | ");
      parts.push(`${i + 1}. ${values}`);
    }
    if (arr.length > 40) parts.push(`… ${arr.length - 40} more`);
    return parts.join("\n");
  }

  const items = arr
    .slice(0, 30)
    .map((item, i) => `${i + 1}. ${formatCell(item)}`);
  if (arr.length > 30) items.push(`… ${arr.length - 30} more`);
  return items.join("\n");
}

function formatRecord(obj: Record<string, unknown>, depth: number): string {
  const parts: string[] = [];

  // Unwrap read-route envelope
  if (obj.routeId && obj.data !== undefined) {
    if (obj._summary || obj.summary) {
      parts.push(`Summary: ${String(obj._summary ?? obj.summary)}`);
    }
    parts.push(formatValue(obj.data, depth));
    return parts.join("\n");
  }

  // Timetable week
  if (
    Array.isArray(obj.rows) &&
    Array.isArray(obj.days) &&
    Array.isArray(obj.periods)
  ) {
    const header = [
      "Timetable",
      obj.class ? String(obj.class) : undefined,
      obj.startDate && obj.endDate
        ? `${obj.startDate} – ${obj.endDate}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
    parts.push(header);
    parts.push(formatArray(obj.rows as unknown[], depth + 1));
    if (Array.isArray(obj.changes) && obj.changes.length > 0) {
      parts.push("", `Changes (${obj.changes.length}):`);
      parts.push(formatArray(obj.changes, depth + 1));
    }
    return parts.join("\n");
  }

  // Timetable day
  if (
    typeof obj.date === "string" &&
    typeof obj.dayName === "string" &&
    Array.isArray(obj.rows) &&
    Array.isArray(obj.lessons)
  ) {
    const header = [
      "Timetable today",
      obj.class ? String(obj.class) : undefined,
      `${String(obj.dayName)} ${String(obj.date)}`,
    ]
      .filter(Boolean)
      .join(" · ");
    parts.push(header);
    if (obj.empty || (obj.rows as unknown[]).length === 0) {
      parts.push(String(obj.message ?? "No lessons today."));
      return parts.join("\n");
    }
    parts.push(formatArray(obj.rows as unknown[], depth + 1));
    if (Array.isArray(obj.changes) && obj.changes.length > 0) {
      parts.push("", `Changes (${obj.changes.length}):`);
      parts.push(formatArray(obj.changes, depth + 1));
    }
    return parts.join("\n");
  }

  // Module list { title, items, message, empty }
  if (typeof obj.title === "string" && Array.isArray(obj.items)) {
    parts.push(String(obj.title));
    if (obj.message && (obj.empty || obj.items.length === 0)) {
      parts.push(String(obj.message));
      return parts.join("\n");
    }
    if (obj.items.length === 0) {
      parts.push(String(obj.message ?? "Nothing to show."));
      return parts.join("\n");
    }
    const first = obj.items[0];
    if (
      obj.items.length === 1 &&
      isRecord(first) &&
      typeof first.body === "string" &&
      first.body.trim().length > 0
    ) {
      if (typeof first.meta === "string" && first.meta.trim()) {
        parts.push(String(first.meta));
      }
      parts.push(String(first.body));
      return parts.join("\n");
    }
    parts.push(formatArray(obj.items, depth + 1));
    return parts.join("\n");
  }

  // Projected content { rows, headers } or { items }
  if (Array.isArray(obj.rows)) {
    if (obj.title) parts.push(String(obj.title));
    parts.push(formatArray(obj.rows as unknown[], depth + 1));
    return parts.join("\n");
  }
  if (Array.isArray(obj.items)) {
    if (obj.title) parts.push(String(obj.title));
    if (obj.message && obj.items.length === 0) {
      parts.push(String(obj.message));
      return parts.join("\n");
    }
    parts.push(formatArray(obj.items as unknown[], depth + 1));
    return parts.join("\n");
  }
  if (obj.fields && isRecord(obj.fields)) {
    if (obj.title) parts.push(String(obj.title));
    for (const [k, v] of Object.entries(obj.fields)) {
      parts.push(`${humanize(k)}: ${formatCell(v)}`);
    }
    return parts.join("\n");
  }
  if (typeof obj.message === "string" && Object.keys(obj).length <= 3) {
    return String(obj.message);
  }

  // Generic object
  const scalars = Object.entries(obj).filter(
    ([k, v]) => k !== "_summary" && scalar(v),
  );
  const arrays = Object.entries(obj).filter(
    ([k, v]) =>
      k !== "_summary" && Array.isArray(v) && (v as unknown[]).length > 0,
  );
  const records = Object.entries(obj).filter(
    ([k, v]) => k !== "_summary" && isRecord(v),
  );

  if (obj._summary && typeof obj._summary === "string") {
    parts.push(`Summary: ${obj._summary}`);
  }
  for (const [key, val] of scalars) {
    parts.push(`${humanize(key)}: ${formatCell(val)}`);
  }
  for (const [key, val] of arrays) {
    parts.push(`${humanize(key)} (${(val as unknown[]).length}):`);
    parts.push(indent(formatArray(val as unknown[], depth + 1), 2));
  }
  for (const [key, val] of records) {
    parts.push(`${humanize(key)}:`);
    parts.push(
      indent(formatRecord(val as Record<string, unknown>, depth + 1), 2),
    );
  }

  return parts.length ? parts.join("\n") : JSON.stringify(obj, null, 2);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > 100 ? `${clean.slice(0, 100)}…` : clean;
  }
  if (typeof value === "number" || typeof value === "bigint")
    return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isRecord(value)) return `{${Object.keys(value).length}}`;
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
  return { content: [{ type: "text" as const, text: formatForAgent(value) }] };
}

export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `Error: ${message.length > 500 ? `${message.slice(0, 500)}…` : message}`,
      },
    ],
  };
}
