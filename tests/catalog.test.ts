import { describe, expect, test } from "vitest";
import { readableRoutes, toolNameForRoute } from "../src/catalog.js";
import { boundedText } from "../src/format.js";

describe("MCP catalog", () => {
  test("generates stable read-only tool names", () => {
    expect(readableRoutes.length).toBeGreaterThan(5);
    expect(
      readableRoutes.every(
        (route) => route.sideEffect === "read" && route.method === "GET",
      ),
    ).toBe(true);
    const firstRoute = readableRoutes.at(0);
    expect(firstRoute).toBeDefined();
    if (firstRoute) {
      expect(toolNameForRoute(firstRoute)).toMatch(/^iserv_[a-z0-9_]+$/);
    }
  });

  test("bounds and redacts tool output", () => {
    expect(boundedText({ password: "test-password" })).toContain("[redacted]");
    expect(boundedText("x".repeat(60_000)).length).toBeLessThan(49_000);
  });
});
