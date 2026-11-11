import type { StaffRole } from './enums';

/**
 * Company-level permissions. The web app uses them to show and hide UI,
 * Cloud Functions enforce them, and firestore.rules mirrors the same role lists.
 * When you change a list here, update the matching helper in firestore.rules.
 */
export const PERMISSIONS = [
  'company.profile.edit',
  'company.settings.edit',
  'staff.manage',
  'branches.manage',
  'courts.manage',
  'calendar.block',
  'bookings.view',
  'bookings.create',
  'bookings.approve',
  'bookings.cancel',
  'bookings.modify',
  'customers.view',
  'customers.manage',
  'verification.review',
  'verification.reveal',
  'payments.view',
  'payments.record',
  'payments.refund',
  'checkin.operate',
  'checkin.override',
  'services.manage',
  'subscriptions.manage',
  'credits.view',
  'credits.manage',
  'reports.view',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const MANAGER: readonly Permission[] = PERMISSIONS.filter(
  (p) =>
    ![
      'company.settings.edit',
      'staff.manage',
      'branches.manage',
      'verification.reveal',
      'payments.refund',
      'credits.manage',
      'audit.view',
    ].includes(p),
);

const FRONT_DESK: readonly Permission[] = [
  'bookings.view',
  'bookings.create',
  'customers.view',
  'checkin.operate',
  'payments.view',
  'payments.record',
  'credits.view',
];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: ALL,
  admin: ALL,
  manager: MANAGER,
  frontDesk: FRONT_DESK,
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Company admin',
  manager: 'Manager',
  frontDesk: 'Front desk',
};

export function roleCan(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Roles that hold a permission, used to build rules and to sanity check them in tests. */
export function rolesWith(permission: Permission): StaffRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as StaffRole[]).filter((r) => ROLE_PERMISSIONS[r].includes(permission));
}
