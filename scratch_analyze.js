const fs = require('fs');
const data = JSON.parse(fs.readFileSync('pickleball_backup_2026-05-12.json', 'utf8'));

const players = data.players.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
const matches = data.matches || [];

console.log(`Total Matches: ${matches.length}`);

// 1. Kẻ ăn bám (Relies on one partner for >50% of wins)
const playerWinsWithPartner = {};
const playerTotalWins = {};

matches.forEach(m => {
  const winners = [m.win_1, m.win_2].filter(Boolean);
  const losers = [m.lose_1, m.lose_2].filter(Boolean);
  
  if (winners.length === 2) {
    const [w1, w2] = winners;
    playerTotalWins[w1] = (playerTotalWins[w1] || 0) + 1;
    playerTotalWins[w2] = (playerTotalWins[w2] || 0) + 1;
    
    playerWinsWithPartner[w1] = playerWinsWithPartner[w1] || {};
    playerWinsWithPartner[w1][w2] = (playerWinsWithPartner[w1][w2] || 0) + 1;
    
    playerWinsWithPartner[w2] = playerWinsWithPartner[w2] || {};
    playerWinsWithPartner[w2][w1] = (playerWinsWithPartner[w2][w1] || 0) + 1;
  }
});

console.log("\n--- CHUỖI TƯƠNG QUAN THẮNG CẶP (KẺ ĂN BÁM) ---");
Object.keys(playerTotalWins).forEach(p => {
  const total = playerTotalWins[p];
  if (total >= 5) {
    let topPartner = null;
    let topPartnerWins = 0;
    Object.keys(playerWinsWithPartner[p] || {}).forEach(partner => {
      if (playerWinsWithPartner[p][partner] > topPartnerWins) {
        topPartnerWins = playerWinsWithPartner[p][partner];
        topPartner = partner;
      }
    });
    
    const reliance = (topPartnerWins / total) * 100;
    if (reliance >= 60) {
      console.log(`${players[p]} thắng tổng cộng ${total} trận, nhưng có tới ${topPartnerWins} trận (${reliance.toFixed(1)}%) là thắng khi cặp với ${players[topPartner]}.`);
    }
  }
});

// 2. Thánh Nhọ (Thua sát nút 9-11 hoặc 10-12 nhiều nhất)
const closeLosses = {};
matches.forEach(m => {
  const scoreDiff = Math.abs(m.win_score - m.lose_score);
  if (scoreDiff <= 2 && m.win_score >= 11) {
    const losers = [m.lose_1, m.lose_2].filter(Boolean);
    losers.forEach(l => closeLosses[l] = (closeLosses[l] || 0) + 1);
  }
});

console.log("\n--- THÁNH NHỌ (THUA SÁT NÚT) ---");
Object.entries(closeLosses).sort((a, b) => b[1] - a[1]).forEach(([p, count]) => {
  console.log(`${players[p]} thua sát nút ${count} lần.`);
});

// 3. Vua Đồ Sát (Thắng hủy diệt cách biệt > 6 điểm vd 11-4 trở xuống)
const dominantWins = {};
matches.forEach(m => {
  const scoreDiff = Math.abs(m.win_score - m.lose_score);
  if (scoreDiff >= 7) {
    const winners = [m.win_1, m.win_2].filter(Boolean);
    winners.forEach(w => dominantWins[w] = (dominantWins[w] || 0) + 1);
  }
});

console.log("\n--- VUA ĐỒ SÁT (THẮNG ÁP ĐẢO) ---");
Object.entries(dominantWins).sort((a, b) => b[1] - a[1]).forEach(([p, count]) => {
  console.log(`${players[p]} có ${count} chiến thắng hủy diệt cách biệt lớn.`);
});

// 4. Kẻ Tách Biệt / Chuyên Đánh Đơn (Đánh 1 vs 1)
let singlesCount = 0;
matches.forEach(m => {
  const winners = [m.win_1, m.win_2].filter(Boolean);
  const losers = [m.lose_1, m.lose_2].filter(Boolean);
  if (winners.length === 1 && losers.length === 1) {
    singlesCount++;
  }
});
console.log(`\nTổng số trận đánh đơn: ${singlesCount}`);

// 5. Cặp đôi chung thủy (Đánh cùng nhau nhiều nhất bất kể thắng thua)
const pairMatches = {};
matches.forEach(m => {
  const winners = [m.win_1, m.win_2].filter(Boolean).sort();
  const losers = [m.lose_1, m.lose_2].filter(Boolean).sort();
  if (winners.length === 2) {
    const key = `${winners[0]}-${winners[1]}`;
    pairMatches[key] = (pairMatches[key] || 0) + 1;
  }
  if (losers.length === 2) {
    const key = `${losers[0]}-${losers[1]}`;
    pairMatches[key] = (pairMatches[key] || 0) + 1;
  }
});
console.log("\n--- CẶP ĐÔI CHUNG THỦY (DÍNH NHƯ SAM) ---");
Object.entries(pairMatches).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([key, count]) => {
  const [p1, p2] = key.split('-');
  console.log(`${players[p1]} và ${players[p2]} đánh chung ${count} trận.`);
});
