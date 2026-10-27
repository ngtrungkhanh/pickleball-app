export interface LocPlayer {
  id: string;
  name: string;
}

export interface LocDebtItem {
  loserId: string;
  cards: number;
  autoTag?: string;
  note?: string;
}

export interface LocRound {
  id: string;
  sessionId: string;
  roundNumber: number;
  winnerId: string;
  debts: LocDebtItem[];
  createdAt: string;
}

export interface LocSession {
  id: string;
  title: string;
  players: LocPlayer[];
  version: number;
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface PairwiseDebt {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  cards: number;
}

export interface SettlementTransaction {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  cards: number;
}

export interface PlayerSessionStats {
  id: string;
  name: string;
  totalRounds: number;
  wins: number;
  losses: number;
  winRate: number;
  netCards: number;
  owes: { toId: string; toName: string; cards: number }[];
  owedBy: { fromId: string; fromName: string; cards: number }[];
  tagsCount: Record<string, number>;
}

/**
 * Trích xuất tên gọi ngắn gọn cho người chơi:
 * - Mặc định chỉ lấy tên chính (từ cuối cùng, ví dụ "Khánh", "Tuấn")
 * - Nếu trong bàn có từ 2 người trở lên trùng tên chính:
 *   thêm chữ cái đầu của tên đệm hoặc họ phía trước (ví dụ: T.Khánh)
 */
export function getShortNameMap(players: LocPlayer[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!players || players.length === 0) return map;

  const parsed = players.map(p => {
    const trimmed = (p.name || '').trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const givenName = parts[parts.length - 1] || trimmed || 'P';
    return {
      id: p.id,
      fullName: trimmed,
      parts,
      givenName,
    };
  });

  const counts = new Map<string, number>();
  parsed.forEach(p => {
    const key = p.givenName.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  parsed.forEach(p => {
    const key = p.givenName.toLowerCase();
    const isDuplicate = (counts.get(key) || 0) > 1;

    if (!isDuplicate) {
      map.set(p.id, p.givenName);
    } else {
      // Có người trùng tên:
      // Ưu tiên lấy từ liền trước tên (tên đệm) nếu có >= 3 từ (VD: "Trung Khánh" -> "T.Khánh")
      // Nếu chỉ có 2 từ (VD: "Lê Khánh") -> lấy họ ("L.Khánh")
      if (p.parts.length >= 2) {
        const disambiguator = p.parts.length >= 3 ? p.parts[p.parts.length - 2] : p.parts[0];
        const initial = disambiguator.charAt(0).toUpperCase();
        map.set(p.id, `${initial}.${p.givenName}`);
      } else {
        map.set(p.id, p.givenName);
      }
    }
  });

  // Kiểm tra lần 2: nếu vẫn còn trùng lặp (ví dụ 2 người cùng ra "T.Khánh")
  const disambiguatedCounts = new Map<string, number>();
  parsed.forEach(p => {
    const short = map.get(p.id) || p.givenName;
    disambiguatedCounts.set(short.toLowerCase(), (disambiguatedCounts.get(short.toLowerCase()) || 0) + 1);
  });

  parsed.forEach(p => {
    const currentShort = map.get(p.id) || p.givenName;
    if ((disambiguatedCounts.get(currentShort.toLowerCase()) || 0) > 1) {
      // Nếu trùng, thêm cả họ và đệm: N.T.Khánh
      if (p.parts.length >= 3) {
        const hInitial = p.parts[0].charAt(0).toUpperCase();
        const dInitial = p.parts[p.parts.length - 2].charAt(0).toUpperCase();
        map.set(p.id, `${hInitial}.${dInitial}.${p.givenName}`);
      }
    }
  });

  return map;
}

/**
 * Tự động phát hiện trường hợp đặc biệt dựa trên số lá:
 * - 14 lá: Úng / Cóng
 * - Tất cả người thua = 20: Báo Sâm (Ăn Sâm)
 * - 1 người thua duy nhất >= 20*(N-1) lá (các người khác 0): Đền Sâm (Bị chặn sâm)
 * - 1 người thua duy nhất (các người khác 0 lá): Chặt Heo / Tứ Quý bù
 * - Thua > 10 lá (khác 14, 20): Thối Heo
 */
export function detectRoundTags(
  winnerId: string,
  debts: { loserId: string; cards: number }[],
  totalPlayers: number
): Record<string, string> {
  const tags: Record<string, string> = {};
  const activeDebts = debts.filter(d => d.cards > 0);
  const zeroDebts = debts.filter(d => d.cards === 0);

  // Đền sâm (bị chặn sâm): Chỉ 1 người thua số lá lớn (>= 20*(N-1) hoặc >= 40), các người khác = 0
  const samDenThreshold = Math.max(30, 20 * (totalPlayers - 1));
  if (activeDebts.length === 1 && zeroDebts.length > 0) {
    const single = activeDebts[0];
    if (single.cards >= samDenThreshold) {
      tags[single.loserId] = 'đền sâm';
      return tags;
    }
  }

  // Ăn sâm: Tất cả người thua đều mất 20 lá
  if (debts.length > 1 && debts.every(d => d.cards === 20)) {
    debts.forEach(d => {
      tags[d.loserId] = 'ăn sâm';
    });
    return tags;
  }

  // Chặt heo bù: Chỉ 1 người thua, các người khác = 0
  if (activeDebts.length === 1 && zeroDebts.length > 0) {
    const single = activeDebts[0];
    tags[single.loserId] = 'chặt heo';
    return tags;
  }

  // Ván thông thường
  debts.forEach(d => {
    if (d.cards === 14) {
      tags[d.loserId] = 'cóng';
    } else if (d.cards > 10 && d.cards !== 14 && d.cards !== 20) {
      tags[d.loserId] = 'thối heo';
    }
  });

  return tags;
}

/**
 * Tính sổ nợ đối kháng trực tiếp giữa từng cặp người (Pairwise Debt Matrix):
 * - rawDebt[A][B]: Tổng số lá A thua trực tiếp cho B qua các ván
 * - netDebt[A][B] = max(0, rawDebt[A][B] - rawDebt[B][A])
 */
export function calculatePairwiseDebts(
  players: LocPlayer[],
  rounds: LocRound[]
): {
  matrix: Record<string, Record<string, number>>;
  directList: PairwiseDebt[];
} {
  const nameMap = getShortNameMap(players);
  const raw: Record<string, Record<string, number>> = {};

  // Khởi tạo bảng raw
  players.forEach(p1 => {
    raw[p1.id] = {};
    players.forEach(p2 => {
      raw[p1.id][p2.id] = 0;
    });
  });

  // Cộng dồn từng ván
  rounds.forEach(r => {
    const winnerId = r.winnerId;
    if (!raw[winnerId]) raw[winnerId] = {};

    r.debts.forEach(d => {
      if (!raw[d.loserId]) raw[d.loserId] = {};
      raw[d.loserId][winnerId] = (raw[d.loserId][winnerId] || 0) + (d.cards || 0);
    });
  });

  // Bù trừ 1-1 giữa từng cặp (Net Pairwise)
  const matrix: Record<string, Record<string, number>> = {};
  const directList: PairwiseDebt[] = [];

  players.forEach(p1 => {
    matrix[p1.id] = {};
    players.forEach(p2 => {
      matrix[p1.id][p2.id] = 0;
    });
  });

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i];
      const p2 = players[j];

      const p1OwesP2 = raw[p1.id]?.[p2.id] || 0;
      const p2OwesP1 = raw[p2.id]?.[p1.id] || 0;
      const diff = p1OwesP2 - p2OwesP1;

      if (diff > 0) {
        matrix[p1.id][p2.id] = diff;
        directList.push({
          fromId: p1.id,
          fromName: nameMap.get(p1.id) || p1.name,
          toId: p2.id,
          toName: nameMap.get(p2.id) || p2.name,
          cards: diff,
        });
      } else if (diff < 0) {
        matrix[p2.id][p1.id] = -diff;
        directList.push({
          fromId: p2.id,
          fromName: nameMap.get(p2.id) || p2.name,
          toId: p1.id,
          toName: nameMap.get(p1.id) || p1.name,
          cards: -diff,
        });
      }
    }
  }

  // Sắp xếp danh sách nợ trực tiếp giảm dần
  directList.sort((a, b) => b.cards - a.cards);

  return { matrix, directList };
}

/**
 * Thuật toán tối ưu hóa công nợ (Greedy Debt Settlement):
 * Giảm tối đa số lượt chuyển giao giữa các thành viên
 */
export function calculateOptimizedSettlement(
  players: LocPlayer[],
  rounds: LocRound[]
): SettlementTransaction[] {
  const nameMap = getShortNameMap(players);
  const net: Record<string, number> = {};
  players.forEach(p => {
    net[p.id] = 0;
  });

  rounds.forEach(r => {
    r.debts.forEach(d => {
      const cards = d.cards || 0;
      net[r.winnerId] = (net[r.winnerId] || 0) + cards;
      net[d.loserId] = (net[d.loserId] || 0) - cards;
    });
  });

  const debtors: { id: string; name: string; amount: number }[] = [];
  const creditors: { id: string; name: string; amount: number }[] = [];

  players.forEach(p => {
    const val = net[p.id] || 0;
    if (val < 0) {
      debtors.push({ id: p.id, name: nameMap.get(p.id) || p.name, amount: -val });
    } else if (val > 0) {
      creditors.push({ id: p.id, name: nameMap.get(p.id) || p.name, amount: val });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  let dIdx = 0;
  let cIdx = 0;
  const settlements: SettlementTransaction[] = [];

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const transfer = Math.min(debtor.amount, creditor.amount);

    if (transfer > 0) {
      settlements.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        cards: transfer,
      });
      debtor.amount -= transfer;
      creditor.amount -= transfer;
    }

    if (debtor.amount === 0) dIdx++;
    if (creditor.amount === 0) cIdx++;
  }

  return settlements;
}

/**
 * Thống kê chi tiết cho từng người chơi
 */
export function calculatePlayerStats(
  players: LocPlayer[],
  rounds: LocRound[]
): PlayerSessionStats[] {
  const nameMap = getShortNameMap(players);
  const { matrix } = calculatePairwiseDebts(players, rounds);

  const statsMap = new Map<string, PlayerSessionStats>();
  players.forEach(p => {
    statsMap.set(p.id, {
      id: p.id,
      name: nameMap.get(p.id) || p.name,
      totalRounds: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netCards: 0,
      owes: [],
      owedBy: [],
      tagsCount: {},
    });
  });

  rounds.forEach(r => {
    const winnerStats = statsMap.get(r.winnerId);
    if (winnerStats) {
      winnerStats.totalRounds++;
      winnerStats.wins++;
    }

    r.debts.forEach(d => {
      const loserStats = statsMap.get(d.loserId);
      if (loserStats) {
        loserStats.totalRounds++;
        loserStats.losses++;
        loserStats.netCards -= d.cards || 0;

        if (d.autoTag) {
          loserStats.tagsCount[d.autoTag] = (loserStats.tagsCount[d.autoTag] || 0) + 1;
        }
      }

      if (winnerStats) {
        winnerStats.netCards += d.cards || 0;
        if (d.autoTag === 'ăn sâm') {
          winnerStats.tagsCount['ăn sâm'] = (winnerStats.tagsCount['ăn sâm'] || 0) + 1;
        }
        if (d.autoTag === 'chặt heo') {
          winnerStats.tagsCount['chặt heo'] = (winnerStats.tagsCount['chặt heo'] || 0) + 1;
        }
      }
    });
  });

  // Gán nợ trực tiếp từ matrix
  players.forEach(p => {
    const stat = statsMap.get(p.id);
    if (!stat) return;

    stat.winRate = stat.totalRounds > 0 ? Math.round((stat.wins / stat.totalRounds) * 100) : 0;

    players.forEach(other => {
      if (other.id === p.id) return;
      const owesAmount = matrix[p.id]?.[other.id] || 0;
      if (owesAmount > 0) {
        stat.owes.push({
          toId: other.id,
          toName: nameMap.get(other.id) || other.name,
          cards: owesAmount,
        });
      }

      const owedByAmount = matrix[other.id]?.[p.id] || 0;
      if (owedByAmount > 0) {
        stat.owedBy.push({
          fromId: other.id,
          fromName: nameMap.get(other.id) || other.name,
          cards: owedByAmount,
        });
      }
    });

    stat.owes.sort((a, b) => b.cards - a.cards);
    stat.owedBy.sort((a, b) => b.cards - a.cards);
  });

  return Array.from(statsMap.values()).sort((a, b) => b.netCards - a.netCards);
}
