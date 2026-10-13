// Admin roles: viewer's may read, only the operational roles may drive status,
// and an unknown role fails closed instead of inheriting full access.

import { describe, it, expect } from 'vitest'
import {
  ADMIN_ROLES,
  assertAdminRole,
  canTransition,
  TRANSITION_ROLES,
  type AdminProfile,
} from '../../supabase/functions/admin/auth.js'

const profile = (role: string): AdminProfile => ({
  rowId: '33333333-3333-3333-3333-333333333333',
  name: 'Test Admin',
  email: 'admin@example.com',
  role,
})

describe('admin roles', () => {
  it('lists exactly the four schema roles', () => {
    expect([...ADMIN_ROLES]).toEqual(['super_admin', 'admin', 'manager', 'viewer'])
  })

  it('lets super_admin, admin and manager change status', () => {
    expect(canTransition('super_admin')).toBe(true)
    expect(canTransition('admin')).toBe(true)
    expect(canTransition('manager')).toBe(true)
  })

  it('keeps viewers read-only', () => {
    expect(canTransition('viewer')).toBe(false)
    expect(TRANSITION_ROLES.has('viewer')).toBe(false)
  })

  it('refuses unknown roles', () => {
    expect(canTransition('superadmin')).toBe(false)
    expect(canTransition('')).toBe(false)
    expect(canTransition('ADMIN')).toBe(false)
  })

  it('passes known roles through assertAdminRole', () => {
    for (const role of ADMIN_ROLES) {
      expect(assertAdminRole(profile(role)).role).toBe(role)
    }
  })

  it('throws on an unknown role instead of defaulting to access', () => {
    // A row whose role drifted from the enum must not become a super admin.
    expect(() => assertAdminRole(profile('owner'))).toThrow(/Unknown admin role/)
  })
})