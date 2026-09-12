type ParticipationRow = {
  total: number;
};

// Input is the full visible leaderboard, already sorted by its usual tie-breakers.
export function applyLeaderboardEligibility<T extends ParticipationRow>(rows: readonly T[]) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return rows.map(row => {
    const otherAverage = rows.length > 1 ? (total - row.total) / (rows.length - 1) : 0;
    const requiredMatches = Math.max(1, Math.min(15, Math.ceil(otherAverage * 0.25)));
    return { ...row, requiredMatches, isEligible: row.total >= requiredMatches };
  }).sort((a, b) => Number(b.isEligible) - Number(a.isEligible));
}
