import { type RouteDefinition, routeCatalog } from "@aplanatic/iserv-api";

export const readableRoutes = routeCatalog.routes.filter(
  (route) =>
    route.method === "GET" &&
    route.sideEffect === "read" &&
    route.authentication === "session" &&
    route.status === "supported",
);

export function toolNameForRoute(route: RouteDefinition): string {
  return `iserv_${route.id.replaceAll(".", "_")}`;
}
