const fs = require('fs');
let code = fs.readFileSync('src/lib/insights.ts', 'utf8');

// Update addInsight definition
code = code.replace(
  /const addInsight = \(type: string, title: string, texts: string\[\], involved: \(string \| undefined\)\[\], category: InsightCategory\) => {/g,
  "const addInsight = (type: string, title: string, texts: string[], involved: (string | undefined)[], category: InsightCategory, note: string = '') => {"
);
code = code.replace(
  /const randomText = texts\[Math.floor\(Math.random\(\) \* texts.length\)\];/g,
  "const randomText = texts[Math.floor(Math.random() * texts.length)] + (note ? ` (${note})` : '');"
);

// Array of replacements for the end of addInsight calls
const replacements = [
  ['hot_streak', '`Chuỗi thắng: ${streakVal}`'],
  ['cold_streak', '`Chuỗi thua: ${streakVal}`'],
  ['dominator', '`Tỉ lệ thắng: ${Math.round(winRate)}%`'],
  ['struggling', '`Tỉ lệ thắng: ${Math.round(winRate)}%`'],
  ['clutch', '`Thắng sát nút: ${stats.closeWins} trận`'],
  ['heartbreaker', '`Thua sát nút: ${stats.closeLosses} trận`'],
  ['merciless', '`Thắng hủy diệt: ${stats.dominantWins} trận`'],
  ['top_scorer', '`Tổng điểm: ${stats.totalPoints}`'],
  ['ghost', '`Vắng mặt: ${absentDays} buổi`'],
  ['mercenary', '`Chỉ tham gia: ${p.total} trận`'],
  ['mia', '`Không ra sân: ${diffDays} ngày`'],
  ['underdog', '`Lật kèo: ${stats.upsets} trận`'],
  ['deuce', '`Kéo Deuce: ${stats.deuceMatches} trận`'],
];

for (const [id, note] of replacements) {
  const regex = new RegExp(`(addInsight\\('${id}', [\\s\\S]*?\\], \\[.*\\], 'individual')\\);`, 'g');
  code = code.replace(regex, `$1, ${note});`);
}

const pairReplacements = [
  ['perfect_duo', '`Tỉ lệ thắng: ${Math.round(wr)}%`'],
  ['bad_synergy', '`Tỉ lệ thắng: ${Math.round(wr)}%`'],
  ['neutral_duo', '`Tỉ lệ thắng: ${Math.round(wr)}%`'],
];

for (const [id, note] of pairReplacements) {
  const regex = new RegExp(`(addInsight\\('${id}', [\\s\\S]*?\\], \\[.*\\], 'partnership')\\);`, 'g');
  code = code.replace(regex, `$1, ${note});`);
}

fs.writeFileSync('src/lib/insights.ts', code);
console.log('Fixed notes!');
