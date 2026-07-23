-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('FOOTBALL', 'BASKETBALL', 'VOLLEYBALL');

-- CreateEnum
CREATE TYPE "StatTier" AS ENUM ('BASIC', 'ADVANCED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MatchSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'SCORER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('TEAM', 'COMPETITION', 'MATCH');

-- CreateEnum
CREATE TYPE "CompetitionFormat" AS ENUM ('KNOCKOUT', 'ROUND_ROBIN', 'GROUPS', 'LADDER', 'COLLECTION');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "photo" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colors" JSONB NOT NULL,
    "logo" TEXT,
    "sport" "Sport" NOT NULL,
    "isAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entry" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "jerseyNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "format" "CompetitionFormat" NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "homeTeamId" UUID NOT NULL,
    "awayTeamId" UUID NOT NULL,
    "venue" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "statTier" "StatTier" NOT NULL DEFAULT 'BASIC',
    "competitionId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_lineup" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "side" "MatchSide" NOT NULL,
    "playerId" UUID NOT NULL,
    "isStarter" BOOLEAN NOT NULL DEFAULT true,
    "jerseyNumberOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_lineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "side" "MatchSide" NOT NULL,
    "playerId" UUID,
    "period" INTEGER NOT NULL,
    "clockMs" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "replacesEventId" UUID,
    "recordedById" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_grant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "resourceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "player_createdById_idx" ON "player"("createdById");

-- CreateIndex
CREATE INDEX "team_createdById_idx" ON "team"("createdById");

-- CreateIndex
CREATE INDEX "roster_entry_playerId_idx" ON "roster_entry"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entry_teamId_playerId_key" ON "roster_entry"("teamId", "playerId");

-- CreateIndex
CREATE INDEX "match_status_idx" ON "match"("status");

-- CreateIndex
CREATE INDEX "match_competitionId_idx" ON "match"("competitionId");

-- CreateIndex
CREATE INDEX "match_lineup_matchId_idx" ON "match_lineup"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "match_lineup_matchId_playerId_key" ON "match_lineup"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "event_matchId_voided_idx" ON "event"("matchId", "voided");

-- CreateIndex
CREATE INDEX "event_playerId_idx" ON "event"("playerId");

-- CreateIndex
CREATE INDEX "permission_grant_scope_resourceId_idx" ON "permission_grant"("scope", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "permission_grant_userId_scope_resourceId_key" ON "permission_grant"("userId", "scope", "resourceId");

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition" ADD CONSTRAINT "competition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_lineup" ADD CONSTRAINT "match_lineup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_lineup" ADD CONSTRAINT "match_lineup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_replacesEventId_fkey" FOREIGN KEY ("replacesEventId") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grant" ADD CONSTRAINT "permission_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

