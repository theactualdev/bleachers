'use client';

import { useRouter } from 'next/navigation';
import type { Team } from '@bleachers/types';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { TeamRegistrationForm } from '@/components/team-registration-form';

function NewTeamScreen() {
  const router = useRouter();

  function onDone(team: Team) {
    router.push(`/teams/${team.id}`);
  }

  return (
    <>
      <PageHeader title="New team" />
      <TeamRegistrationForm onDone={onDone} />
    </>
  );
}

export default function NewTeamPage() {
  return (
    <AuthGate>
      <NewTeamScreen />
    </AuthGate>
  );
}
