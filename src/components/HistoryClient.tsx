'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { ArrowLeft, Calendar, Clock, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { deleteMatchAction } from '@/app/actions';
import { buildAnalysisElo, isFullDoublesMatch, type AnalysisMatch } from '@/lib/analysis-core';
import { removeMatchesLocal, type StoredMatch, type StoredPlayer, type StoredPlayerSeasonSetting, type StoredSeason } from '@/lib/db';
import { isGuestId, isRankingMatch } from '@/lib/guest';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import { cn } from '@/lib/utils';

type Player = StoredPlayer & {
  id: string;
  name: string;
  active?: boolean;
  hidden?: boolean;
  pay_fine?: boolean;
};

type Match = StoredMatch & {
  id: string;
  date: string;
  win_1: string;
  win_2?: string | null;
  lose_1: string;
  lose_2?: string | null;
  win_score?: number;
  lose_score?: number;
  season?: string | null;
  deleted_at?: unknown;
};

type Season = StoredSeason & {
  name: string;
};

const EDIT_EVENT = 'pickleball-edit-mode-change';

function subscribeEditMode(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(EDIT_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EDIT_EVENT, callback);
  };
}

function getEditModeSnapshot() {
  return localStorage.getItem('pickleball_edit_unlocked') === 'true';
}

function matchTime(match: Match) {
  return new Date(match.date || 0).getTime() || 0;
}

function seasonStartTime(seasons: Season[], seasonName: string) {
  const season = seasons.find(item => item.name === seasonName || item.id === seasonName);
  return new Date(season?.start_date || 0).getTime() || 0;
}

function groupMatchesBySeason(matches: Match[], seasons: Season[]) {
  const groups = new Map<string, Match[]>();

  matches.forEach(match => {
    const season = match.season || 'Season 1';
    groups.set(season, [...(groups.get(season) || []), match]);
  });

  return Array.from(groups.entries())
    .map(([season, list]) => ({
      season,
      matches: [...list].sort((a, b) => matchTime(b) - matchTime(a)),
      startTime: seasonStartTime(seasons, season),
    }))
    .sort((a, b) => b.startTime - a.startTime || matchTime(b.matches[0]) - matchTime(a.matches[0]) || b.season.localeCompare(a.season));
}

function getPlayerSetting(
  players: Player[],
  settings: StoredPlayerSeasonSetting[],
  playerId: string,
  seasonName: string,
) {
  const seasonSetting = settings.find(item => item.player_id === playerId && item.season === seasonName);
  if (seasonSetting) {
    return {
      active: seasonSetting.active !== false,
      hidden: seasonSetting.hidden === true,
    };
  }

  const player = players.find(item => item.id === playerId);
  return {
    active: player?.active !== false,
    hidden: player?.hidden === true,
  };
}

function matchHasInactivePlayer(match: Match, players: Player[], settings: StoredPlayerSeasonSetting[]) {
  const season = match.season || 'Season 1';
  return [match.win_1, match.win_2, match.lose_1, match.lose_2]
    .filter((id): id is string => Boolean(id) && !isGuestId(id))
    .some(id => !getPlayerSetting(players, settings, id, season).active);
}

function playerName(players: Player[], id?: string | null) {
  if (!id) return '--';
  if (isGuestId(id)) return 'Khách';
  return players.find(player => player.id === id)?.name || id;
}

function DeleteButton({
  matchId,
  onDeleted,
}: {
  matchId: string;
  onDeleted: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (confirmed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-red-400/80 uppercase tracking-widest">Xóa?</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const result = await deleteMatchAction(matchId);
              if (result && !('error' in result)) {
                await removeMatchesLocal([matchId]);
                onDeleted();
              }
              setConfirmed(false);
            });
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-90 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Xác nhận
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirmed(false)}
          className="rounded-lg bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/40 transition-all active:scale-90 disabled:opacity-50"
        >
          Hủy
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmed(true)}
      disabled={isPending}
      className={cn('rounded-lg p-1.5 text-white/15 transition-all hover:bg-red-500/10 hover:text-red-400 active:scale-90', isPending && 'opacity-40')}
      aria-label="Xóa trận"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export default function HistoryClient({
  initialPlayers,
  initialMatches,
  initialConfig = {},
  initialSeasons = [],
  initialPlayerSeasonSettings = [],
  previewWritesBlocked = false,
}: {
  initialPlayers: Player[];
  initialMatches: Match[];
  initialConfig?: Record<string, string>;
  initialSeasons?: Season[];
  initialPlayerSeasonSettings?: StoredPlayerSeasonSetting[];
  previewWritesBlocked?: boolean;
}) {
  const sharedData = useSharedAppData({
    initialPlayers,
    initialMatches,
    initialConfig,
    initialSeasons,
    initialPlayerSeasonSettings,
    routeKey: 'history',
  });

  const canEdit = useSyncExternalStore(subscribeEditMode, getEditModeSnapshot, () => false);
  const canWrite = canEdit && !previewWritesBlocked;
  const players = sharedData.players as Player[];
  const matches = useMemo(
    () => (sharedData.matches as Match[]).filter(match => !match.deleted_at).sort((a, b) => matchTime(b) - matchTime(a)),
    [sharedData.matches],
  );
  const seasons = sharedData.seasons as Season[];
  const playerSeasonSettings = sharedData.playerSeasonSettings;

  const eloPlayers = useMemo(() => (
    players.filter(player => {
      if (isGuestId(player.id)) return false;
      const anyVisibleSetting = playerSeasonSettings.some(setting =>
        setting.player_id === player.id && setting.active !== false && setting.hidden !== true
      );
      return anyVisibleSetting || (player.active !== false && player.hidden !== true);
    })
  ), [players, playerSeasonSettings]);

  const matchExpected = useMemo(() => {
    const rankingMatches = matches
      .filter(match => !matchHasInactivePlayer(match, players, playerSeasonSettings))
      .filter(match => isRankingMatch(match) && isFullDoublesMatch(match as AnalysisMatch));
    return buildAnalysisElo(eloPlayers, rankingMatches as AnalysisMatch[]).matchExpected;
  }, [eloPlayers, matches, players, playerSeasonSettings]);

  const grouped = useMemo(() => groupMatchesBySeason(matches, seasons), [matches, seasons]);
  const hasNoCache = !sharedData.hasLocalCache && sharedData.syncState !== 'idle';

  return (
    <div className="mx-auto max-w-[1000px] space-y-8 px-4 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <Link
          href="/"
          className="group flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Quay lại
        </Link>
        <span className="text-white/10">|</span>
        <h1 className="text-2xl font-black tracking-tighter text-white/90 sm:text-4xl">
          Toàn bộ lịch sử
          <span className="ml-4 align-middle text-sm font-black uppercase tracking-widest text-white/20">
            {matches.length} trận
          </span>
        </h1>
        {sharedData.syncMessage ? (
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-slate-500/20 bg-[#142034]/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300/60">
            <RefreshCw className={cn('h-3.5 w-3.5', sharedData.syncState === 'syncing' && 'animate-spin')} />
            {sharedData.syncMessage}
          </div>
        ) : null}
      </div>

      {hasNoCache && (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-primary">
          Đang tải dữ liệu...
        </div>
      )}

      {previewWritesBlocked && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-xs font-bold text-amber-200">
          Dev preview đang dùng chung database với production nên thao tác xóa đã bị khóa để bảo vệ data thật.
        </div>
      )}

      {grouped.map(({ season, matches: seasonMatches }) => (
        <div key={season} className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.4em] text-primary/60">
              {season}
            </span>
            <span className="text-sm font-bold text-white/20">{seasonMatches.length} trận</span>
          </div>

          <div className="grid gap-3">
            {seasonMatches.map(match => {
              const date = new Date(match.date);
              const timeText = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
              const dateText = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
              const expected = matchExpected.get(match.id);

              return (
                <div key={match.id} className="glass overflow-hidden rounded-2xl border border-white/5 transition-all hover:border-white/10">
                  <div className="flex items-center justify-between border-b border-white/[0.04] bg-white/[0.02] px-5 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400/80">
                      <Calendar className="h-3.5 w-3.5" /> {dateText}
                      <span className="mx-1 text-white/10">•</span>
                      <Clock className="h-3.5 w-3.5" /> {timeText}
                    </span>
                    {canWrite && <DeleteButton matchId={match.id} onDeleted={sharedData.refresh} />}
                  </div>

                  <div className="grid grid-cols-12 items-center gap-3 px-5 py-4">
                    <div className="col-span-5 flex flex-col gap-1 text-right">
                      <span className="truncate text-sm font-black text-white/90 sm:text-base">{playerName(players, match.win_1)}</span>
                      {match.win_2 && <span className="truncate text-sm font-black text-white/90 sm:text-base">{playerName(players, match.win_2)}</span>}
                    </div>
                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <div className="whitespace-nowrap rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-base font-black tracking-tighter text-primary sm:text-lg">
                        {match.win_score}–{match.lose_score}
                      </div>
                      {expected && (
                        <span className="mt-1 block whitespace-nowrap text-center text-[9px] font-bold text-slate-400 sm:text-[10px]">
                          Dự đoán trước trận: {Math.round(expected.winProb * 100)}% - {Math.round(expected.loseProb * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="col-span-5 flex flex-col gap-1 text-left">
                      <span className="truncate text-sm font-black text-white/90 sm:text-base">{playerName(players, match.lose_1)}</span>
                      {match.lose_2 && <span className="truncate text-sm font-black text-white/90 sm:text-base">{playerName(players, match.lose_2)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {matches.length === 0 && sharedData.cacheLoaded && (
        <div className="glass rounded-[2.5rem] border border-white/5 p-20 text-center">
          <p className="text-sm font-black uppercase tracking-[0.4em] text-white/20">Chưa có trận đấu nào</p>
        </div>
      )}
    </div>
  );
}
