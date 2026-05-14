'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppDataAction, getAppDataManifestAction } from '@/app/actions';
import {
  getAppCacheSnapshot,
  seedAppCache,
  type StoredMatch,
  type StoredPlayer,
  type StoredSeason,
} from '@/lib/db';

const MANIFEST_THROTTLE_MS = 60_000;

type SharedConfig = Record<string, string>;

type SharedData = {
  players: StoredPlayer[];
  matches: StoredMatch[];
  seasons: StoredSeason[];
  config: SharedConfig;
};

type SyncState = 'idle' | 'checking' | 'syncing' | 'error';

function dataVersionFromConfig(config: SharedConfig) {
  return Number(config.data_version || 0) || 0;
}

function snapshotIsBetterThanInitial(
  snapshot: Awaited<ReturnType<typeof getAppCacheSnapshot>>,
  initialMatches: StoredMatch[],
  initialVersion: number,
) {
  if (snapshot.matches.length === 0) return false;
  if (snapshot.dataVersion > initialVersion) return true;
  return snapshot.dataVersion === initialVersion && snapshot.matches.length >= initialMatches.length;
}

export function useSharedAppData({
  initialPlayers,
  initialMatches,
  initialConfig,
  initialSeasons,
  routeKey,
}: {
  initialPlayers: StoredPlayer[];
  initialMatches: StoredMatch[];
  initialConfig: SharedConfig;
  initialSeasons: StoredSeason[];
  routeKey: string;
}) {
  const initialData = useMemo<SharedData>(() => ({
    players: initialPlayers,
    matches: initialMatches,
    seasons: initialSeasons,
    config: initialConfig,
  }), [initialConfig, initialMatches, initialPlayers, initialSeasons]);

  const [data, setData] = useState<SharedData>(initialData);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const runIdRef = useRef(0);

  const sync = useCallback(async (force = false) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () => runIdRef.current === runId;
    const initialVersion = dataVersionFromConfig(initialConfig);

    try {
      const snapshot = await getAppCacheSnapshot();
      if (!isCurrentRun()) return;

      if (snapshotIsBetterThanInitial(snapshot, initialMatches, initialVersion)) {
        setData({
          players: snapshot.players.length > 0 ? snapshot.players : initialPlayers,
          matches: snapshot.matches,
          seasons: snapshot.seasons.length > 0 ? snapshot.seasons : initialSeasons,
          config: Object.keys(snapshot.config).length > 0 ? snapshot.config : initialConfig,
        });
      }

      const shouldSeedInitial = snapshot.matches.length === 0 || initialVersion >= snapshot.dataVersion;
      if (shouldSeedInitial) {
        await seedAppCache({
          players: initialPlayers,
          matches: initialMatches,
          seasons: initialSeasons,
          config: initialConfig,
          dataVersion: initialVersion,
        });
      }

      const seededSnapshot = await getAppCacheSnapshot();
      if (!isCurrentRun()) return;
      const recentlyChecked = Date.now() - seededSnapshot.lastManifestCheck < MANIFEST_THROTTLE_MS;
      if (!force && recentlyChecked) {
        setSyncState('idle');
        setSyncMessage('');
        return;
      }

      setSyncState('checking');
      setSyncMessage('Đang kiểm tra dữ liệu mới...');
      const manifest = await getAppDataManifestAction();
      if (!isCurrentRun()) return;
      if (!manifest) throw new Error('manifest unavailable');

      const currentSnapshot = await getAppCacheSnapshot();
      if (!isCurrentRun()) return;
      const localCount = currentSnapshot.matches.length;
      const serverCount = manifest.matchSummary.count;
      const stale = currentSnapshot.dataVersion !== manifest.dataVersion || localCount !== serverCount;

      if (!stale) {
        await seedAppCache({
          config: manifest.config,
          seasons: manifest.seasons,
          dataVersion: manifest.dataVersion,
          manifestCheckedAt: Date.now(),
        });
        if (!isCurrentRun()) return;
        setData((prev) => ({
          ...prev,
          config: manifest.config,
          seasons: manifest.seasons.length > 0 ? manifest.seasons : prev.seasons,
        }));
        setSyncState('idle');
        setSyncMessage('');
        return;
      }

      setSyncState('syncing');
      setSyncMessage('Đang tải dữ liệu mới nhất...');
      const appData = await getAppDataAction();
      if (!isCurrentRun()) return;
      if (!appData) throw new Error('app data unavailable');

      await seedAppCache({
        players: appData.players as StoredPlayer[],
        matches: appData.matches as StoredMatch[],
        seasons: appData.seasons,
        config: appData.config,
        dataVersion: appData.dataVersion,
        manifestCheckedAt: Date.now(),
      });
      if (!isCurrentRun()) return;

      setData({
        players: appData.players as StoredPlayer[],
        matches: appData.matches as StoredMatch[],
        seasons: appData.seasons,
        config: appData.config,
      });
      setSyncState('idle');
      setSyncMessage('');
    } catch (error) {
      console.error('Shared app data sync failed:', error);
      if (!isCurrentRun()) return;
      setSyncState('error');
      setSyncMessage('Không đồng bộ được dữ liệu mới');
    }
  }, [initialConfig, initialMatches, initialPlayers, initialSeasons]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setData(initialData);
      void sync(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [initialData, routeKey, sync]);

  const refresh = useCallback(() => {
    void sync(true);
  }, [sync]);

  return {
    ...data,
    syncState,
    syncMessage,
    isCheckingManifest: syncState === 'checking',
    isSyncingData: syncState === 'syncing',
    refresh,
  };
}
