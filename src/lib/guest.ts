export const GUEST_ID = '__GUEST__';
export const GUEST_NAME = 'Khách';

type MatchLike = {
  win_1?: unknown;
  win_2?: unknown;
  lose_1?: unknown;
  lose_2?: unknown;
  deleted_at?: unknown;
};

export function isGuestId(id: unknown) {
  return id === GUEST_ID;
}

export function isDeletedRecord(record: { deleted_at?: unknown }) {
  return Boolean(record.deleted_at);
}

export function matchPlayerIds(match: MatchLike) {
  return [match.win_1, match.win_2, match.lose_1, match.lose_2].filter(Boolean).map(String);
}

export function matchHasGuest(match: MatchLike) {
  return matchPlayerIds(match).some(isGuestId);
}

export function isRankingMatch(match: MatchLike) {
  return !isDeletedRecord(match) && !matchHasGuest(match);
}

export function isVisibleMatch(match: MatchLike) {
  return !isDeletedRecord(match);
}

export function loserFineCount(match: MatchLike) {
  return [match.lose_1, match.lose_2].filter(id => id && !isGuestId(id)).length;
}
