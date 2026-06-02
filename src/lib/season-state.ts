export let globalSelectedSeason: string | null | undefined = undefined;

export function setGlobalSelectedSeason(season: string | null) {
  globalSelectedSeason = season;
}

export function getGlobalSelectedSeason(defaultSeason: string): string | null {
  if (globalSelectedSeason === undefined) {
    return defaultSeason;
  }
  return globalSelectedSeason;
}

export function isGlobalSeasonSet(): boolean {
  return globalSelectedSeason !== undefined;
}

