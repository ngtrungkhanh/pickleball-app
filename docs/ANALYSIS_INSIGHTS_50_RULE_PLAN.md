# Analysis Insights 50+ Rule Plan

This is the canonical plan for the next `/analysis` insight rewrite. Update this
file before changing implementation details so future work does not drift.

## Core Decisions

- Fix data correctness before rewriting copy:
  - Partner/opponent edges must only count matches where the player is actually
    present.
  - An edge total must never exceed that player's real match total.
- Implement the first full pass as 50+ scenarios with 1 strong sentence each.
  Expand each scenario to 4-5 random text variants only after data and tone are
  verified.
- Every sentence must include evidence naturally inside the comment: record,
  sample size, win rate, score gap, streak, expected-rate delta, money, or days
  absent.
- Do not show raw engineering words in user-facing comments:
  - Avoid: `machine`, `máy` when referring to the prediction system,
    `baseline`, `impact`, `performance score`, `deuce`.
  - Sports idioms such as `máy cày` or `máy test vợt` are allowed because they
    do not refer to the prediction system.
  - Use instead:
    - `tỷ lệ thắng dự tính`
    - `kỳ vọng từ ELO trước trận`
    - `cao hơn kỳ vọng từ ELO X điểm`
    - `thấp hơn kỳ vọng từ ELO X điểm`
    - `kéo qua 11 điểm`
- ELO expected rate means the expected win probability calculated before each
  match from the two teams' ELO ratings at that time.
- The "X điểm above/below expectation" number is the average gap between real
  result and ELO-based expected result, multiplied by 100 and rounded.
- Strong teasing words such as `out trình`, `đóng hòm`, `át vía`, `báo thủ`, or
  `gánh tạ` require enough sample size and a matching record. Do not use them
  when the evidence is thin or contradictory.

## Selection And Frequency

Each scenario should define:

- `type`
- `group`: `form`, `rank`, `elo`, `partner`, `opponent`, `score`, `fun`
- `rarity`: `common`, `uncommon`, `rare`, `epic`
- `frequency`: `always`, `frequent`, `occasional`, `rare`
- `appearanceRate`: default selection rate control from `0.1` to `1`
- `baseWeight`
- `evidenceStrength`: sample-size confidence
- `participants`
- `evidence`
- `sentence`

Selector rules:

- Return about 6-8 insights.
- A player can appear at most twice.
- A player can appear at most once in the same semantic group.
- A global scenario type should appear at most once.
- Always-available scenarios such as top ELO and rank leaders get a frequency
  penalty.
- Rare scenarios such as long streaks, huge underdog wins, hard counters, and
  strong partner/opponent records get a rarity bonus.
- Final score shape:
  - `selectionScore = baseWeight + rarityBonus + evidenceStrength + surpriseScore - frequencyPenalty`
  - `appearanceRate` can cap or dampen scenarios that otherwise appear too often.

## Scenario List

The target is at least 50 scenarios. This plan keeps 50 core scenarios and adds
2 rank-specific scenarios because ranking is distinct from ELO.

| # | Type | Group | Trigger / Evidence | Frequency | First-pass sentence |
|---:|---|---|---|---|---|
| 1 | `hot_streak` | form | current win streak >= 4 | occasional | `{name} đang thắng liền {count} trận, form này lên sân là đối thủ phải chuẩn bị thở oxy.` |
| 2 | `cold_streak` | form | current loss streak >= 4 | occasional | `{name} đang đỏ {count} trận liên tiếp, có vẻ cần một kèo giải hạn thật sự.` |
| 3 | `elo_king` | elo | rank 1 ELO and gap to #2 is safe | always | `{name} đang giữ nóc ELO với {elo} điểm, hơn người bám sau {gap} điểm.` |
| 4 | `giant_killer` | elo | wins where expected win rate < 30% | rare | `{name} có {count} lần thắng cửa dưới khi tỷ lệ thắng dự tính chỉ dưới 30%, đúng kiểu chuyên gạt giò.` |
| 5 | `earthquake_victim` | elo | losses where expected win rate > 70% | rare | `{name} có {count} lần cửa trên trên 70% mà vẫn rơi kèo, sân phủi đúng là khó đoán.` |
| 6 | `perfect_form5` | form | last 5 ranked matches are wins | occasional | `{name} đang thắng 5/5 trận gần nhất, bảng form xanh kín nhìn khá cháy.` |
| 7 | `zero_form5` | form | last 5 ranked matches are losses | occasional | `{name} đang thua 0/5 trận gần nhất, đoạn này đúng là hơi sập hầm.` |
| 8 | `gatekeeper` | elo | total >= 20 and ELO within 1000 +/- 20 | frequent | `{name} đã đánh {total} trận mà ELO vẫn quanh {elo}, đúng kiểu người giữ cổng 1000.` |
| 9 | `most_improved` | elo | ELO or expected-performance trend rises sharply | rare | `{name} đang tăng {delta} điểm ELO trong giai đoạn gần đây, dấu hiệu lên tay khá rõ.` |
| 10 | `free_fall` | elo | ELO or expected-performance trend drops sharply | rare | `{name} đang rơi {delta} điểm ELO gần đây, cần thắng vài kèo để kéo lại vía.` |
| 11 | `streak_breaker` | form | player beats someone who had win streak >= 4 | rare | `{name} vừa cắt chuỗi {streak} trận thắng của {target}, một pha gạt giò khá đau.` |
| 12 | `revenge_win` | opponent | player beats opponent after prior repeated losses | rare | `{name} cuối cùng cũng giải được {opponent} sau {losses} lần thua trước đó, kèo phục hận đã lên sóng.` |
| 13 | `rank_leader` | rank | #1 by current leaderboard rank | always | `{name} đang đứng đầu bảng xếp hạng với {wins}/{total} trận thắng, tỷ lệ {rate}%.` |
| 14 | `rank_climber` | rank | rank improves strongly over recent window | rare | `{name} đang leo {places} bậc trên bảng xếp hạng gần đây, record mới nhất {wins}/{recentTotal} trận khá có lực.` |
| 15 | `perfect_duo` | partner | pair win rate >= 75%, total >= 4 | occasional | `{a} và {b} đang thắng {wins}/{total} trận chung, đạt {rate}%, đúng chất cặp bài trùng.` |
| 16 | `bad_duo` | partner | pair win rate <= 25%, total >= 4 | occasional | `{a} đi với {b} mới thắng {wins}/{total} trận, tỷ lệ {rate}%, dữ liệu đang báo hơi dẫm chân nhau.` |
| 17 | `partner_boost` | partner | with-partner result is clearly above ELO expectation and record is not bad | rare | `{a} cặp với {b} thắng {wins}/{total} trận và đánh cao hơn kỳ vọng từ ELO {delta} điểm.` |
| 18 | `partner_drag` | partner | with-partner result is clearly below ELO expectation and record is bad | rare | `{a} đứng cùng {b} chỉ thắng {wins}/{total} trận, lại thấp hơn kỳ vọng từ ELO {delta} điểm.` |
| 19 | `cover_master` | partner | attack low, partner results/synergy strong | rare | `{name} ghi điểm không quá ồn ào nhưng đi với nhiều đồng đội vẫn giúp cặp thắng {rate}% số trận.` |
| 20 | `carry_partner` | partner | partner performs clearly better with this player | rare | `{partner} đi với {name} thắng {wins}/{total} trận, cao hơn hẳn mức thường thấy của {partner}.` |
| 21 | `heavy_backpack` | partner | partner performs clearly worse with this player | rare | `{partner} đi với {name} tụt từ mức thắng thường thấy {normalRate}% xuống còn {pairRate}%, kèo này hơi nặng vai.` |
| 22 | `stable_partner` | partner | pair plays often, rate 50-65%, expectation delta near 0 | frequent | `{a} và {b} đánh chung {total} trận, thắng {wins} trận, không bùng nổ nhưng khá tròn vai.` |
| 23 | `glued_pair` | partner | most frequent pair | frequent | `{a} và {b} đã đánh chung {total} trận, tần suất dính nhau nhiều nhất sân.` |
| 24 | `rare_pair_hot` | partner | pair has exactly/near 4-5 matches and all or almost all wins | rare | `{a} và {b} mới đánh {total} trận nhưng thắng {wins}/{total}, mẫu còn mỏng mà nhìn khá thơm.` |
| 25 | `disaster_duo` | partner | pair plays often, loses often, avg diff negative | rare | `{a} và {b} thua {losses}/{total} trận chung, trung bình mỗi trận âm {avgDiff} điểm, cần đổi bài gấp.` |
| 26 | `partner_long_games` | partner | pair has >= 3 matches over 11 points together | uncommon | `{a} và {b} đánh chung mà đã có {count} trận kéo qua 11 điểm, cặp này thích cò cưa thật.` |
| 27 | `top_attack` | score | top attack score / avg points for | frequent | `{name} đang ghi trung bình {avgPointsFor} điểm/trận, cao nhất sân ở khoản dập bóng.` |
| 28 | `defense_wall` | score | avg conceded <= 5 | occasional | `{name} chỉ mất trung bình {avgConceded} điểm/trận, phòng thủ kiểu này đối thủ rất khó đóng điểm.` |
| 29 | `dominant_closer` | score | dominant wins by >= 7 points >= 4 | occasional | `{name} có {count} trận thắng cách biệt từ 7 điểm trở lên, vào tay là đóng hòm khá nhanh.` |
| 30 | `close_loss` | score | close losses by 1-2 points >= 3 | occasional | `{name} đã thua sát nút {count} trận chỉ 1-2 điểm, đúng kiểu thánh nhọ sân bãi.` |
| 31 | `long_game_addict` | score | matches over 11 points >= 3 | occasional | `{name} đã góp mặt trong {count} trận kéo qua 11 điểm, đam mê cò cưa hơi rõ.` |
| 32 | `bagel_loss` | score | losses where own score <= 2 | uncommon | `{name} có {count} trận thua mà team chỉ ghi tối đa 2 điểm, đoạn này hơi sập nguồn.` |
| 33 | `clutch_master` | score | close wins by 1-2 points >= 3 | occasional | `{name} thắng sát nút {count} trận, càng cuối kèo càng lì.` |
| 34 | `late_collapse` | score | close losses notably exceed close wins | occasional | `{name} thua sát nút {count} trận, nhiều kèo chỉ thiếu một nhịp là lật được.` |
| 35 | `score_bully` | score | average winning diff is high | uncommon | `Mỗi khi thắng, {name} thường thắng trung bình {avgWinDiff} điểm, không thích dây dưa.` |
| 36 | `low_score_magnet` | score | often on losing team with very low score | uncommon | `{name} góp mặt trong {count} trận team thua điểm rất thấp, đúng kiểu cột thu lôi hôm xấu trời.` |
| 37 | `hard_counter` | opponent | vs one opponent: total >= 4 and win rate 100% | rare | `{a} gặp {b} đang thắng {wins}/{total} trận, tỷ lệ {rate}%, kèo này nhìn khá khắc tinh.` |
| 38 | `target_dummy` | opponent | vs one opponent: total >= 4 and win rate 0% | rare | `{a} gặp {b} đang thua {losses}/{total} trận, cứ đối đầu là hơi bị át vía.` |
| 39 | `balanced_rivalry` | opponent | frequent opponent, rate 40-60% | frequent | `{a} và {b} đã gặp {total} trận với tỷ số {wins}-{losses}, đúng kèo kỳ phùng địch thủ.` |
| 40 | `long_game_rivalry` | opponent | vs one opponent: many matches over 11 points | uncommon | `{a} gặp {b} có {count}/{total} trận kéo qua 11 điểm, cứ chạm nhau là dây dưa.` |
| 41 | `boss_hunter` | opponent | wins vs higher ELO / low expected win rate | rare | `{name} có {count} lần thắng đối thủ ELO cao hơn, thợ săn trùm hơi uy tín.` |
| 42 | `mental_block` | opponent | vs opponent result below ELO expectation | rare | `{a} gặp {b} thì đánh thấp hơn kỳ vọng từ ELO {delta} điểm, dấu hiệu khớp kèo khá rõ.` |
| 43 | `sweet_matchup` | opponent | vs opponent result above ELO expectation and record good | rare | `{a} gặp {b} đang thắng {wins}/{total} trận và cao hơn kỳ vọng từ ELO {delta} điểm, kèo này khá thơm.` |
| 44 | `bully_lower_elo` | opponent | wins often against lower-ELO opponents | uncommon | `{name} thắng {count} trận trước nhóm ELO thấp hơn, farm kèo mềm khá đều tay.` |
| 45 | `victim_strong_elo` | opponent | loses often against higher-ELO opponents | uncommon | `{name} gặp nhóm ELO cao hơn đang thua {losses}/{total} trận, lịch đấu này không dễ thở.` |
| 46 | `revenge_target` | opponent | recent record vs opponent improves after bad old record | rare | `Gần đây {a} gặp {b} thắng {wins}/{recentTotal} trận sau giai đoạn bị đì, có mùi lật kèo.` |
| 47 | `iron_lung` | fun | highest total matches or highest daily matches | frequent | `{name} đã đánh {total} trận, nhiều nhất sân, đúng chất máy cày không biết mệt.` |
| 48 | `missing_player` | fun | absent >= 7 days | frequent | `{name} đã vắng {days} ngày chưa ra sân, anh em bắt đầu nghi ngờ quy ẩn giang hồ.` |
| 49 | `mercenary` | fun | low total, win rate >= 80% | uncommon | `{name} mới đánh {total} trận nhưng thắng {wins} trận, đạt {rate}%, lính đánh thuê mẫu mỏng mà bén.` |
| 50 | `alternating_form` | fun | frequent W/L alternation | uncommon | `Form gần đây của {name} nhảy {pattern} liên tục, đúng kiểu máy test vợt.` |
| 51 | `fine_sponsor` | fun | highest loss money / many losses | frequent | `{name} đang gánh {losses} trận thua và đóng {money} tiền quỹ, nhà tài trợ vàng gọi tên.` |
| 52 | `experience_seeker` | fun | high total, low win rate | frequent | `{name} đánh {total} trận nhưng mới thắng {wins} trận, tinh thần cọ xát thì khỏi bàn.` |

## Implementation Phases

### Phase A: Data Integrity

- Fix `partnerForPlayer` and `opponentIdsForPlayer` so they return data only
  when the player is actually in the match.
- Add a local verification helper or test for:
  - player total from edges never exceeds real player total.
  - pair/opponent records match direct counting from `matches`.
  - no insight can mention a pair with zero real shared/opponent matches.

Status:

- Done. `analysis-core.ts` now guards partner/opponent lookup with real
  match participation.
- Done. `verifyAnalysisSnapshot()` checks edge totals against direct match
  counting.
- Checked against `pickleball_backup_2026-05-12.json`:
  - snapshot verify errors: `0`.
  - Trần Ngọc Hà total: `15` matches.
  - Hà vs Văn: `0W-6L · 0% · 6 trận`.
  - Hà + Hiếu: no partner edge.
  - Khánh + Chung: `0W-3L · 0% · 3 trận`, below the 4-match insight threshold.

### Phase B: Core Metrics

Extend `analysis-core.ts` only where data is missing:

- recent ELO trend.
- rank trend.
- highest/lowest rank and current rank.
- close wins/losses.
- average win diff and average loss diff.
- low-score losses.
- partner/opponent expected-result delta in user-facing units.
- partner frequency and opponent frequency.
- money/fine totals.

Status:

- Done for first-pass needs. `analysis-core.ts` now exposes:
  - recent ELO delta.
  - average winning gap and losing gap.
  - low-score loss count.
  - wins/losses against higher-ELO teams.
  - wins against lower-ELO teams.
  - partner/opponent expected-result delta in point units.
- Rank trend is approximated from recent ELO-rank movement for the first pass.
  A true historical leaderboard-rank trend can be added later if needed.

### Phase C: 50+ Rule Registry

- Rewrite `insights.ts` around the scenario list above.
- First implementation uses exactly one sentence per scenario.
- Each rule must attach its `evidence` object for debugging and future UI.
- Each rule must define frequency metadata and anti-spam grouping.

Status:

- Done. `insights.ts` now implements the 52 planned scenario types with one
  sentence each.
- Done. Each candidate carries rarity/frequency/appearance-rate weighting.
- Done. User-facing sentences avoid `baseline`, raw `impact`, prediction
  "machine" wording, and `deuce`; long games are described as `kéo qua 11 điểm`.
- Debug helper `generateInsightCandidatesForDebug()` is available for local
  snapshot inspection.
- Backup check generated 140 candidates across 44 triggered scenario types.
  The remaining planned types are implemented but did not trigger with the
  current backup data.

### Phase D: Verification

Using the latest admin backup data:

- Print player totals and W/L.
- Print top partner/opponent edges after the integrity fix.
- Print all generated insight candidates with:
  - type
  - participants
  - evidence
  - final sentence
- Confirm known sanity checks:
  - Trần Ngọc Hà total remains 15 in the current backup.
  - Hà vs Văn cannot show more matches than Hà's real total.
  - Hà + Hiếu must not appear unless they have real shared matches.
  - Khánh + Chung must not trigger pair insight below the 4-match threshold.

Status:

- Done with `pickleball_backup_2026-05-12.json`.
- Snapshot verify errors: `0`.
- Implemented scenario types in `insights.ts`: `52`.
- Generated candidates: `140` candidates across `44` triggered scenario types.
- Selected Hub insights: `8`.
- User-facing generated text scan found no `baseline`, raw `impact`,
  `performance score`, `deuce`, or prediction-machine wording.
- Targeted checks passed:
  - `npx tsc --noEmit --pretty false`
  - `npx eslint src/lib/analysis-core.ts src/lib/insights.ts`
  - targeted `git diff --check` for changed analysis/docs files.
- Full `git diff --check` still reports pre-existing trailing whitespace in
  `src/components/SettingsModal.tsx`, which is unrelated local work and was not
  modified in this pass.

### Phase E: Later Copy Expansion

After logic is trusted, expand each scenario from 1 sentence to 4-5 deterministic
variants. Do not expand copy before the data layer is verified.

Status:

- Not started. Keep this for the next copy pass after reviewing the one-sentence
  feed on Vercel Preview.
- Follow-up UI wording pass completed before this expansion:
  - Profile and Network UI no longer show user-facing `Baseline` or
    `điểm hiệu suất`.
  - Network cards now show `cao/thấp hơn kỳ vọng từ ELO X điểm` and sample size
    instead of raw internal baseline/actual values.
  - Targeted checks passed:
    - `npx tsc --noEmit --pretty false`
    - `npx eslint src/components/analysis/AnalysisCenter.tsx src/lib/analysis-core.ts src/lib/insights.ts`
