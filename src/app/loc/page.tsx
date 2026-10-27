import { Suspense } from 'react';
import { getLocSessionsListAction, getLocSessionAction } from '@/app/actions-loc';
import { getPlayersAction } from '@/app/actions';
import { LocPageClient } from './LocPageClient';
import { LocRound, LocSession } from '@/lib/loc-core';

export const dynamic = 'force-dynamic';

export default async function LocPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const resolvedParams = await searchParams;
  const sessionId = resolvedParams?.session;

  const [sessions, players] = await Promise.all([
    getLocSessionsListAction(),
    getPlayersAction(),
  ]);

  let initialActiveSession: LocSession | null = null;
  let initialRounds: LocRound[] = [];

  if (sessionId) {
    const res = await getLocSessionAction(sessionId);
    initialActiveSession = res.session;
    initialRounds = res.rounds;
  }

  const clubPlayers = (players || []).map(p => ({
    id: String(p.id),
    name: String(p.name),
  }));

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white/50 text-sm">
          Đang tải sổ Lốc...
        </div>
      }
    >
      <LocPageClient
        initialSessions={sessions}
        initialActiveSession={initialActiveSession}
        initialRounds={initialRounds}
        clubPlayers={clubPlayers}
      />
    </Suspense>
  );
}
