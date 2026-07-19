import { redactValue } from "@aplanatic/iserv-api";

const MAX_TEXT = 48_000;

export function boundedText(value: unknown): string {
  const text = JSON.stringify(redactValue(value), null, 2);
  if (text.length <= MAX_TEXT) return text;
  return `${text.slice(0, MAX_TEXT)}\n…[truncated]`;
}

export function success(value: unknown) {
  return { content: [{ type: "text" as const, text: boundedText(value) }] };
}

export function failure(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: boundedText({
          error: error instanceof Error ? error.message : String(error),
        }),
      },
    ],
  };
}
