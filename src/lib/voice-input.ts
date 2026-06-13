export type VoiceMatchResult = {
  win1: string;
  win2: string;
  lose1: string;
  lose2: string;
  winScore: number;
  loseScore: number;
};

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function parseVoiceInput(
  text: string,
  players: { id: string; name: string; active?: boolean; deleted_at?: unknown }[]
): VoiceMatchResult {
  const normT = removeDiacritics(text.toLowerCase()).trim();

  // First, extract players from the full normalized text
  const textTokens = normT.split(/\s+/).filter(w => w);

  type Match = {
    playerId: string;
    score: number;
    startIdx: number;
    endIdx: number;
  };

  const allMatches: Match[] = [];
  const activePlayers = players.filter(p => p.active !== false && !p.deleted_at && p.id && p.name);

  for (const p of activePlayers) {
    const pNorm = removeDiacritics(p.name.toLowerCase());
    const pTokens = pNorm.split(/\s+/).filter(w => w);
    if (pTokens.length === 0) continue;

    const candidates: string[][] = [];
    candidates.push(pTokens);
    if (pTokens.length >= 2) {
      candidates.push(pTokens.slice(-2));
    }
    candidates.push([pTokens[pTokens.length - 1]]);

    for (const cand of candidates) {
      const candLen = cand.length;
      const candJoined = cand.join(' ');

      for (let i = 0; i <= textTokens.length - candLen; i++) {
        const subTokens = textTokens.slice(i, i + candLen);
        const subJoined = subTokens.join(' ');

        const sim = similarity(subJoined, candJoined);
        if (sim >= 0.75) {
          allMatches.push({
            playerId: p.id,
            score: sim,
            startIdx: i,
            endIdx: i + candLen - 1
          });
        }
      }
    }
  }

  allMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const lenB = b.endIdx - b.startIdx;
    const lenA = a.endIdx - a.startIdx;
    if (lenB !== lenA) return lenB - lenA;
    return a.startIdx - b.startIdx;
  });

  const selectedMatches: Match[] = [];
  const usedPlayerIds = new Set<string>();
  const usedTokens = new Set<number>();

  for (const m of allMatches) {
    if (selectedMatches.length >= 4) break;
    if (usedPlayerIds.has(m.playerId)) continue;

    let overlap = false;
    for (let i = m.startIdx; i <= m.endIdx; i++) {
      if (usedTokens.has(i)) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    selectedMatches.push(m);
    usedPlayerIds.add(m.playerId);
    for (let i = m.startIdx; i <= m.endIdx; i++) {
      usedTokens.add(i);
    }
  }

  selectedMatches.sort((a, b) => a.startIdx - b.startIdx);

  // Now extract scores from the unused tokens
  const unusedTokens = textTokens.filter((_, i) => !usedTokens.has(i));
  let unusedText = unusedTokens.join(' ');

  // Look for standalone digits first (before replacing anything, as speech recognition often returns digits)
  // e.g. "11", "5", "11-5"
  unusedText = unusedText.replace(/-/g, ' ');

  const numWords: [RegExp, string][] = [
    [/\b(muoi mot)\b/g, ' 11 '],
    [/\b(muoi hai)\b/g, ' 12 '],
    [/\b(muoi ba)\b/g, ' 13 '],
    [/\b(muoi bon)\b/g, ' 14 '],
    [/\b(muoi lam)\b/g, ' 15 '],
    [/\b(muoi)\b/g, ' 10 '],
    [/\b(mot)\b/g, ' 1 '],
    [/\b(hai)\b/g, ' 2 '],
    [/\b(ba)\b/g, ' 3 '],
    [/\b(bon)\b/g, ' 4 '],
    [/\b(nam)\b/g, ' 5 '],
    [/\b(sau)\b/g, ' 6 '],
    [/\b(bay)\b/g, ' 7 '],
    [/\b(tam)\b/g, ' 8 '],
    [/\b(chin)\b/g, ' 9 '],
    [/\b(khong)\b/g, ' 0 ']
  ];

  for (const [reg, val] of numWords) {
    unusedText = unusedText.replace(reg, val);
  }

  const digitRegex = /\b\d+\b/g;
  const matches = [...unusedText.matchAll(digitRegex)];

  let winScore = 11;
  let loseScore = 5;

  if (matches.length >= 2) {
    winScore = parseInt(matches[0][0], 10);
    loseScore = parseInt(matches[1][0], 10);
  }

  return {
    win1: selectedMatches[0]?.playerId || '',
    win2: selectedMatches[1]?.playerId || '',
    lose1: selectedMatches[2]?.playerId || '',
    lose2: selectedMatches[3]?.playerId || '',
    winScore,
    loseScore
  };
}
