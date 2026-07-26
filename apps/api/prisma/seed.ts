/**
 * Seeds a demo owner, two football teams with rosters, and one LIVE match with a few events so
 * the app has something to show on first run. Idempotent: safe to run repeatedly.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_EMAIL = process.env.SEED_USER_EMAIL ?? 'olayinkacodes@gmail.com';

/** Create-or-find the seed auth user; the DB trigger creates its profile row. */
async function ensureSeedUser(): Promise<string> {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === SEED_EMAIL);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: SEED_EMAIL,
    email_confirm: true,
    user_metadata: { name: 'Demo' },
  });
  if (error) throw error;
  return data.user.id;
}

const HOME_TEAM_ID = '10000000-0000-4000-8000-000000000001';
const AWAY_TEAM_ID = '10000000-0000-4000-8000-000000000002';
const MATCH_ID = '20000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const userId = await ensureSeedUser();

  // The signup trigger provisions a personal org; resolve it for stamping seeded rows.
  const membership = await prisma.orgMembership.findFirst({
    where: { userId },
    include: { org: true },
  });
  if (!membership) throw new Error('Seed user has no org membership — trigger missing?');
  const orgId = membership.orgId;

  const homePlayers = ['Ada Kwei', 'Bola Nnamdi', 'Chidi Okoro', 'Deji Ade', 'Emeka Obi'];
  const awayPlayers = ['Femi Bello', 'Gozie Eze', 'Hakeem Musa', 'Ike Uzo', 'Jide Kolo'];

  const homeIds = homePlayers.map(() => randomUUID());
  const awayIds = awayPlayers.map(() => randomUUID());

  await prisma.team.upsert({
    where: { id: HOME_TEAM_ID },
    update: {},
    create: {
      id: HOME_TEAM_ID,
      name: 'Harbour FC',
      colors: { primary: '#1E90FF', secondary: '#FFFFFF' },
      sport: 'FOOTBALL',
      createdById: userId,
      organizationId: orgId,
    },
  });
  await prisma.team.upsert({
    where: { id: AWAY_TEAM_ID },
    update: {},
    create: {
      id: AWAY_TEAM_ID,
      name: 'Union Athletic',
      colors: { primary: '#E23B3B', secondary: '#111111' },
      sport: 'FOOTBALL',
      createdById: userId,
      organizationId: orgId,
    },
  });

  async function seedRoster(teamId: string, names: string[], ids: string[]): Promise<void> {
    for (let i = 0; i < names.length; i++) {
      await prisma.player.upsert({
        where: { id: ids[i]! },
        update: {},
        create: { id: ids[i]!, name: names[i]!, createdById: userId, organizationId: orgId },
      });
      await prisma.rosterEntry.upsert({
        where: { teamId_playerId: { teamId, playerId: ids[i]! } },
        update: { jerseyNumber: String(i + 7) },
        create: { teamId, playerId: ids[i]!, jerseyNumber: String(i + 7) },
      });
    }
  }
  await seedRoster(HOME_TEAM_ID, homePlayers, homeIds);
  await seedRoster(AWAY_TEAM_ID, awayPlayers, awayIds);

  await prisma.match.upsert({
    where: { id: MATCH_ID },
    update: {},
    create: {
      id: MATCH_ID,
      sport: 'FOOTBALL',
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
      venue: 'Community Ground',
      scheduledAt: new Date(),
      status: 'LIVE',
      statTier: 'BASIC',
      createdById: userId,
      organizationId: orgId,
      lineups: {
        create: [
          ...homeIds.map((playerId, i) => ({
            side: 'HOME' as const,
            playerId,
            isStarter: true,
            jerseyNumberOverride: String(i + 7),
          })),
          ...awayIds.map((playerId, i) => ({
            side: 'AWAY' as const,
            playerId,
            isStarter: true,
            jerseyNumberOverride: String(i + 7),
          })),
        ],
      },
    },
  });

  // A couple of demo events (goal + assist, and an away goal).
  const existing = await prisma.event.count({ where: { matchId: MATCH_ID } });
  if (existing === 0) {
    await prisma.event.createMany({
      data: [
        {
          id: randomUUID(),
          matchId: MATCH_ID,
          type: 'goal',
          side: 'HOME',
          playerId: homeIds[0]!,
          period: 1,
          clockMs: 12 * 60000,
          recordedById: userId,
        },
        {
          id: randomUUID(),
          matchId: MATCH_ID,
          type: 'assist',
          side: 'HOME',
          playerId: homeIds[1]!,
          period: 1,
          clockMs: 12 * 60000,
          recordedById: userId,
        },
        {
          id: randomUUID(),
          matchId: MATCH_ID,
          type: 'goal',
          side: 'AWAY',
          playerId: awayIds[2]!,
          period: 2,
          clockMs: 58 * 60000,
          recordedById: userId,
        },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log('✅ Seed complete: demo teams, rosters, and a live match are ready.');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
