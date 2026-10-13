// Admin role helpers — pure TypeScript (no Deno APIs) so the Vitest suite can
// exercise the same role rules the deployed function runs.

export interface AdminProfile {
  /** admin_users.id — the identity recorded in order_status_history.changed_by. */
  rowId: string
  name: string
  email: string
  role: string
}

export const ADMIN_ROLES = ["super_admin", "admin", "manager", "viewer"] as const

export type AdminRole = "super_admin" | "admin" | "manager" | "viewer"

/** Roles allowed to drive an order's status. viewer's are read-only. */
export const TRANSITION_ROLES: ReadonlySet<string> = new Set([
  "super_admin",
  "admin",
  "manager",
])

export function canTransition(role: string): boolean {
  return TRANSITION_ROLES.has(role)
}

/**
 * Narrows the profile to a known role. A row in admin_users with an unexpected
 * role is a configuration error, so it fails closed rather than defaulting to
 * full access.
 */
export function assertAdminRole(profile: AdminProfile): AdminProfile {
  if (!ADMIN_ROLES.includes(profile.role as AdminRole)) {
    throw new Error(`Unknown admin role: ${profile.role}`)
  }
  return profile
}