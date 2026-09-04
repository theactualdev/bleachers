-- Derived-clock state on match. Additive only: the new timestamp is nullable and
-- the two counters are defaulted, so existing rows stay valid without a backfill.
-- Elapsed time is never stored as a counter — it is derived from these columns
-- (see @bleachers/sport-engine clock.ts), which is what survives a page reload.

-- AlterTable
ALTER TABLE "match" ADD COLUMN     "periodStartedAt" TIMESTAMP(3),
ADD COLUMN     "pausedElapsedMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentPeriod" INTEGER NOT NULL DEFAULT 1;
