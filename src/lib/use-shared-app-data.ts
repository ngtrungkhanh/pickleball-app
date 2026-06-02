'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppDataManifestAction, getAppDataPartsAction } from '@/app/actions';
import {
  getAppCacheSnapshot,
  hasUsableAppCache,
  replaceAppCacheParts,
  seedAppCache,
  type AppCachePart,
  type AppCacheSnapshot,
  type StoredMatch,
  type StoredPlayer,
  type StoredPlayerSeasonSetting,
  type StoredSeason,
} from '@/lib/db';

type SharedConfig = Record<string, string>;

type SharedData = {
  players: StoredPlayer[];
  matches: StoredMatch[];
  seasons: StoredSeason[];
  config: SharedConfig;
  playerSeasonSettings: StoredPlayerSeasonSetting[];
};

type SyncState = 'idle' | 'checking' | 'syncing' | 'error';

const APP_DATA_PARTS: AppCachePart[] = ['players', 'matches', 'seasons', 'config', 'playerSeasonSettings'];
const MANIFEST_CHECK_THROTTLE_MS = 60_000;

function dataVersionFromConfig(config: SharedConfig) {
  return Number(config.version_global || config.data_version || 0) || 0;
}

function snapshotToData(snapshot: AppCacheSnapshot, fallback: SharedData): SharedData {
  return {
    players: snapshot.players.length > 0 ? snapshot.players : fallback.players,
    matches: snapshot.matches.length > 0 ? snapshot.matches : fallback.matches,
    seasons: snapshot.seasons.length > 0 ? snapshot.seasons : fallback.seasons,
    config: Object.keys(snapshot.config).length > 0 ? snapshot.config : fallback.config,
    playerSeasonSettings: snapshot.playerSeasonSettings.length > 0 ? snapshot.playerSeasonSettings : fallback.playerSeasonSettings,
  };
}

function routePreloadHasData(data: SharedData) {
  return data.players.length > 0
    || data.matches.length > 0
    || data.seasons.length > 0
    || Object.keys(data.config).length > 0
    || data.playerSeasonSettings.length > 0;
}

function stalePartsFromManifest(
  snapshot: AppCacheSnapshot,
  manifest: NonNullable<Awaited<ReturnType<typeof getAppDataManifestAction>>>,
) {
  const stale = new Set<AppCachePart>();

  APP_DATA_PARTS.forEach((part) => {
    if ((manifest.parts[part] || 0) > (snapshot.partVersions[part] || 0)) {
      stale.add(part);
    }
  });

  if (manifest.counts.players > 0 && snapshot.players.length === 0) stale.add('players');
  if (manifest.counts.matches > 0 && snapshot.matches.length === 0) stale.add('matches');
  if (manifest.counts.seasons > 0 && snapshot.seasons.length === 0) stale.add('seasons');
  if (manifest.counts.playerSeasonSettings > 0 && snapshot.playerSeasonSettings.length === 0) stale.add('playerSeasonSettings');
  if (Object.keys(snapshot.config).length === 0) stale.add('config');

  return Array.from(stale);
}

export function useSharedAppData({
  initialPlayers,
  initialMatches,
  initialConfig,
  initialSeasons,
  initialPlayerSeasonSettings = [],
  routeKey,
  localOnly = false,
  fetchIfEmpty = false,
}: {
  initialPlayers: StoredPlayer[];
  initialMatches: StoredMatch[];
  initialConfig: SharedConfig;
  initialSeasons: StoredSeason[];
  initialPlayerSeasonSettings?: StoredPlayerSeasonSetting[];
  routeKey: string;
  localOnly?: boolean;
  fetchIfEmpty?: boolean;
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
  const [hasLocalCache, setHasLocalCache] = useState(routePreloadHasData(initialData));
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const runIdRef = useRef(0);
  const lastManifestCheckRef = useRef(0);

  const loadLocalSnapshot = useCallback(async () => {
    const snapshot = await getAppCacheSnapshot();
    const usable = hasUsableAppCache(snapshot);
    setHasLocalCache(usable);
    setCacheLoaded(true);
    setData(snapshotToData(snapshot, initialData));
    return snapshot;
  }, [initialData]);

  const fetchParts = useCallback(async (parts: AppCachePart[], message: string) => {
    if (parts.length === 0) return;
    setSyncState('syncing');
    setSyncMessage(message);

    const appData = await getAppDataPartsAction(parts);
    if (!appData) throw new Error('app data unavailable');

    await replaceAppCacheParts({
      players: appData.players as StoredPlayer[] | undefined,
      matches: appData.matches as StoredMatch[] | undefined,
      seasons: appData.seasons as StoredSeason[] | undefined,
      config: appData.config,
      playerSeasonSettings: appData.playerSeasonSettings as StoredPlayerSeasonSetting[] | undefined,
    }, {
      dataVersion: appData.dataVersion,
      partVersions: appData.partVersions,
      manifestCheckedAt: Date.now(),
    });
  }, []);

  const seedRoutePreloadIfPresent = useCallback(async () => {
    if (!routePreloadHasData(initialData)) return;
    const version = dataVersionFromConfig(initialConfig);
    await seedAppCache({
      players: initialPlayers,
      matches: initialMatches,
      seasons: initialSeasons,
      config: initialConfig,
      playerSeasonSettings: initialPlayerSeasonSettings,
      dataVersion: version,
      partVersions: {
        players: version,
        matches: version,
        seasons: version,
        config: version,
        playerSeasonSettings: version,
      },
      manifestCheckedAt: Date.now(),
    });
  }, [initialConfig, initialData, initialMatches, initialPlayers, initialSeasons, initialPlayerSeasonSettings]);

  const checkManifestAndRefresh = useCallback(async (options?: { force?: boolean; allowWhenLocalOnly?: boolean }) => {
    if (localOnly && !options?.allowWhenLocalOnly) return;
    const now = Date.now();
    if (!options?.force && now - lastManifestCheckRef.current < MANIFEST_CHECK_THROTTLE_MS) return;
    lastManifestCheckRef.current = now;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () => runIdRef.current === runId;

    try {
      setSyncState('checking');
      setSyncMessage('Đang kiểm tra dữ liệu...');

      let snapshot = await getAppCacheSnapshot();
      if (!isCurrentRun()) return;

      if (!localOnly) {
        await seedRoutePreloadIfPresent();
        snapshot = await getAppCacheSnapshot();
        if (!isCurrentRun()) return;
        setData(snapshotToData(snapshot, initialData));
        setHasLocalCache(hasUsableAppCache(snapshot));
        setCacheLoaded(true);
      }

      const manifest = await getAppDataManifestAction();
      if (!isCurrentRun()) return;
      if (!manifest) throw new Error('manifest unavailable');

      const staleParts = stalePartsFromManifest(snapshot, manifest);
      if (staleParts.length > 0) {
        await fetchParts(staleParts, 'Đang tải phần dữ liệu mới...');
        if (!isCurrentRun()) return;
        snapshot = await getAppCacheSnapshot();
      } else {
        await seedAppCache({
          dataVersion: manifest.globalVersion,
          partVersions: manifest.parts,
          manifestCheckedAt: manifest.checkedAt,
        });
      }

      if (!isCurrentRun()) return;
      setData(snapshotToData(snapshot, initialData));
      setHasLocalCache(hasUsableAppCache(snapshot));
      setCacheLoaded(true);
      setSyncState('idle');
      setSyncMessage('');
    } catch (error) {
      console.error('Shared app data refresh failed:', error);
      if (!isCurrentRun()) return;
      setSyncState('error');
      setSyncMessage('Không đồng bộ được dữ liệu mới');
      setCacheLoaded(true);
    }
  }, [fetchParts, initialData, localOnly, seedRoutePreloadIfPresent]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        const snapshot = await loadLocalSnapshot();
        if (localOnly) {
          if (fetchIfEmpty && !hasUsableAppCache(snapshot)) {
            await checkManifestAndRefresh({ force: true, allowWhenLocalOnly: true });
          }
          return;
        }
        await checkManifestAndRefresh({ force: true });
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [checkManifestAndRefresh, fetchIfEmpty, loadLocalSnapshot, localOnly, routeKey]);

  useEffect(() => {
    if (localOnly) return;
    const onFocus = () => {
      void checkManifestAndRefresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkManifestAndRefresh, localOnly]);

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
    hasLocalCache,
    cacheLoaded,
    isCheckingManifest: syncState === 'checking',
    isSyncingData: syncState === 'syncing',
    refresh: () => {
      void checkManifestAndRefresh({ force: true, allowWhenLocalOnly: fetchIfEmpty });
    },
  };
}
