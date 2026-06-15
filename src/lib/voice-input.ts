export type VoiceMatchResult = {
  win1: string;
  win2: string;
  lose1: string;
  lose2: string;
  winScore: number;
  loseScore: number;
  rawText: string;
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

function phonetic(str: string): string {
  let s = removeDiacritics(str.toLowerCase());
  s = s.replace(/^tr/g, 'ch')
       .replace(/^s/g, 'x')
       .replace(/^gi/g, 'd')
       .replace(/^r/g, 'd')
       .replace(/ph/g, 'f');
  s = s.replace(/p$/g, 't')
       .replace(/c$/g, 't');
  return s;
}

export function parseVoiceInput(
  text: string,
  players: { id: string; name: string; active?: boolean; deleted_at?: unknown }[]
): VoiceMatchResult {
  const rawText = text.trim();
  const normT = removeDiacritics(text.toLowerCase()).trim();
  const textTokens = normT.split(/\s+/).filter(w => w);
  const phoneticTextTokens = textTokens.map(w => phonetic(w));

  type Match = {
    playerId: string;
    score: number;
    startIdx: number;
    endIdx: number;
  };

  const allMatches: Match[] = [];
  const activePlayers = players.filter(p => p.active !== false && !p.deleted_at && p.id && p.name);

  // 1. Find matches
  for (const p of activePlayers) {
    const pTokens = removeDiacritics(p.name.toLowerCase()).split(/\s+/).filter(w => w);
    if (pTokens.length === 0) continue;

    const candidates: string[][] = [];
    candidates.push(pTokens);
    if (pTokens.length >= 2) candidates.push(pTokens.slice(-2));
    candidates.push([pTokens[pTokens.length - 1]]);

    for (const cand of candidates) {
      const candLen = cand.length;
      const candJoined = cand.map(w => phonetic(w)).join(' ');

      for (let i = 0; i <= textTokens.length - candLen; i++) {
        const subTokens = phoneticTextTokens.slice(i, i + candLen);
        const subJoined = subTokens.join(' ');

        const sim = similarity(subJoined, candJoined);
        if (sim >= 0.70) {
          // Exact matches get a heavy boost to avoid overlapping conflicts
          const finalScore = sim === 1.0 ? 10 : sim;
          allMatches.push({
            playerId: p.id,
            score: finalScore,
            startIdx: i,
            endIdx: i + candLen - 1
          });
        }
      }
    }
  }

  // Sort matches (best score first, then longest, then earliest)
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
      if (usedTokens.has(i)) overlap = true;
    }
    if (overlap) continue;

    selectedMatches.push(m);
    usedPlayerIds.add(m.playerId);
    for (let i = m.startIdx; i <= m.endIdx; i++) usedTokens.add(i);
  }

  selectedMatches.sort((a, b) => a.startIdx - b.startIdx);

  // 2. Semantic Analysis
  let winKeywordIdx = -1;
  let loseKeywordIdx = -1;
  for (let i = 0; i < textTokens.length; i++) {
    if (textTokens[i] === 'thang') winKeywordIdx = i;
    if (textTokens[i] === 'thua') loseKeywordIdx = i;
  }

  // 3. Score Parsing
  const unusedTokens = textTokens.filter((_, i) => !usedTokens.has(i));
  let unusedText = unusedTokens.join(' ');

  // Look for standalone digits and connected characters
  unusedText = unusedText.replace(/[-/.]/g, ' ');
  unusedText = unusedText.replace(/\bdeu\b/g, ' deu ');

  const numWords: [RegExp, string][] = [
    [/\bmuoi mot\b/g, ' 11 '], [/\bmuoi hai\b/g, ' 12 '], [/\bmuoi ba\b/g, ' 13 '],
    [/\bmuoi bon\b/g, ' 14 '], [/\bmuoi lam\b/g, ' 15 '], [/\bmuoi\b/g, ' 10 '],
    [/\bmot\b/g, ' 1 '], [/\bhai\b/g, ' 2 '], [/\bba\b/g, ' 3 '],
    [/\bbon\b/g, ' 4 '], [/\bnam\b/g, ' 5 '], [/\bsau\b/g, ' 6 '],
    [/\bbay\b/g, ' 7 '], [/\btam\b/g, ' 8 '], [/\bchin\b/g, ' 9 '],
    [/\bkhong\b/g, ' 0 ']
  ];
  for (const [reg, val] of numWords) unusedText = unusedText.replace(reg, val);

  // "11 deu" -> "11 11"
  unusedText = unusedText.replace(/(\d+)\s+deu/g, '$1 $1');

  const digitRegex = /\b\d+\b/g;
  const matches = [...unusedText.matchAll(digitRegex)];

  let s1 = -1, s2 = -1;
  if (matches.length >= 2) {
    s1 = parseInt(matches[0][0], 10);
    s2 = parseInt(matches[1][0], 10);
  } else if (matches.length === 1) {
    const singleMatch = matches[0][0];
    if (singleMatch.length === 3) {
      s1 = parseInt(singleMatch.substring(0, 2), 10);
      s2 = parseInt(singleMatch.substring(2), 10);
    } else if (singleMatch.length === 4) {
      s1 = parseInt(singleMatch.substring(0, 2), 10);
      s2 = parseInt(singleMatch.substring(2), 10);
    } else if (singleMatch.length === 2) {
      const val = parseInt(singleMatch, 10);
      if (val !== 10 && val !== 11 && val !== 15 && val !== 21) {
        s1 = parseInt(singleMatch[0], 10);
        s2 = parseInt(singleMatch[1], 10);
      } else {
        s1 = val;
      }
    } else {
      s1 = parseInt(singleMatch, 10);
    }
  }

  // 4. Determine Win/Lose
  let win1 = selectedMatches[0]?.playerId || '';
  let win2 = selectedMatches[1]?.playerId || '';
  let lose1 = selectedMatches[2]?.playerId || '';
  let lose2 = selectedMatches[3]?.playerId || '';
  let winScore = 11;
  let loseScore = 5;

  let isTeam1Losing = false;

  if (s1 > -1 && s2 > -1) {
    winScore = Math.max(s1, s2);
    loseScore = Math.min(s1, s2);
    
    // Auto-detect based on scores if no keyword
    if (s1 < s2 && winKeywordIdx === -1 && loseKeywordIdx === -1) {
       isTeam1Losing = true;
    }
  }

  // Keyword overrides
  if (loseKeywordIdx > -1) {
    // We assume Team 1 is before the keyword.
    if (selectedMatches[1] && selectedMatches[1].endIdx < loseKeywordIdx) {
      isTeam1Losing = true;
    }
  }

  if (isTeam1Losing) {
    [win1, lose1] = [lose1, win1];
    [win2, lose2] = [lose2, win2];
  }

  return {
    win1,
    win2,
    lose1,
    lose2,
    winScore,
    loseScore,
    rawText
  };
}
