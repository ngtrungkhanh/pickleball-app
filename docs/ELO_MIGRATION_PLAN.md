# Kế hoạch Di chuyển Thuật toán ELO: Lựa chọn Mô hình C & Mô hình D

Tài liệu này tổng hợp toàn bộ các phân tích phản biện độc lập, số liệu mô phỏng thực tế qua 2 mùa giải (Season 1 & Season 2) và cung cấp mã nguồn hoàn chỉnh của cả **hai phương án tối ưu nhất (Mô hình C và Mô hình D)** để bạn lựa chọn và tự triển khai tiếp theo tại nhà.

---

## I. Phân tích So sánh & Đánh đổi giữa Mô hình C và Mô hình D

Để đưa ra quyết định triển khai, bạn cần cân nhắc sự đánh đổi (trade-off) giữa **Độ chính xác dự báo toán học** và **Tâm lý trải nghiệm của người chơi**:

| Tiêu chí so sánh | Mô hình C (Advanced ELO) | Mô hình D (Balanced Weighted ELO) |
| :--- | :--- | :--- |
| **Triết lý thiết kế** | Phạt lệch trình Đội bằng trị tuyệt đối ad-hoc ($-0.15 \times |A - B|$) và gán ép tỷ lệ phân bổ điểm thắng/thua bất đối xứng cho các thành viên. | Đội ELO có trọng số **60% người yếu - 40% người mạnh** để tự động hóa giải chiến thuật Targeting. Tính ELO cá nhân độc lập đối đầu với trung bình đối thủ. |
| **Độ chính xác dự báo (Mùa 2)** | **60.0%** (Cao nhất) | **57.0%** (Rất tốt so với ELO cơ bản chỉ 54.0%) |
| **Brier Score (Sai số - Mùa 2)** | **0.2383** (Tốt nhất) | **0.2402** (Tốt hơn ELO cơ bản 0.2406) |
| **Tác động tâm lý người chơi** | **Né tránh gánh tạ**: Người chơi giỏi bị trừ điểm rất nặng khi thua và được cộng rất ít khi thắng. Về lâu dài, người giỏi sẽ từ chối ghép cặp với người yếu. | **Khuyến khích nâng đỡ**: Người giỏi gánh team được bảo vệ bởi ELO đối thủ ở mức cao. Nếu thua, họ không bị trừ quá nặng, giúp họ an tâm đánh cặp cùng người yếu hơn. |
| **Mức độ phức tạp code** | Cao (nhiều công thức phân bổ bất đối xứng nhân tạo). | Thấp, tự nhiên (quay về ELO cá nhân truyền thống). |

### Khuyến nghị:
- **Chọn Mô hình C** nếu bạn ưu tiên **độ chính xác dự toán cao nhất** phục vụ phân tích số liệu/dự báo thô.
- **Chọn Mô hình D** nếu bạn ưu tiên **sự lành mạnh của phong trào**, khuyến khích người giỏi gánh người yếu vui vẻ, thuật toán đơn giản, tự nhiên mà thứ hạng vẫn chính xác (Tùng đứng số 1 và gác Khánh sát nút ở Mùa 2).

---

## II. Số liệu Mô phỏng qua các Mùa giải

### 1. Chỉ số đo lường (Brier Score / Accuracy)
- **Season 1 (103 trận - phân hóa trình độ cao)**:
  - **Mô hình C**: Brier = 0.2366 | Accuracy = 60.2%
  - **Mô hình D**: Brier = **0.2366** | Accuracy = **61.2%** (Dự báo tốt hơn Mô hình C ở Mùa 1)
- **Season 2 (100 trận - trình độ đồng đều)**:
  - **Mô hình C**: Brier = **0.2383** | Accuracy = **60.0%**
  - **Mô hình D**: Brier = 0.2402 | Accuracy = 57.0%

### 2. Bảng xếp hạng ELO cuối các Mùa giải (Sau khi khóa Đóng băng Decay lịch sử):

#### Kết thúc Mùa giải 1 (Season 1 - Khóa ELO vào ngày 23/05/2026)
*Lưu ý: Do trong thời gian Mùa 1 diễn ra mọi người đều chơi đủ số trận, nên khi đóng băng ELO đúng thời điểm Mùa 1 kết thúc, hoàn toàn không có ai bị áp dụng decay ELO. ELO Mùa 1 của Mô hình C và D trùng khớp 100%.*
- **Nguyễn Thanh Tùng**: **1700.3 ELO** (Top 1, phản ánh đúng tỷ lệ thắng hủy diệt 71.4%)
- **Trần Hoàng Nam**: **1537.6 ELO** (Top 2)
- **Lương Thành Chung**: **1476.0 ELO**
- **Nguyễn Ngọc Văn**: **1497.1 ELO**
- **Lê Khắc Hiếu**: **1481.3 ELO**
- **Nguyễn Trung Khánh**: **1404.1 ELO** (Top 6, tỷ lệ thắng thấp 36.2%)
- **Trần Ngọc Hà**: **1403.0 ELO**

#### Kết thúc Mùa giải 2 (Season 2 - Mùa giải hiện tại)
| Thành viên | Tỉ lệ thắng | ELO Mô hình C (Advanced) | ELO Mô hình D (Weighted) |
| :--- | :---: | :---: | :---: |
| **Nguyễn Trung Khánh** | 61.4% | **1606.7 ELO** (Top 1) | **1571.2 ELO** (Top 2) |
| **Nguyễn Thanh Tùng** | **65.5%** | **1601.2 ELO** (Top 2) | **1575.4 ELO** (Top 1) |
| **Trần Hoàng Nam** | 50.6% | 1502.2 ELO | 1495.4 ELO |
| **Lương Thành Chung** | 49.2% | 1494.1 ELO | 1510.8 ELO |
| **Nguyễn Ngọc Văn** | 38.7% | 1403.9 ELO | 1426.1 ELO |
| **Lê Khắc Hiếu** | 35.7% | 1392.1 ELO | 1418.6 ELO |

---

## III. Mã nguồn Sửa đổi File [analysis-core.ts](file:///d:/Pickleball%20App/src/lib/analysis-core.ts)

Tùy theo quyết định lựa chọn mô hình, bạn hãy copy-paste một trong hai phương án code dưới đây vào file `src/lib/analysis-core.ts`:

### PHƯƠNG ÁN 1: MÃ NGUỒN MÔ HÌNH D (Balanced Weighted ELO - KHUYẾN NGHỊ)

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
  // Khởi tạo rating cho cả 4 mô hình
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
    // 1. MÔ HÌNH D CHÍNH THỨC (Balanced Weighted ELO)
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

    // Winners update (Model D) - Tính Expected cá nhân đối đầu trung bình đối thủ
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
    // 2. MÔ HÌNH LEGACY CŨ (Streak x2 & Full Margin)
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
    losers.forEach(id => {
      if (legacyStreakType.get(id) === 'L') {
        legacyStreakCount.set(id, (legacyStreakCount.get(id) ?? 0) + 1);
      } else {
        legacyStreakType.set(id, 'L');
        legacyStreakCount.set(id, 1);
      }
    });

    // ==========================================
    // 3. MÔ HÌNH PROPOSED A (Standard ELO - Margin = 1)
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
    // 4. MÔ HÌNH PROPOSED B (Soft Margin ELO)
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

---

### PHƯƠNG ÁN 2: MÃ NGUỒN MÔ HÌNH C (Advanced ELO - Đối xứng, Phân bổ bất đối xứng bảo toàn)

```typescript
export type EloResult = {
  rating: Map<string, number>; // Mô hình C (Advanced ELO) làm chính thức
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
  // Khởi tạo rating cho cả 4 mô hình
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
  let freezeLimitTime = now.getTime();
  if (seasonId === 'Season 1') {
    freezeLimitTime = new Date('2026-05-23T07:51:20Z').getTime();
  }

  const applyWeeklyDecay = (mondayStr: string) => {
    players.forEach(player => {
      if (!playersPlayed.has(player.id)) return;
      const count = weeklyMatchCount.get(player.id) || 0;

      // 1. Phạt tuần cho Mô hình C, Standard, Soft Margin (Phạt tối đa 24 ELO/tuần, trừ 3 ELO/trận thiếu)
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
    // 1. MÔ HÌNH C CHÍNH THỨC (Advanced ELO - Phân bổ bất đối xứng)
    // ==========================================
    // Mismatch Penalty (Targeting factor: penalty = 0.15)
    const winMismatch = Math.abs((rating.get(w1) ?? 1500) - (rating.get(w2) ?? 1500));
    const winTeamRating = ((rating.get(w1) ?? 1500) + (rating.get(w2) ?? 1500)) / 2 - 0.15 * winMismatch;

    const loseMismatch = Math.abs((rating.get(l1) ?? 1500) - (rating.get(l2) ?? 1500));
    const loseTeamRating = ((rating.get(l1) ?? 1500) + (rating.get(l2) ?? 1500)) / 2 - 0.15 * loseMismatch;

    const expected = 1 / (1 + Math.pow(10, (loseTeamRating - winTeamRating) / 400));
    if (match.id) {
      matchExpected.set(match.id, { winProb: expected, loseProb: 1 - expected, winRating: winTeamRating, loseRating: loseTeamRating });
    }

    const K_avg = (getK(matchCount.get(w1) || 0) + getK(matchCount.get(w2) || 0) + getK(matchCount.get(l1) || 0) + getK(matchCount.get(l2) || 0)) / 4;
    const deltaMatch = K_avg * (1 - expected) * softMargin;
    const totalDelta = 2 * deltaMatch; // Gói điểm dịch chuyển của trận đấu

    // Phân bổ bất đối xứng - Người thắng: ELO thấp nhận nhiều hơn
    const sumWinElo = (rating.get(w1) ?? 1500) + (rating.get(w2) ?? 1500);
    const w1_share = (rating.get(w2) ?? 1500) / sumWinElo;
    const w2_share = (rating.get(w1) ?? 1500) / sumWinElo;
    const deltaW1 = totalDelta * w1_share;
    const deltaW2 = totalDelta * w2_share;

    // Phân bổ bất đối xứng - Người thua: ELO cao bị trừ nhiều hơn
    const sumLoseElo = (rating.get(l1) ?? 1500) + (rating.get(l2) ?? 1500);
    const l1_share = (rating.get(l1) ?? 1500) / sumLoseElo;
    const l2_share = (rating.get(l2) ?? 1500) / sumLoseElo;
    const deltaL1 = totalDelta * l1_share;
    const deltaL2 = totalDelta * l2_share;

    rating.set(w1, Math.round(((rating.get(w1) ?? 1500) + deltaW1) * 10) / 10);
    rating.set(w2, Math.round(((rating.get(w2) ?? 1500) + deltaW2) * 10) / 10);
    rating.set(l1, Math.round(((rating.get(l1) ?? 1500) - deltaL1) * 10) / 10);
    rating.set(l2, Math.round(((rating.get(l2) ?? 1500) - deltaL2) * 10) / 10);

    matchCount.set(w1, (matchCount.get(w1) || 0) + 1);
    matchCount.set(w2, (matchCount.get(w2) || 0) + 1);
    matchCount.set(l1, (matchCount.get(l1) || 0) + 1);
    matchCount.set(l2, (matchCount.get(l2) || 0) + 1);

    // ==========================================
    // 2. MÔ HÌNH LEGACY CŨ (Streak x2 & Full Margin)
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
    losers.forEach(id => {
      if (legacyStreakType.get(id) === 'L') {
        legacyStreakCount.set(id, (legacyStreakCount.get(id) ?? 0) + 1);
      } else {
        legacyStreakType.set(id, 'L');
        legacyStreakCount.set(id, 1);
      }
    });

    // ==========================================
    // 3. MÔ HÌNH PROPOSED A (Standard ELO - Margin = 1)
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
    // 4. MÔ HÌNH PROPOSED B (Soft Margin ELO)
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

---

## IV. Tích hợp giao diện Admin và ghi chú giải thích

### 1. Tab đối chiếu ELO ở trang Admin (`src/app/admin/page.tsx`):
- Thêm `'Đối chiếu ELO'` vào mảng `adminTabs`.
- Triển khai code Tab quản trị hiển thị dropdown lựa chọn Season (Season 1, Season 2) và render bảng so sánh 4 mô hình ELO tương ứng (mã nguồn React chi tiết đã được cung cấp trong kế hoạch triển khai của repository).

### 2. Accordion giải thích luật ELO (`src/components/analysis/AnalysisCenter.tsx`):
- Thay thế phần accordion `"⚡ LUẬT DRAMA HÀNG TUẦN"` bằng các cơ chế mới:
  - Giải thích **Trọng số gánh team (60% yếu - 40% mạnh)** nếu chọn Mô hình D (hoặc Phạt lệch trình Targeting nếu chọn Mô hình C).
  - Giải thích **Quy luật ELO cá nhân độc lập** bảo vệ người chơi giỏi khi cặp với người yếu.
  - Cập nhật mức phạt trốn đấu cuối tuần giảm còn trừ tối đa 24 ELO/tuần (3 ELO cho mỗi trận thiếu dưới 8 trận) và khóa ELO Season khi kết thúc.
