/**
 * One-off cleanup: `prisma/seed.ts` used to generate a random player UUID on every run, so
 * every `pnpm db:seed` invocation inserted 10 new duplicate players (plus a throwaway roster
 * entry each) into the seed org. `seed.ts` now uses fixed deterministic UUIDs
 * (`30000000-0000-4000-8000-0000000000NN`), but the *existing* live rows for the 10 seeded
 * names still have random ids — including the "canonical" original that the seeded match's
 * events/lineups/roster entries actually reference.
 *
 * This script, for each of the 10 seeded names in the seed org:
 *   1. Finds the canonical player — the one referenced by an Event or MatchLineup for that
 *      name if any, else the one with the earliest createdAt.
 *   2. Deletes every other same-name player row (cascades to their roster entries / lineups;
 *      none of the known duplicates have events, so nothing gets orphaned).
 *   3. Creates a new player row at the fixed UUID, copying the canonical row's fields.
 *   4. Re-points `event.playerId`, `match_lineup.playerId`, and `roster_entry.playerId` from
 *      the canonical row's old id to the fixed id.
 *   5. Deletes the old canonical row.
 * All of this runs inside one `prisma.$transaction` per name so a failure can't leave a name
 * half-migrated. If a fixed-id row already exists for a name (re-run), that name is skipped.
 *
 * Any player whose name is not in the seeded list is left completely untouched.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_EMAIL = process.env.SEED_USER_EMAIL ?? 'olayinkacodes@gmail.com';

// Must match apps/api/prisma/seed.ts homePlayers/awayPlayers, in the same order — index+1
// gives the NN suffix of the fixed UUID.
const SEEDED_NAMES = [
  'Ada Kwei', // 01
  'Bola Nnamdi', // 02
  'Chidi Okoro', // 03
  'Deji Ade', // 04
  'Emeka Obi', // 05
  'Femi Bello', // 06
  'Gozie Eze', // 07
  'Hakeem Musa', // 08
  'Ike Uzo', // 09
  'Jide Kolo', // 10
] as const;

function fixedIdFor(index: number): string {
  return `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

async function resolveSeedOrgId(): Promise<string> {
  const profile = await prisma.profile.findUnique({ where: { email: SEED_EMAIL } });
  if (!profile) throw new Error(`No profile found for ${SEED_EMAIL}`);
  const membership = await prisma.orgMembership.findFirst({
    where: { userId: profile.id, org: { isPersonal: true } },
  });
  if (!membership) throw new Error(`No personal-org membership found for ${SEED_EMAIL}`);
  return membership.orgId;
}

async function dedupeName(orgId: string, name: string, fixedId: string): Promise<void> {
  const alreadyMigrated = await prisma.player.findUnique({ where: { id: fixedId } });
  if (alreadyMigrated) {
    if (alreadyMigrated.name !== name || alreadyMigrated.organizationId !== orgId) {
      throw new Error(
        `Fixed id ${fixedId} exists but does not match expected name="${name}" org="${orgId}" ` +
          `(found name="${alreadyMigrated.name}" org="${alreadyMigrated.organizationId}")`,
      );
    }
    console.log(`  [skip] ${name}: fixed id ${fixedId} already exists`);
    return;
  }

  const players = await prisma.player.findMany({
    where: { organizationId: orgId, name },
    orderBy: { createdAt: 'asc' },
  });
  if (players.length === 0) {
    console.log(`  [warn] ${name}: no players found in seed org — nothing to do`);
    return;
  }

  // Prefer whichever row is actually referenced by an event or a lineup entry; fall back to
  // the earliest-created row.
  const ids = players.map((p) => p.id);
  const [eventRef, lineupRef] = await Promise.all([
    prisma.event.findFirst({ where: { playerId: { in: ids } }, select: { playerId: true } }),
    prisma.matchLineup.findFirst({ where: { playerId: { in: ids } }, select: { playerId: true } }),
  ]);
  const referencedId = eventRef?.playerId ?? lineupRef?.playerId ?? null;
  const canonical = (referencedId && players.find((p) => p.id === referencedId)) || players[0]!;
  const duplicates = players.filter((p) => p.id !== canonical.id);

  console.log(
    `  ${name}: ${players.length} rows, canonical=${canonical.id}, ${duplicates.length} duplicate(s) to delete`,
  );

  await prisma.$transaction(async (tx) => {
    if (duplicates.length > 0) {
      await tx.player.deleteMany({ where: { id: { in: duplicates.map((p) => p.id) } } });
    }

    await tx.player.create({
      data: {
        id: fixedId,
        name: canonical.name,
        dateOfBirth: canonical.dateOfBirth,
        photo: canonical.photo,
        createdById: canonical.createdById,
        organizationId: canonical.organizationId,
        createdAt: canonical.createdAt,
        updatedAt: canonical.updatedAt,
      },
    });

    await tx.event.updateMany({ where: { playerId: canonical.id }, data: { playerId: fixedId } });
    await tx.matchLineup.updateMany({
      where: { playerId: canonical.id },
      data: { playerId: fixedId },
    });
    await tx.rosterEntry.updateMany({
      where: { playerId: canonical.id },
      data: { playerId: fixedId },
    });

    await tx.player.delete({ where: { id: canonical.id } });
  });
}

async function main(): Promise<void> {
  const orgId = await resolveSeedOrgId();
  console.log(`Seed org: ${orgId}`);

  const beforeTotal = await prisma.player.count({ where: { organizationId: orgId } });
  const beforeSeeded = await prisma.player.count({
    where: { organizationId: orgId, name: { in: [...SEEDED_NAMES] } },
  });
  console.log(`Before: ${beforeTotal} total players in org, ${beforeSeeded} with seeded names`);

  for (let i = 0; i < SEEDED_NAMES.length; i++) {
    const name = SEEDED_NAMES[i]!;
    await dedupeName(orgId, name, fixedIdFor(i));
  }

  const afterTotal = await prisma.player.count({ where: { organizationId: orgId } });
  const afterSeeded = await prisma.player.count({
    where: { organizationId: orgId, name: { in: [...SEEDED_NAMES] } },
  });
  console.log(`After: ${afterTotal} total players in org, ${afterSeeded} with seeded names`);
  console.log(
    `Deleted ${beforeTotal - afterTotal} rows (expected ${beforeSeeded - afterSeeded} of them from seeded names).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
