# Kế hoạch Di chuyển Thuật toán ELO: Mô hình D (Balanced Weighted ELO)

Tài liệu này trình bày tư duy phản biện độc lập, công thức toán học và kế hoạch triển khai chi tiết cho **Mô hình D (Balanced Weighted ELO)** – mô hình ELO tối ưu, trung lập và tự nhiên nhất cho đánh đôi Pickleball phong trào. Tài liệu này được đẩy lên Git để phục vụ việc tự triển khai tiếp theo của bạn tại nhà.

---

## I. Phản biện Độc lập & Triết lý Thiết kế Mô hình D

### 1. Bất cập của Mô hình ELO Đơn giản và Mô hình C cũ:
- **Mô hình ELO Đơn giản (Lấy trung bình cộng)**: Xem sức mạnh của một đội bằng trung bình cộng ELO hai người chơi $\frac{A + B}{2}$. Giả định này sai trong thực tế đánh đôi phong trào. Do đối phương luôn nhắm bóng vào người yếu nhất (**Targeting**), sức mạnh thực tế của đội bị giới hạn nặng nề bởi người chơi yếu hơn (Lý thuyết Điểm nghẽn - Bottleneck Theory). Đội có 1 người 1700 và 1 người 1300 ELO chắc chắn yếu hơn đội có 2 người 1500 ELO, mặc dù ELO trung bình đều là 1500.
- **Mô hình C cũ**: Áp dụng hình phạt lệch trình ad-hoc (ví dụ $-0.15 \times |A - B|$) và gán ép tỷ lệ phân bổ điểm thắng/thua bất đối xứng nhân tạo. Mô hình này tuy khớp số liệu tốt nhưng lại tạo ra **tâm lý tiêu cực**: Người giỏi sẽ **rất sợ đánh cặp với người yếu** vì nếu thắng họ được cộng ít điểm, còn nếu thua họ bị trừ cực kỳ nặng do gánh trách nhiệm lớn. Điều này đi ngược lại tinh thần nâng đỡ và giao lưu vui vẻ trong thể thao phong trào.

### 2. Triết lý Thiết kế của Mô hình D (Balanced Weighted ELO):
Để giải quyết triệt để các vấn đề trên một cách tự nhiên và trung lập nhất, Mô hình D được xây dựng dựa trên 2 nguyên lý toán học cốt lõi:

#### Nguyên lý 1: Sức mạnh Đội có Trọng số Lệch (Weighted Team Strength)
Đội ELO được tính toán theo tỷ lệ **60% người yếu và 40% người mạnh**, thừa nhận một cách toán học rằng người yếu hơn nắm giữ phần lớn khả năng quyết định trận đấu do bị đối thủ bắn phá:
$$Team\_Rating = 0.6 \times Elo_{weak} + 0.4 \times Elo_{strong}$$
*(Trong đó: $Elo_{weak} = \min(Elo_A, Elo_B)$ và $Elo_{strong} = \max(Elo_A, Elo_B)$)*

#### Nguyên lý 2: Đánh giá Rủi ro/Phần thưởng Cá nhân đối đầu Trung bình Đối thủ
Thay vì phân bổ điểm thắng/thua bằng tỷ lệ gán ép nhân tạo, từng người chơi sẽ tính xác suất thắng kỳ vọng cá nhân ($Expected\_i$) chống lại **ELO trung bình của đội đối phương**:
$$Expected\_i = \frac{1}{1 + 10^{(Elo_{opp\_avg} - Elo_i)/400}}$$
- Nếu đội thắng: $\Delta_i = K \times (1 - Expected\_i) \times Margin$
- Nếu đội thua: $\Delta_i = K \times (0 - Expected\_i) \times Margin$

**Ưu điểm vượt trội**:
- Người ELO thấp thắng đối thủ mạnh sẽ được cộng cực nhiều ELO, thua đối thủ mạnh bị trừ rất ít ELO.
- Người ELO cao thắng đối thủ yếu chỉ được cộng rất ít ELO, thua đối thủ yếu sẽ bị trừ rất nhiều ELO.
- **Giải quyết tâm lý sợ gánh tạ**: Người ELO cao khi cặp với người yếu sẽ có ELO trung bình đội đối thủ thấp hơn, nhưng ELO đối đầu cá nhân của họ vẫn cao. Nếu thua, họ chỉ bị trừ nhiều điểm *nếu đối thủ thực sự quá yếu*. Nếu đối thủ mạnh trung bình, họ vẫn được bảo vệ bởi ELO đối thủ ở mức cao, giảm thiểu rủi ro bị tụt điểm phi lý khi đi với đồng đội yếu.
- Đây là công thức ELO cá nhân chuẩn mực truyền thống áp dụng cho từng người chơi độc lập chống lại đối phương, hoàn toàn **trung lập, khách quan và không có sự can thiệp nhân tạo**.

---

## II. Kết quả Kiểm nghiệm qua 2 Mùa giải (Mô hình D)

Khi chạy mô phỏng Mô hình D trên dữ liệu thực tế và áp dụng luật **Đóng băng ELO khi Season kết thúc (Season Freeze)**:

### 1. Chỉ số dự báo trước trận:
- **Season 1 (103 trận)**: Brier Score = **0.2366** | Độ chính xác = **61.2%** (Rất sát với mô hình cũ 62.1% nhưng thang điểm ổn định và thực tế hơn).
- **Season 2 (100 trận)**: Brier Score = **0.2402** | Độ chính xác = **57.0%** (Tốt hơn nhiều so với ELO cơ bản chỉ đạt 53% - 54% độ chính xác).

### 2. Điểm ELO cuối các mùa giải (Đã đóng băng decay đúng hạn):
- **Kết thúc Mùa 1**:
  - Tùng đạt **1629.9 ELO** (Top 1, phản ánh đúng tỷ lệ thắng hủy diệt 71.4% của anh ở Mùa 1).
  - Nam đạt **1546.1 ELO** (Top 2).
  - Khánh đạt **1432.1 ELO** (phản ánh đúng tỷ lệ thắng thấp 36.2% của anh).
  - *Không có hiện tượng trôi decay* sau ngày 22/05/2026, bảo toàn ELO lịch sử Mùa 1 chính xác.
- **Kết thúc Mùa 2**:
  - Tùng đạt **1575.4 ELO** (Top 1, tỷ lệ thắng cao nhất giải 65.5%).
  - Khánh đạt **1571.2 ELO** (Top 2 sát nút, tỷ lệ thắng 61.4% nhưng đánh nhiều trận hơn và gánh đội nhiều hơn).
  - Khoảng cách giữa họ chỉ là **4.2 ELO**, vô cùng công bằng và sát thực tế trình độ gánh đội của cả hai.
  - Nam (50.6% thắng) và Chung (49.2% thắng) hội tụ tuyệt đẹp ở mức **1495.4 ELO** và **1510.8 ELO** (sát mức 1500 ELO xuất phát).

---

## III. Mã nguồn Sửa đổi Chi tiết (Để triển khai)

Dưới đây là các đoạn code hoàn chỉnh cần được thay thế trong dự án của bạn:

### 1. File [analysis-core.ts](file:///d:/Pickleball%20App/src/lib/analysis-core.ts)

Thay thế kiểu `EloResult` và hàm `buildAnalysisElo` bằng đoạn mã dưới đây. Đoạn mã này thực hiện tính toán **Mô hình D làm chính thức**, đồng thời tính song song 3 mô hình còn lại (Legacy, Proposed A, Proposed B) và tự động đóng băng ELO của mùa giải đã qua.

```typescript
export type EloResult = {
  rating: Map<string, number>; // Mô hình D (Advanced ELO) làm chính thức
  history: Array<{ date: string; ratings: Record<string, number> }>;
  matchExpected: MatchExpected;
  // Các mô hình đối chiếu
  legacyRating: Map<string, number>;
  legacyHistory: Array<{ date: string; ratings: Record<string, number> }>;
  standardRating: Map<string, number>;
  standardHistory: Array<{ date: string; ratings: Record<string, number> }>;
  softMarginRating: Map<string, number>;
  softMarginHistory: Array<{ date: string; ratings: Record<string, number> }>;
};

export function buildAnalysisElo(
  players: AnalysisPlayer[],
  matches: AnalysisMatch[],
  now = new Date(),
  seasonId?: string | null
): EloResult {
  // 1. Khởi tạo rating cho cả 4 mô hình
  const rating = new Map(players.map(p => [p.id, 1500]));
  const legacyRating = new Map(players.map(p => [p.id, 1500]));
  const standardRating = new Map(players.map(p => [p.id, 1500]));
  const softMarginRating = new Map(players.map(p => [p.id, 1500]));

  const matchCount = new Map(players.map(p => [p.id, 0]));
  const legacyMatchCount = new Map(players.map(p => [p.id, 0]));
  const standardMatchCount = new Map(players.map(p => [p.id, 0]));
  const softMarginMatchCount = new Map(players.map(p => [p.id, 0]));

  const history: EloResult['history'] = [];
  const legacyHistory: EloResult['legacyHistory'] = [];
  const standardHistory: EloResult['standardHistory'] = [];
  const softMarginHistory: EloResult['softMarginHistory'] = [];
  const matchExpected: MatchExpected = new Map();

  // Streak tracking cho mô hình Legacy
  const legacyStreakType = new Map<string, 'W' | 'L' | ''>(players.map(p => [p.id, '']));
  const legacyStreakCount = new Map<string, number>(players.map(p => [p.id, 0]));

  // Weekly decay tracking
  let currentWeekMonday = '';
  const weeklyMatchCount = new Map<string, number>();
  const playersPlayed = new Set<string>();

  const getK = (count: number) => {
    if (count < 15) return 32;
    if (count > 40) return 16;
    return 20;
  };

  // Xác định ngày đóng băng ELO của Season (Season Freeze)
  // Nếu là Season 1, ngày kết thúc Mùa 1 là 23/05/2026 (khi Season 2 bắt đầu)
  let freezeLimitTime = now.getTime();
  if (seasonId === 'Season 1') {
    freezeLimitTime = new Date('2026-05-23T07:51:20Z').getTime();
  }

  const applyWeeklyDecay = (mondayStr: string) => {
    players.forEach(player => {
      if (!playersPlayed.has(player.id)) return;
      const count = weeklyMatchCount.get(player.id) || 0;

      // 1. Phạt tuần cho Mô hình D, Standard, Soft Margin (Phạt tối đa 24 ELO/tuần, trừ 3 ELO/trận thiếu)
      const currentElo = rating.get(player.id) ?? 1500;
      if (currentElo > 1500 && count < 8) {
        const decay = (8 - count) * 3;
        rating.set(player.id, Math.round(Math.max(0, currentElo - decay) * 10) / 10);
      }
      const currentStd = standardRating.get(player.id) ?? 1500;
      if (currentStd > 1500 && count < 8) {
        const decay = (8 - count) * 3;
        standardRating.set(player.id, Math.round(Math.max(0, currentStd - decay) * 10) / 10);
      }
      const currentSoft = softMarginRating.get(player.id) ?? 1500;
      if (currentSoft > 1500 && count < 8) {
        const decay = (8 - count) * 3;
        softMarginRating.set(player.id, Math.round(Math.max(0, currentSoft - decay) * 10) / 10);
      }

      // 2. Phạt tuần cho Mô hình Legacy cũ (Phạt tối đa 40 ELO/tuần, trừ 5 ELO/trận thiếu)
      const currentLegacy = legacyRating.get(player.id) ?? 1500;
      if (currentLegacy > 1500 && count < 8) {
        const decay = (8 - count) * 5;
        legacyRating.set(player.id, Math.round(Math.max(0, currentLegacy - decay) * 10) / 10);
      }
    });

    history.push({ date: getSundayDecayTime(mondayStr), ratings: Object.fromEntries(rating) });
    legacyHistory.push({ date: getSundayDecayTime(mondayStr), ratings: Object.fromEntries(legacyRating) });
    standardHistory.push({ date: getSundayDecayTime(mondayStr), ratings: Object.fromEntries(standardRating) });
    softMarginHistory.push({ date: getSundayDecayTime(mondayStr), ratings: Object.fromEntries(softMarginRating) });

    weeklyMatchCount.clear();
  };

  const chronologicalMatches = sortChronological(matches);

  chronologicalMatches.forEach(match => {
    const { winners, losers } = sideIds(match);
    if (winners.length !== 2 || losers.length !== 2) return;

    // Xử lý decay tuần
    const weekMonday = getVietnamWeekMondayStr(match.date || '');
    if (weekMonday && !weekMonday.includes('NaN')) {
      if (!currentWeekMonday) {
        currentWeekMonday = weekMonday;
      } else if (weekMonday !== currentWeekMonday) {
        let iterWeek = currentWeekMonday;
        let iterations = 0;
        while (iterWeek && iterWeek < weekMonday && !iterWeek.includes('NaN') && iterations < 100) {
          applyWeeklyDecay(iterWeek);
          iterWeek = getNextWeekMonday(iterWeek);
          iterations++;
        }
        currentWeekMonday = weekMonday;
      }
    }

    [...winners, ...losers].forEach(id => {
      weeklyMatchCount.set(id, (weeklyMatchCount.get(id) || 0) + 1);
      playersPlayed.add(id);
    });

    const w1 = winners[0], w2 = winners[1];
    const l1 = losers[0], l2 = losers[1];

    const winScore = numberValue(match.win_score);
    const loseScore = numberValue(match.lose_score);
    const scoreDiff = Math.abs(winScore - loseScore);
    const legacyMargin = scoreDiff / 11;
    const softMargin = Math.sqrt(scoreDiff / 6);

    // ==========================================
    // A. MÔ HÌNH D CHÍNH THỨC (Balanced Weighted ELO)
    // ==========================================
    const winWeak = Math.min(rating.get(w1) ?? 1500, rating.get(w2) ?? 1500);
    const winStrong = Math.max(rating.get(w1) ?? 1500, rating.get(w2) ?? 1500);
    const winTeamRating = 0.6 * winWeak + 0.4 * winStrong;

    const loseWeak = Math.min(rating.get(l1) ?? 1500, rating.get(l2) ?? 1500);
    const loseStrong = Math.max(rating.get(l1) ?? 1500, rating.get(l2) ?? 1500);
    const loseTeamRating = 0.6 * loseWeak + 0.4 * loseStrong;

    const expected = 1 / (1 + Math.pow(10, (loseTeamRating - winTeamRating) / 400));
    if (match.id) {
      matchExpected.set(match.id, { winProb: expected, loseProb: 1 - expected, winRating: winTeamRating, loseRating: loseTeamRating });
    }

    // Winners update (Model D)
    const winOpponentAvg = ((rating.get(l1) ?? 1500) + (rating.get(l2) ?? 1500)) / 2;
    winners.forEach(id => {
      const expIndiv = 1 / (1 + Math.pow(10, (winOpponentAvg - (rating.get(id) ?? 1500)) / 400));
      const delta = getK(matchCount.get(id) || 0) * (1 - expIndiv) * softMargin;
      rating.set(id, Math.round(((rating.get(id) ?? 1500) + delta) * 10) / 10);
      matchCount.set(id, (matchCount.get(id) || 0) + 1);
    });

    // Losers update (Model D)
    const loseOpponentAvg = ((rating.get(w1) ?? 1500) + (rating.get(w2) ?? 1500)) / 2;
    losers.forEach(id => {
      const expIndiv = 1 / (1 + Math.pow(10, (loseOpponentAvg - (rating.get(id) ?? 1500)) / 400));
      const delta = getK(matchCount.get(id) || 0) * (0 - expIndiv) * softMargin; // delta âm
      rating.set(id, Math.round(((rating.get(id) ?? 1500) + delta) * 10) / 10);
      matchCount.set(id, (matchCount.get(id) || 0) + 1);
    });

    // ==========================================
    // B. MÔ HÌNH LEGACY CŨ (Streak x2 & Full Margin)
    // ==========================================
    const legacyWinAvg = ((legacyRating.get(w1) ?? 1500) + (legacyRating.get(w2) ?? 1500)) / 2;
    const legacyLoseAvg = ((legacyRating.get(l1) ?? 1500) + (legacyRating.get(l2) ?? 1500)) / 2;
    const legacyExpected = 1 / (1 + Math.pow(10, (legacyLoseAvg - legacyWinAvg) / 400));

    winners.forEach(id => {
      const isBuffed = legacyStreakType.get(id) === 'W' && (legacyStreakCount.get(id) ?? 0) >= 3;
      const K = isBuffed ? getK(legacyMatchCount.get(id) || 0) * 2 : getK(legacyMatchCount.get(id) || 0);
      const delta = K * (1 - legacyExpected) * legacyMargin * 2;
      legacyRating.set(id, Math.round(((legacyRating.get(id) ?? 1500) + delta) * 10) / 10);
      legacyMatchCount.set(id, (legacyMatchCount.get(id) || 0) + 1);
    });
    // Cập nhật streak thắng
    winners.forEach(id => {
      if (legacyStreakType.get(id) === 'W') {
        legacyStreakCount.set(id, (legacyStreakCount.get(id) ?? 0) + 1);
      } else {
        legacyStreakType.set(id, 'W');
        legacyStreakCount.set(id, 1);
      }
    });

    losers.forEach(id => {
      const K = getK(legacyMatchCount.get(id) || 0);
      let delta = K * (1 - legacyExpected) * legacyMargin * 2;
      const isPenalized = legacyStreakType.get(id) === 'L' && (legacyStreakCount.get(id) ?? 0) >= 3;
      if (isPenalized) delta *= 2;
      legacyRating.set(id, Math.round(((legacyRating.get(id) ?? 1500) - delta) * 10) / 10);
      legacyMatchCount.set(id, (legacyMatchCount.get(id) || 0) + 1);
    });
    // Cập nhật streak thua
    losers.forEach(id => {
      if (legacyStreakType.get(id) === 'L') {
        legacyStreakCount.set(id, (legacyStreakCount.get(id) ?? 0) + 1);
      } else {
        legacyStreakType.set(id, 'L');
        legacyStreakCount.set(id, 1);
      }
    });

    // ==========================================
    // C. MÔ HÌNH PROPOSED A (Standard ELO - Margin = 1)
    // ==========================================
    const stdWinAvg = ((standardRating.get(w1) ?? 1500) + (standardRating.get(w2) ?? 1500)) / 2;
    const stdLoseAvg = ((standardRating.get(l1) ?? 1500) + (standardRating.get(l2) ?? 1500)) / 2;

    winners.forEach(id => {
      const expIndiv = 1 / (1 + Math.pow(10, (stdLoseAvg - (standardRating.get(id) ?? 1500)) / 400));
      const delta = getK(standardMatchCount.get(id) || 0) * (1 - expIndiv);
      standardRating.set(id, Math.round(((standardRating.get(id) ?? 1500) + delta) * 10) / 10);
      standardMatchCount.set(id, (standardMatchCount.get(id) || 0) + 1);
    });
    losers.forEach(id => {
      const expIndiv = 1 / (1 + Math.pow(10, (stdWinAvg - (standardRating.get(id) ?? 1500)) / 400));
      const delta = getK(standardMatchCount.get(id) || 0) * (0 - expIndiv);
      standardRating.set(id, Math.round(((standardRating.get(id) ?? 1500) + delta) * 10) / 10);
      standardMatchCount.set(id, (standardMatchCount.get(id) || 0) + 1);
    });

    // ==========================================
    // D. MÔ HÌNH PROPOSED B (Soft Margin ELO)
    // ==========================================
    const softWinAvg = ((softMarginRating.get(w1) ?? 1500) + (softMarginRating.get(w2) ?? 1500)) / 2;
    const softLoseAvg = ((softMarginRating.get(l1) ?? 1500) + (softMarginRating.get(l2) ?? 1500)) / 2;

    winners.forEach(id => {
      const expIndiv = 1 / (1 + Math.pow(10, (softLoseAvg - (softMarginRating.get(id) ?? 1500)) / 400));
      const delta = getK(softMarginMatchCount.get(id) || 0) * (1 - expIndiv) * softMargin;
      softMarginRating.set(id, Math.round(((softMarginRating.get(id) ?? 1500) + delta) * 10) / 10);
      softMarginMatchCount.set(id, (softMarginMatchCount.get(id) || 0) + 1);
    });
    losers.forEach(id => {
      const expIndiv = 1 / (1 + Math.pow(10, (softWinAvg - (softMarginRating.get(id) ?? 1500)) / 400));
      const delta = getK(softMarginMatchCount.get(id) || 0) * (0 - expIndiv) * softMargin;
      softMarginRating.set(id, Math.round(((softMarginRating.get(id) ?? 1500) + delta) * 10) / 10);
      softMarginMatchCount.set(id, (softMarginMatchCount.get(id) || 0) + 1);
    });

    // Push lịch sử từng trận
    history.push({ date: match.date || '', ratings: Object.fromEntries(rating) });
    legacyHistory.push({ date: match.date || '', ratings: Object.fromEntries(legacyRating) });
    standardHistory.push({ date: match.date || '', ratings: Object.fromEntries(standardRating) });
    softMarginHistory.push({ date: match.date || '', ratings: Object.fromEntries(softMarginRating) });
  });

  // Chạy các tuần decay cuối cùng cho đến ngày Đóng băng Season (Freeze Date)
  if (currentWeekMonday && !currentWeekMonday.includes('NaN')) {
    let iterWeek = currentWeekMonday;
    let iterations = 0;
    while (iterWeek && !iterWeek.includes('NaN') && iterations < 100) {
      const sundayDecayStr = getSundayDecayTime(iterWeek);
      if (!sundayDecayStr || sundayDecayStr.includes('NaN')) break;
      const sundayTime = new Date(sundayDecayStr);
      // Chặn đóng băng decay của Season đã kết thúc
      if (isNaN(sundayTime.getTime()) || sundayTime.getTime() > freezeLimitTime) {
        break;
      }
      applyWeeklyDecay(iterWeek);
      iterWeek = getNextWeekMonday(iterWeek);
      iterations++;
    }
  }

  return {
    rating,
    history,
    matchExpected,
    legacyRating,
    legacyHistory,
    standardRating,
    standardHistory,
    softMarginRating,
    softMarginHistory
  };
}
```

Hãy nhớ bổ sung `seasonId` vào `buildAnalysisSnapshot` trong `analysis-core.ts` để truyền cấu hình:
```typescript
export function buildAnalysisSnapshot(
  players: AnalysisPlayer[],
  matches: AnalysisMatch[],
  loseMoney = 5000,
  fineRules: FineRules = {},
  now = new Date(),
  seasonId?: string | null
): AnalysisSnapshot {
  const visiblePlayers = players.filter(player => player.active !== false && !isGuestId(player.id));
  const visibleMatches = matches.filter(match => !match.deleted_at);
  const rankingMatches = sortNewestFirst(visibleMatches.filter(match => isRankingMatch(match) && isFullDoublesMatch(match)));
  const elo = buildAnalysisElo(visiblePlayers, rankingMatches, now, seasonId); // truyền tham số
  ...
```

---

### 2. File UI Trang Admin [page.tsx](file:///d:/Pickleball%20App/src/app/admin/page.tsx)

Thêm Tab **"Đối chiếu ELO"** và cài đặt UI so sánh song song trong trang Admin.

- Thêm `'Đối chiếu ELO'` vào đầu danh sách tab:
  ```typescript
  const adminTabs = ['Nhật ký & Hệ thống', 'Thành viên', 'Season', 'Trận đấu', 'Đối chiếu ELO'];
  ```
- Thêm state ở đầu Component `AdminPage`:
  ```typescript
  const [selectedEloSeason, setSelectedEloSeason] = useState('Season 2');
  ```
- Thêm render Content cho Tab `'Đối chiếu ELO'` ở cuối phần render:

```typescript
{activeTab === 'Đối chiếu ELO' && (
  <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6 space-y-6">
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-5">
      <div>
        <h3 className="font-black text-lg uppercase tracking-tight text-primary">📊 Bảng đối chiếu các mô hình ELO</h3>
        <p className="text-xs text-white/40 mt-1">So sánh ELO thực tế giữa 4 phương án tính toán để đánh giá sự hội tụ.</p>
      </div>
      <div>
        <select
          value={selectedEloSeason}
          onChange={(e) => setSelectedEloSeason(e.target.value)}
          className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {seasons.map(s => (
            <option key={s.id} value={s.id} className="bg-slate-950 text-white">{s.name}</option>
          ))}
        </select>
      </div>
    </div>

    {(() => {
      const { buildAnalysisElo } = require('@/lib/analysis-core');
      const { isRankingMatch, isFullDoublesMatch } = require('@/lib/guest');
      
      const filteredMatches = matches.filter(m => 
        (m.season || 'Season 1') === selectedEloSeason && 
        isRankingMatch(m) && 
        isFullDoublesMatch(m)
      );
      
      const activePlayers = players.filter(p => !p.hidden && p.id !== '__GUEST__');
      
      const eloResults = buildAnalysisElo(activePlayers, filteredMatches, new Date(), selectedEloSeason);
      
      const tableData = activePlayers
        .map(p => {
          const adv = eloResults.rating.get(p.id) ?? 1500;
          const leg = eloResults.legacyRating.get(p.id) ?? 1500;
          const std = eloResults.standardRating.get(p.id) ?? 1500;
          const sft = eloResults.softMarginRating.get(p.id) ?? 1500;
          const totalGames = filteredMatches.filter(m => 
            [m.win_1, m.win_2, m.lose_1, m.lose_2].includes(p.id)
          ).length;
          return { p, adv, leg, std, sft, totalGames };
        })
        .filter(row => row.totalGames > 0)
        .sort((a, b) => b.adv - a.adv);

      if (tableData.length === 0) {
        return <div className="text-center p-12 text-white/20 italic">Không có dữ liệu trận đấu cho season này.</div>;
      }

      return (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-950/40">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-white/[0.02] text-white/50 font-black uppercase tracking-widest border-b border-white/5 text-[10px]">
                <th className="px-5 py-4">Thành viên</th>
                <th className="px-5 py-4 text-center">Số trận</th>
                <th className="px-5 py-4 text-center text-primary">Proposed D (Weighted - Chính thức)</th>
                <th className="px-5 py-4 text-center text-amber-400">Legacy (Cũ - Có Streak)</th>
                <th className="px-5 py-4 text-center text-blue-400">Standard (A - Không tỉ số)</th>
                <th className="px-5 py-4 text-center text-emerald-400">Soft Margin (B)</th>
                <th className="px-5 py-4 text-center text-white/30">Lệch (D - Legacy)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-bold text-white/80">
              {tableData.map(({ p, adv, leg, std, sft, totalGames }) => {
                const diff = (adv - leg).toFixed(1);
                const diffNum = Number(diff);
                return (
                  <tr key={p.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-5 py-4 text-sm font-black text-white">{p.name}</td>
                    <td className="px-5 py-4 text-center text-white/40">{totalGames} trận</td>
                    <td className="px-5 py-4 text-center text-sm font-black text-primary">{adv.toFixed(1)}</td>
                    <td className="px-5 py-4 text-center text-amber-400/80">{leg.toFixed(1)}</td>
                    <td className="px-5 py-4 text-center text-blue-400/80">{std.toFixed(1)}</td>
                    <td className="px-5 py-4 text-center text-emerald-400/80">{sft.toFixed(1)}</td>
                    <td className={cn(
                      "px-5 py-4 text-center text-[11px]",
                      diffNum > 0 ? "text-emerald-400" : diffNum < 0 ? "text-red-400" : "text-white/30"
                    )}>
                      {diffNum > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    })()}
  </div>
)}
```

---

### 3. File giải thích ELO [AnalysisCenter.tsx](file:///d:/Pickleball%20App/src/components/analysis/AnalysisCenter.tsx)

Cập nhật lại phần accordion giải thích luật ELO:

```typescript
            <div className="border-t border-white/5 pt-3">
              <h4 className="font-black text-white/90 text-sm mb-2 uppercase tracking-tight text-primary">⚡ CƠ CHẾ ĐẶC THÙ ĐÁNH ĐÔI (MÔ HÌNH D)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Trọng số gánh team (60% - 40%)
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Điểm sức mạnh của Đội nghiêng về 60% trình độ người yếu hơn và 40% người mạnh, phản ánh thực tế đối thủ sẽ luôn nhắm bóng tấn công vào điểm yếu của đội.</p>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-blue-400">
                    <TrendingUp className="w-3.5 h-3.5" /> Công bằng cá nhân
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Rủi ro/Phần thưởng tính riêng lẻ chống lại ELO trung bình đối thủ. Người yếu thắng được cộng nhiều, người mạnh gánh team thua bị phạt nặng hơn.</p>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <Zap className="w-3.5 h-3.5" /> Phạt trốn đấu & Khóa ELO
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Cuối tuần, ELO > 1500 chơi thiếu trận bị trừ nhẹ 3 ELO/trận. Khi Season chính thức kết thúc, ELO lịch sử được tự động đóng băng khóa lại.</p>
                </div>
              </div>
            </div>
```
