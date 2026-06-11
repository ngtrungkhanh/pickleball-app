'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppDataPartsAction, getMatchesDeltaAction, getSyncManifestAction } from '@/app/actions';
import {
  applyMatchesDeltaLocal,
  clearAppCacheLocal,
  getAppCacheSnapshot,
  hasUsableAppCache,
  replaceAppCacheParts,
  seedAppCache,
  type AppCachePart,
  type AppCacheSnapshot,
  type MatchesCursor,
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
type SyncOnMountPolicy = 'always' | 'throttled' | 'empty-only';

const APP_DATA_PARTS: AppCachePart[] = ['players', 'matches', 'seasons', 'config', 'playerSeasonSettings'];
const SMALL_DATA_PARTS: AppCachePart[] = ['players', 'seasons', 'config', 'playerSeasonSettings'];
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

function recentlyChecked(snapshot: AppCacheSnapshot) {
  return snapshot.lastManifestCheck > 0
    && Date.now() - snapshot.lastManifestCheck < MANIFEST_CHECK_THROTTLE_MS;
}

function staleSmallParts(snapshot: AppCacheSnapshot, changedParts: string[]) {
  const stale = new Set<AppCachePart>();
  changedParts.forEach((part) => {
    if (SMALL_DATA_PARTS.includes(part as AppCachePart)) stale.add(part as AppCachePart);
  });
  if (snapshot.players.length === 0) stale.add('players');
  if (snapshot.seasons.length === 0) stale.add('seasons');
  if (Object.keys(snapshot.config).length === 0) stale.add('config');
  return Array.from(stale);
}

function pickPartVersions(
  partVersions: Partial<Record<AppCachePart, number>> | undefined,
  parts: AppCachePart[],
) {
  if (!partVersions) return undefined;
  return parts.reduce<Partial<Record<AppCachePart, number>>>((acc, part) => {
    if (typeof partVersions[part] === 'number') acc[part] = partVersions[part];
    return acc;
  }, {});
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
  syncOnMount = 'throttled',
}: {
  initialPlayers: StoredPlayer[];
  initialMatches: StoredMatch[];
  initialConfig: SharedConfig;
  initialSeasons: StoredSeason[];
  initialPlayerSeasonSettings?: StoredPlayerSeasonSetting[];
  routeKey: string;
  localOnly?: boolean;
  fetchIfEmpty?: boolean;
  syncOnMount?: SyncOnMountPolicy;
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

  const fetchParts = useCallback(async (
    parts: AppCachePart[],
    message: string,
    options?: { fullBootstrap?: boolean; cacheEpoch?: string },
  ) => {
    if (parts.length === 0) return;
    setSyncState('syncing');
    setSyncMessage(message);

    const appData = await getAppDataPartsAction(parts);
    if (!appData) throw new Error('app data unavailable');
    const serverCursor = appData.serverTime ? { updatedAt: appData.serverTime, id: '' } : undefined;

    await replaceAppCacheParts({
      players: appData.players as StoredPlayer[] | undefined,
      matches: appData.matches as StoredMatch[] | undefined,
      seasons: appData.seasons as StoredSeason[] | undefined,
      config: appData.config,
      playerSeasonSettings: appData.playerSeasonSettings as StoredPlayerSeasonSetting[] | undefined,
    }, {
      dataVersion: appData.dataVersion,
      partVersions: options?.fullBootstrap ? appData.partVersions : pickPartVersions(appData.partVersions, parts),
      cacheEpoch: appData.cacheEpoch || options?.cacheEpoch,
      matchesCursor: options?.fullBootstrap ? serverCursor : undefined,
      manifestCheckedAt: Date.now(),
    });
  }, []);

  const fetchMatchesDelta = useCallback(async (
    startCursor: MatchesCursor | null,
    manifest: Awaited<ReturnType<typeof getSyncManifestAction>>,
  ) => {
    let cursor: MatchesCursor | null = startCursor;
    for (let page = 0; page < 20; page += 1) {
      const delta = await getMatchesDeltaAction(cursor);
      await applyMatchesDeltaLocal(delta.matches as StoredMatch[], {
        partVersions: delta.hasMore ? undefined : {
          matches: manifest.partVersions.matches,
          admin: manifest.partVersions.admin,
        },
        cacheEpoch: manifest.cacheEpoch,
        matchesCursor: delta.hasMore ? delta.nextCursor : delta.finalCursor,
        manifestCheckedAt: Date.now(),
      });
      cursor = delta.nextCursor;
      if (!delta.hasMore) return;
    }
    throw new Error('matches delta pagination exceeded safety limit');
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

  const checkManifestAndRefresh = useCallback(async (options?: { force?: boolean; allowWhenLocalOnly?: boolean; parts?: AppCachePart[] }) => {
    if (localOnly && !options?.allowWhenLocalOnly) return;
    const now = Date.now();
    if (!options?.force && now - lastManifestCheckRef.current < MANIFEST_CHECK_THROTTLE_MS) return;
    lastManifestCheckRef.current = now;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () => runIdRef.current === runId;

    try {
      setSyncState('checking');
      setSyncMessage('Dang kiem tra du lieu...');

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

      const manifest = await getSyncManifestAction(snapshot.partVersions);
      if (!isCurrentRun()) return;

      if (manifest.cacheEpoch !== snapshot.cacheEpoch) {
        await clearAppCacheLocal({ includeHallImages: true });
        await fetchParts(APP_DATA_PARTS, 'Dang tai lai du lieu...', { fullBootstrap: true, cacheEpoch: manifest.cacheEpoch });
        snapshot = await getAppCacheSnapshot();
      } else {
        const requestedParts = Array.from(new Set([
          ...(manifest.changedParts as AppCachePart[]),
          ...(options?.parts || []),
        ]));
        const smallParts = staleSmallParts(snapshot, requestedParts);
        if (smallParts.length > 0) {
          await fetchParts(smallParts, 'Dang tai phan du lieu moi...', { cacheEpoch: manifest.cacheEpoch });
          if (!isCurrentRun()) return;
          snapshot = await getAppCacheSnapshot();
        }

        const shouldSyncMatches = requestedParts.includes('matches') || manifest.matchesChanged || snapshot.matches.length === 0;
        if (shouldSyncMatches) {
          if (snapshot.matches.length === 0) {
            await fetchParts(APP_DATA_PARTS, 'Dang tai du lieu ban dau...', { fullBootstrap: true, cacheEpoch: manifest.cacheEpoch });
          } else {
            await fetchMatchesDelta(snapshot.matchesCursor, manifest);
          }
          if (!isCurrentRun()) return;
          snapshot = await getAppCacheSnapshot();
        } else {
          await seedAppCache({
            partVersions: manifest.partVersions,
            cacheEpoch: manifest.cacheEpoch,
            manifestCheckedAt: Date.now(),
          });
          snapshot = await getAppCacheSnapshot();
        }
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
      setSyncMessage('Khong dong bo duoc du lieu moi');
      setCacheLoaded(true);
    }
  }, [fetchMatchesDelta, fetchParts, initialData, localOnly, seedRoutePreloadIfPresent]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        const snapshot = await loadLocalSnapshot();
        if (localOnly) {
          if (!hasUsableAppCache(snapshot)) {
            if (fetchIfEmpty) {
              await checkManifestAndRefresh({ force: true, allowWhenLocalOnly: true });
            }
            return;
          }
          if (syncOnMount === 'always') {
            await checkManifestAndRefresh({ force: true, allowWhenLocalOnly: true });
          } else if (syncOnMount === 'throttled' && !recentlyChecked(snapshot)) {
            await checkManifestAndRefresh({ allowWhenLocalOnly: true });
          }
          return;
        }
        if (syncOnMount === 'empty-only' && hasUsableAppCache(snapshot)) return;
        if (syncOnMount === 'always') {
          await checkManifestAndRefresh({ force: true });
          return;
        }
        if (hasUsableAppCache(snapshot) && recentlyChecked(snapshot)) return;
        await checkManifestAndRefresh({ force: true });
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [checkManifestAndRefresh, fetchIfEmpty, loadLocalSnapshot, localOnly, routeKey, syncOnMount]);

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
    refresh: (parts?: AppCachePart[]) => {
      void checkManifestAndRefresh({ force: true, allowWhenLocalOnly: fetchIfEmpty, parts });
    },
  };
}
