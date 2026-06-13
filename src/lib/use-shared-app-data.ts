'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppDataDeltaAction, getAppDataManifestAction, getAppDataPartsAction } from '@/app/actions';
import {
  applyMatchChangesLocal,
  getAppCacheSnapshot,
  hasUsableAppCache,
  replaceAppCacheParts,
  seedAppCache,
  type AppCachePart,
  type AppCacheSnapshot,
  type StoredMatch,
  type StoredMatchChange,
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

function stalePartsFromManifest(
  snapshot: AppCacheSnapshot,
  manifest: NonNullable<Awaited<ReturnType<typeof getAppDataManifestAction>>>,
  forceParts?: AppCachePart[],
) {
  const stale = new Set<AppCachePart>();
  const forced = forceParts && forceParts.length > 0;

  (forced ? forceParts : APP_DATA_PARTS).forEach((part) => {
    if ((manifest.parts[part] || 0) > (snapshot.partVersions[part] || 0)) {
      stale.add(part);
    }
  });

  if (!forced && !hasUsableAppCache(snapshot)) {
    APP_DATA_PARTS.forEach((part) => stale.add(part));
  }

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
  syncParts?: AppCachePart[];
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
      partVersions: parts.length === APP_DATA_PARTS.length ? appData.partVersions : pickPartVersions(appData.partVersions, parts),
      manifestCheckedAt: Date.now(),
    });
  }, []);

  const applyMatchDelta = useCallback(async (
    snapshot: AppCacheSnapshot,
    manifest: NonNullable<Awaited<ReturnType<typeof getAppDataManifestAction>>>,
  ) => {
    const fromVersion = snapshot.partVersions.matches || 0;
    if (fromVersion <= 0) return false;

    const delta = await getAppDataDeltaAction('matches', fromVersion);
    if (
      !delta
      || delta.resetRequired
      || delta.toVersion !== manifest.parts.matches
      || !Array.isArray(delta.changes)
    ) {
      return false;
    }

    const changes = delta.changes.map((change): StoredMatchChange => ({
      operation: change.operation as StoredMatchChange['operation'],
      entityId: String(change.entityId || ''),
      payload: change.payload as StoredMatch | null,
    }));
    if (changes.some((change) => (
      !change.entityId
      || (change.operation === 'upsert' && !change.payload?.id)
    ))) {
      return false;
    }

    await applyMatchChangesLocal(
      changes,
      manifest.globalVersion,
      { matches: manifest.parts.matches },
      manifest.checkedAt,
    );
    return true;
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
      setSyncMessage('');

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

      let staleParts = stalePartsFromManifest(snapshot, manifest, options?.parts);
      const hadStaleParts = staleParts.length > 0;
      if (staleParts.includes('matches')) {
        const deltaApplied = await applyMatchDelta(snapshot, manifest);
        if (!isCurrentRun()) return;
        if (deltaApplied) {
          staleParts = staleParts.filter((part) => part !== 'matches');
          snapshot = await getAppCacheSnapshot();
        }
      }
      if (staleParts.length > 0) {
        await fetchParts(staleParts, 'Đang tải phần dữ liệu mới...');
        if (!isCurrentRun()) return;
        snapshot = await getAppCacheSnapshot();
      } else if (!hadStaleParts) {
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
  }, [applyMatchDelta, fetchParts, initialData, localOnly, seedRoutePreloadIfPresent]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        const snapshot = await loadLocalSnapshot();
        if (localOnly) {
          return;
        }
        if (syncOnMount === 'empty-only' && hasUsableAppCache(snapshot)) return;
        if (syncOnMount === 'always') {
          await checkManifestAndRefresh({ force: true, parts: syncParts });
          return;
        }
        if (hasUsableAppCache(snapshot) && recentlyChecked(snapshot)) return;
        await checkManifestAndRefresh({ force: true, parts: syncParts });
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [checkManifestAndRefresh, fetchIfEmpty, loadLocalSnapshot, localOnly, routeKey, syncOnMount, syncParts]);

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
