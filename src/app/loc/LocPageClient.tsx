'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LocSession, LocRound, LocDebtItem, LocPlayer } from '@/lib/loc-core';
import { LocLobby } from '@/components/loc/LocLobby';
import { LocLiveSession } from '@/components/loc/LocLiveSession';
import {
  createLocSessionAction,
  addLocRoundAction,
  deleteLocRoundAction,
  getLocSessionAction,
  getLocSessionsListAction,
} from '@/app/actions-loc';

interface LocPageClientProps {
  initialSessions: LocSession[];
  initialActiveSession: LocSession | null;
  initialRounds: LocRound[];
  clubPlayers: { id: string; name: string }[];
}

export function LocPageClient({
  initialSessions,
  initialActiveSession,
  initialRounds,
  clubPlayers,
}: LocPageClientProps) {
  const router = useRouter();

  const [sessions, setSessions] = useState<LocSession[]>(initialSessions);
  const [activeSession, setActiveSession] = useState<LocSession | null>(initialActiveSession);
  const [rounds, setRounds] = useState<LocRound[]>(initialRounds);

  const handleSelectSession = async (sessionId: string) => {
    const res = await getLocSessionAction(sessionId);
    if (res.session) {
      setActiveSession(res.session);
      setRounds(res.rounds);
      router.push(`/loc?session=${sessionId}`);
    }
  };

  const handleBackToLobby = async () => {
    setActiveSession(null);
    setRounds([]);
    router.push('/loc');
    const updated = await getLocSessionsListAction();
    setSessions(updated);
  };

  const handleCreateSession = async (title: string, players: LocPlayer[]) => {
    const res = await createLocSessionAction(title, players);
    if (res.success && res.session) {
      setActiveSession(res.session);
      setRounds([]);
      router.push(`/loc?session=${res.session.id}`);
    } else {
      throw new Error(res.error || 'Không thể tạo buổi chơi');
    }
  };

  const handleAddRound = async (winnerId: string, debts: LocDebtItem[]) => {
    if (!activeSession) return;
    const res = await addLocRoundAction(activeSession.id, winnerId, debts);
    if (!res.success) {
      throw new Error(res.error || 'Không thể lưu ván đấu');
    }
  };

  const handleDeleteRound = async (roundId: string) => {
    if (!activeSession) return;
    const res = await deleteLocRoundAction(roundId, activeSession.id);
    if (!res.success) {
      throw new Error(res.error || 'Không thể xóa ván đấu');
    }
  };

  const handleRefreshData = async () => {
    if (!activeSession) return { session: null, rounds: [] };
    const res = await getLocSessionAction(activeSession.id);
    return res;
  };

  if (activeSession) {
    return (
      <LocLiveSession
        key={activeSession.id}
        initialSession={activeSession}
        initialRounds={rounds}
        onBackToLobby={handleBackToLobby}
        onAddRound={handleAddRound}
        onDeleteRound={handleDeleteRound}
        onRefreshData={handleRefreshData}
      />
    );
  }

  return (
    <LocLobby
      sessions={sessions}
      availableClubPlayers={clubPlayers}
      onSelectSession={handleSelectSession}
      onCreateSession={handleCreateSession}
    />
  );
}
