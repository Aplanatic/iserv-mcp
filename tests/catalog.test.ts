import { describe, expect, test } from "vitest";
import { readableRoutes, toolNameForRoute } from "../src/catalog.js";
import { formatForAgent } from "../src/format.js";

describe("MCP catalog", () => {
  test("generates stable read-only tool names", () => {
    expect(readableRoutes.length).toBeGreaterThan(5);
    expect(
      readableRoutes.every(
        (route) =>
          route.sideEffect === "read" &&
          route.method === "GET" &&
          route.status === "supported",
      ),
    ).toBe(true);
    expect(readableRoutes.map((route) => route.id)).toEqual(
      expect.arrayContaining([
        "exercise.list",
        "timetable.overview",
        "forums.list",
        "news.list",
        "print.overview",
        "account.info",
        "calendar.overview",
        "calendar.holidays",
        "files.overview",
        "etherpad.list",
        "groupview.overview",
        "office.overview",
      ]),
    );
    expect(readableRoutes.map((route) => route.id)).not.toContain(
      "pinboard.list",
    );
    expect(readableRoutes.map((route) => route.id)).not.toContain(
      "calendar.plugin_events",
    );
    const firstRoute = readableRoutes.at(0);
    expect(firstRoute).toBeDefined();
    if (firstRoute) {
      expect(toolNameForRoute(firstRoute)).toMatch(/^iserv_[a-z0-9_]+$/);
    }
  });

  test("redacts and formats tool output", () => {
    const output = formatForAgent({ password: "test-password" });
    expect(output).toContain("[redacted]");

    const big = formatForAgent({ data: "x".repeat(60_000) });
    expect(big.length).toBeLessThan(49_000);
  });
});
