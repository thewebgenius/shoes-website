export type Role = "admin" | "shopkeeper";

export type Permission =
  | "products:read"
  | "products:write"
  | "products:publish"
  | "reviews:moderate"
  | "analytics:read"
  | "audit:read"
  | "users:manage";

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  shopkeeper: new Set<Permission>(["products:read", "products:write", "products:publish", "reviews:moderate", "analytics:read"]),
  admin: new Set<Permission>([
    "products:read",
    "products:write",
    "products:publish",
    "reviews:moderate",
    "analytics:read",
    "audit:read",
    "users:manage",
  ]),
};

export function can(role: Role | null | undefined, permission: Permission) {
  return !!role && GRANTS[role]?.has(permission) === true;
}
