'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MembershipInfo } from '@bleachers/types';

interface OrgState {
  activeOrgId: string | null;
  memberships: MembershipInfo[];
  setActiveOrg: (orgId: string) => void;
  setMemberships: (memberships: MembershipInfo[]) => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set, get) => ({
      activeOrgId: null,
      memberships: [],
      setActiveOrg: (activeOrgId) => set({ activeOrgId }),
      setMemberships: (memberships) => {
        const current = get().activeOrgId;
        const stillValid = memberships.some((m) => m.orgId === current);
        set({
          memberships,
          activeOrgId: stillValid
            ? current
            : ((memberships.find((m) => m.isPersonal) ?? memberships[0])?.orgId ?? null),
        });
      },
    }),
    { name: 'bleachers-org' },
  ),
);

export const useActiveOrgId = () => useOrgStore((s) => s.activeOrgId);
