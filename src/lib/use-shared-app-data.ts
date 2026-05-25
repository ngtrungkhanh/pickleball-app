'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppDataAction } from '@/app/actions';
import {
  getAppCacheSnapshot,
  seedAppCache,
  type StoredMatch,
  type StoredPlayer,
  type StoredSeason,
  type StoredPlayerSeasonSetting,
} from '@/lib/db';

type SharedConfig = Record<string, string>;

type SharedData = {
  players: StoredPlayer[];
  matches: StoredMatch[];
  seasons: StoredSeason[];
  config: SharedConfig;
  playerSeasonSettings: StoredPlayerSeasonSetting[];
};

type SyncState = 'idle' | 'syncing' | 'error';

function dataVersionFromConfig(config: SharedConfig) {
  return Number(config.data_version || 0) || 0;
}

function snapshotWins(
  snapshot: Awaited<ReturnType<typeof getAppCacheSnapshot>>,
  initialMatches: StoredMatch[],
  initialVersion: number,
) {
  if (snapshot.matches.length === 0) return false;
  if (snapshot.dataVersion > initialVersion) return true;
  if (snapshot.dataVersion < initialVersion) return false;
  return snapshot.matches.length > initialMatches.length;
}

function snapshotToData(
  snapshot: Awaited<ReturnType<typeof getAppCacheSnapshot>>,
  fallback: SharedData,
): SharedData {
  return {
    players: snapshot.players.length > 0 ? snapshot.players : fallback.players,
    matches: snapshot.matches.length > 0 ? snapshot.matches : fallback.matches,
    seasons: snapshot.seasons.length > 0 ? snapshot.seasons : fallback.seasons,
    config: Object.keys(snapshot.config).length > 0 ? snapshot.config : fallback.config,
    playerSeasonSettings: snapshot.playerSeasonSettings.length > 0 ? snapshot.playerSeasonSettings : fallback.playerSeasonSettings,
  };
}

export function useSharedAppData({
  initialPlayers,
  initialMatches,
  initialConfig,
  initialSeasons,
  initialPlayerSeasonSettings = [],
  routeKey,
}: {
  initialPlayers: StoredPlayer[];
  initialMatches: StoredMatch[];
  initialConfig: SharedConfig;
  initialSeasons: StoredSeason[];
  initialPlayerSeasonSettings?: StoredPlayerSeasonSetting[];
  routeKey: string;
}) {
  const initialData = useMemo<SharedData>(() => ({
    players: initialPlayers,
    matches: initialMatches,
    seasons: initialSeasons,
    config: initialConfig,
    playerSeasonSettings: initialPlayerSeasonSettings,
  }), [initialConfig, initialMatches, initialPlayers, initialSeasons, initialPlayerSeasonSettings]);

  const [data, setData] = useState<SharedData>(initialData);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const preloadRunIdRef = useRef(0);
  const refreshRunIdRef = useRef(0);

  const loadLocalSnapshot = useCallback(async () => {
    const snapshot = await getAppCacheSnapshot();
    setData(snapshotToData(snapshot, initialData));
  }, [initialData]);

  const seedFromRoutePreload = useCallback(async () => {
    const runId = preloadRunIdRef.current + 1;
    preloadRunIdRef.current = runId;
    const isCurrentRun = () => preloadRunIdRef.current === runId;
    const initialVersion = dataVersionFromConfig(initialConfig);

    const snapshot = await getAppCacheSnapshot();
    if (!isCurrentRun()) return;

    if (snapshotWins(snapshot, initialMatches, initialVersion)) {
      setData(snapshotToData(snapshot, initialData));
      return;
    }

    await seedAppCache({
      players: initialPlayers,
      matches: initialMatches,
      seasons: initialSeasons,
      config: initialConfig,
      playerSeasonSettings: initialPlayerSeasonSettings,
      dataVersion: initialVersion,
      manifestCheckedAt: Date.now(),
    });
    if (!isCurrentRun()) return;
    setData(initialData);
  }, [initialConfig, initialData, initialMatches, initialPlayers, initialSeasons, initialPlayerSeasonSettings]);

  const refresh = useCallback(async () => {
    const runId = refreshRunIdRef.current + 1;
    refreshRunIdRef.current = runId;
    const isCurrentRun = () => refreshRunIdRef.current === runId;

    try {
      setSyncState('syncing');
      setSyncMessage('Đang tải dữ liệu mới nhất...');
      const appData = await getAppDataAction();
      if (!isCurrentRun()) return;
      if (!appData) throw new Error('app data unavailable');

      const nextData = {
        players: appData.players as StoredPlayer[],
        matches: appData.matches as StoredMatch[],
        seasons: appData.seasons,
        config: appData.config,
        playerSeasonSettings: appData.playerSeasonSettings || [],
      };

      await seedAppCache({
        ...nextData,
        dataVersion: appData.dataVersion,
        manifestCheckedAt: Date.now(),
      });
      if (!isCurrentRun()) return;

      setData(nextData);
      setSyncState('idle');
      setSyncMessage('');
    } catch (error) {
      console.error('Shared app data refresh failed:', error);
      if (!isCurrentRun()) return;
      setSyncState('error');
      setSyncMessage('Không đồng bộ được dữ liệu mới');
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void seedFromRoutePreload();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [routeKey, seedFromRoutePreload]);

  useEffect(() => {
    const onCacheChange = () => {
      void loadLocalSnapshot();
    };
    window.addEventListener('pickleball-cache-change', onCacheChange);
    return () => window.removeEventListener('pickleball-cache-change', onCacheChange);
  }, [loadLocalSnapshot]);

  return {
    ...data,
    syncState,
    syncMessage,
    isCheckingManifest: false,
    isSyncingData: syncState === 'syncing',
    refresh: () => {
      void refresh();
    },
  };
}
