# Analysis Insights 52 Rule Plan

This is the active source of truth for `/analysis` Hub insights. Keep this file
aligned with `src/lib/insights.ts` before changing trigger logic, frequency, or
copy.

## Current Scope

- Implemented rule types: 52/52.
- Current copy scope: 1 sentence per rule.
- Next planned work: review all 52 triggers, frequency weights, and wording on
  Vercel Preview before expanding each rule to 4-5 deterministic text variants.
- Archived architecture plan: `docs/ANALYSIS_INSIGHTS_REWRITE_PLAN.md`.

## User-Facing Wording Rules

- Every insight sentence should include evidence naturally: record, sample size,
  win rate, score gap, streak length, ELO expectation gap, money, or days absent.
- Do not show raw engineering wording to users:
  - Avoid `baseline`, `impact`, `performance score`, `deuce`, or prediction
    "machine" wording.
  - Use `tỷ lệ thắng dự tính`, `kỳ vọng từ ELO`, `cao hơn kỳ vọng từ ELO X điểm`,
    `thấp hơn kỳ vọng từ ELO X điểm`, and `kéo qua 11 điểm`.
- Sports idioms such as `máy cày` or `máy test vợt` are allowed because they do
  not refer to the prediction system.
- Strong teasing words such as `out trình`, `đóng hòm`, `át vía`, `báo thủ`, or
  `gánh tạ` require enough sample size and matching evidence.

## Selection Terms

- `frequency` is the rule's expected natural availability:
  - `always`: almost always has a candidate, for example top ELO or rank leader.
  - `frequent`: appears often with normal data, so it should not dominate the feed.
  - `occasional`: appears sometimes when a real pattern exists.
  - `rare`: unusual event; should be easier to surface when it occurs.
- `appearanceRate` is a multiplier after scoring. It is used to dampen rules
  that are always available. Example: `appearanceRate = 0.35` means the final
  score is only 35% of its raw score, so always-on facts do not crowd out rare
  stories.
- Final score shape in code:
  `selectionScore = (baseWeight + rarityBonus + evidenceStrength + surpriseScore - frequencyPenalty) * appearanceRate`.

Selection rules:

- Return about 6-8 insights.
- A player can appear at most twice.
- A player can appear at most once in the same semantic group.
- A global scenario type appears at most once.

## Future Phase: Expected Probability V2

Do not change expected probability while reviewing the current 52 insight
scenarios. The current expected value is intentionally ELO-only: average ELO of
the two-player team versus average ELO of the opposing two-player team.

After all 52 scenarios are reviewed and expanded to 4-5 sentence variants, add a
separate design/implementation phase for expected probability v2:

- Keep true win rate as `wins / total`; do not call expected probability
  "win rate" in user-facing text.
- Keep the ELO-only probability as the stable baseline.
- Add small, clamped adjustments for pair chemistry, opponent matchup history,
  and recent form.
- Require sample-size thresholds before pair or opponent adjustments can affect
  the probability, so a 1-2 match sample cannot swing the result.
- Because matches have no draw, if one team has an expected probability of 30%,
  the other team is 70%.
- Re-check every insight that uses expectation gaps after this phase, especially
  upset wins/losses, partner impact, opponent impact, and "above/below ELO
  expectation" wording.

## Trigger Table: Current Code Truth

This table reflects the current implementation in `src/lib/insights.ts`.
The sentence column is copied from the actual code template. If code changes,
update this table in the same unit of work.

| # | Type | Trigger currently in code | Freq / rate | Current sentence in code | Notes for review |
|---:|---|---|---|---|---|
| 1 | `hot_streak` | `streakType === W` and `streakCount >= 4` | occasional / 1 | `${metric.name} đang thắng liền ${metric.streakCount} trận, phong độ này lên sân là đối thủ phải chuẩn bị thở oxy.` | Good. |
| 2 | `cold_streak` | `streakType === L` and `streakCount >= 4` | occasional / 1 | `${metric.name} đang đỏ ${metric.streakCount} trận liên tiếp, có vẻ cần một kèo giải hạn thật sự.` | Good. |
| 3 | `elo_king` | Top ELO player with `total >= 8` | always / 0.35 | `${topElo.name} đang giữ nóc ELO với ${topElo.rating} điểm, hơn người bám sau ${Math.max(0, gap)} điểm.` | ELO gap changes rarity/weight, not trigger. |
| 4 | `giant_killer` | `upsetWins > 0`; each upset win means expected probability below 30% | rare / 1 | `${metric.name} có ${metric.upsetWins} lần thắng cửa dưới khi tỷ lệ thắng dự tính trước trận chỉ dưới 30%, đúng kiểu kèo khó vẫn lật được.` | One upset is enough. |
| 5 | `earthquake_victim` | `upsetLosses > 0`; each upset loss means expected probability above 70% | rare / 1 | `${metric.name} có ${metric.upsetLosses} lần tỷ lệ thắng dự tính trước trận lên tới trên 70% mà vẫn rơi kèo, kèo trên cũng có ngày sập hầm.` | One upset loss is enough. |
| 6 | `perfect_form5` | `total >= 5` and `formScore === 100` | occasional / 1 | `${metric.name} đang thắng 5/5 trận gần nhất, bảng phong độ xanh kín nhìn khá cháy.` | Means latest 5 matches are all wins. |
| 7 | `zero_form5` | `total >= 5` and `formScore === 0` | occasional / 1 | `${metric.name} đang thua 0/5 trận gần nhất, đoạn này đúng là hơi sập hầm.` | Means latest 5 matches are all losses. |
| 8 | `gatekeeper` | `total >= 20` and `abs(rating - 1000) <= 20` | frequent / 0.55 | `${metric.name} đã đánh ${metric.total} trận mà ELO vẫn quanh ${metric.rating}, lên xuống mãi vẫn giữ đúng một vùng quen thuộc.` | Good. |
| 9 | `most_improved` | `recentEloDelta >= 30` | rare / 1 | `${metric.name} đang tăng ${round(metric.recentEloDelta)} điểm ELO trong giai đoạn gần đây, dấu hiệu lên tay khá rõ.` | Uses recent ELO delta, not long-season trend. |
| 10 | `free_fall` | `recentEloDelta <= -30` | rare / 1 | `${metric.name} đang rơi ${absRound(metric.recentEloDelta)} điểm ELO gần đây, cần thắng vài kèo để kéo lại vía.` | Uses recent ELO delta, not long-season trend. |
| 11 | `streak_breaker` | Best global event where a player beats someone who had a win streak `>= 4` before that match | rare / 1 | `${player.name} vừa cắt chuỗi ${breaker.streak} trận thắng của ${target.name}, một pha gạt giò khá đau.` | Only strongest current candidate is emitted. |
| 12 | `revenge_win` | Best global opponent row with `meetings >= 4`, prior consecutive losses `>= 3`, and at least 1 recent win in latest 4 meetings | rare / 1 | `${player.name} cuối cùng cũng giải được ${opponent.name} sau ${revenge.priorLosses} lần thua trước đó, kèo phục hận đã lên sóng.` | Only strongest current candidate is emitted. |
| 13 | `rank_leader` | Current leaderboard #1 by win rate, then wins, then fewer losses; requires `total >= 8` | always / 0.25 | `${topRank.name} đang đứng đầu bảng xếp hạng với ${topRank.wins}/${topRank.total} trận thắng, tỷ lệ ${round(topRank.winRate)}%.` | This is not ELO rank. |
| 14 | `rank_climber` | ELO rank improved by `>= 2` places versus approximated old ELO rank, and latest 5 has at least 3 wins | rare / 1 | `${metric.name} đang leo ${places} bậc trên bảng ELO gần đây, 5 trận mới nhất thắng ${recentWins}/5 nên nhìn khá có lực.` | Not true historical leaderboard rank yet. |
| 15 | `perfect_duo` | Canonical partner pair edge `total >= 4` and `rate >= 75` | occasional / 1 | `${edge.playerName} và ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận chung, đạt ${edgeRate(edge)}%, đúng chất cặp bài trùng.` | Pair-level rule: A-B and B-A are deduped before candidates are created. |
| 16 | `bad_duo` | Canonical partner pair edge `total >= 4` and `rate <= 25` | occasional / 1 | `${edge.playerName} đi với ${edge.otherName} mới thắng ${edge.wins}/${edge.total} trận, tỷ lệ ${edgeRate(edge)}%, dữ liệu đang báo hơi dẫm chân nhau.` | Pair-level rule: A-B and B-A are deduped before candidates are created. |
| 17 | `partner_boost` | Partner edge `total >= 4`, `impact >= 15`, and `rate >= 50` | rare / 1 | `${edge.playerName} cặp với ${edge.otherName} thắng ${edge.wins}/${edge.total} trận và cao hơn mức dự tính từ ELO trước trận ${edge.impact} điểm.` | User text phrases impact as ELO expectation gap. |
| 18 | `partner_drag` | Partner edge `total >= 4`, `impact <= -15`, and `rate <= 40` | rare / 1 | `${edge.playerName} đứng cùng ${edge.otherName} chỉ thắng ${edge.wins}/${edge.total} trận, lại thấp hơn mức dự tính từ ELO trước trận ${absRound(edge.impact)} điểm.` | User text phrases impact as ELO expectation gap. |
| 19 | `cover_master` | Player `total >= 8`, `attackScore <= 85`, `synergyScore >= 60`, and at least 2 partner edges with `total >= 4` | rare / 1 | `${metric.name} ghi điểm không quá ồn ào nhưng các kèo đánh chung vẫn thắng trung bình ${round(metric.synergyScore)}% số trận.` | Review thresholds; attack cutoff may be too loose. |
| 20 | `carry_partner` | Partner edge `total >= 4`, edge win rate is at least 18 points above that player's overall win rate, and edge `rate >= 55` | rare / 1 | `${edge.playerName} đi với ${edge.otherName} thắng ${edge.wins}/${edge.total} trận, kéo tỷ lệ từ mức thường thấy ${round(playerMetric.winRate)}% lên ${edgeRate(edge)}%.` | Measures named player's lift, not reverse partner lift. |
| 21 | `heavy_backpack` | Partner edge `total >= 4`, edge win rate is at least 18 points below that player's overall win rate, and edge `rate <= 45` | rare / 1 | `${edge.playerName} đi với ${edge.otherName} tụt từ mức thắng thường thấy ${round(playerMetric.winRate)}% xuống còn ${edgeRate(edge)}%, kèo này hơi nặng vai.` | Measures named player's drop, not reverse partner drop. |
| 22 | `stable_partner` | Canonical partner pair edge `total >= 6`, `50 <= rate <= 65`, and both directed impacts have `abs(impact) <= 5` | frequent / 0.55 | `${edge.playerName} và ${edge.otherName} đánh chung ${edge.total} trận, thắng ${edge.wins} trận, không bùng nổ nhưng khá tròn vai.` | Pair-level rule; requires both sides to be near ELO expectation. |
| 23 | `glued_pair` | Most frequent canonical partner pair with `total >= 8` | frequent / 0.45 | `${glued.playerName} và ${glued.otherName} đã đánh chung ${glued.total} trận, tần suất dính nhau nhiều nhất sân.` | Pair-level rule: A-B and B-A are deduped before picking the most frequent pair. |
| 24 | `rare_pair_hot` | Canonical partner pair edge `total` between 4 and 5, and `rate >= 80` | rare / 1 | `${edge.playerName} và ${edge.otherName} mới đánh ${edge.total} trận nhưng thắng ${edge.wins}/${edge.total}, mẫu còn mỏng mà nhìn khá thơm.` | Because partner candidates are prefiltered at `total >= 4`. |
| 25 | `disaster_duo` | Canonical partner pair edge `total >= 4`, `rate <= 35`, and `avgDiff <= -3` | rare / 1 | `${edge.playerName} và ${edge.otherName} thua ${edge.losses}/${edge.total} trận chung, trung bình mỗi trận âm ${oneDecimal(Math.abs(edge.avgDiff))} điểm, cần đổi bài gấp.` | Pair-level rule: A-B and B-A are deduped before candidates are created. |
| 26 | `partner_long_games` | Canonical partner pair edge `total >= 4` and `deuceGames >= 3` | occasional / 1 | `${edge.playerName} và ${edge.otherName} đánh chung mà đã có ${edge.deuceGames} trận kéo qua 11 điểm, cặp này thích cò cưa thật.` | Pair-level rule; user-facing text says `kéo qua 11 điểm`. |
| 27 | `top_attack` | Highest `avgPointsFor` among players with `total >= 8`, and `avgPointsFor >= 9` | frequent / 0.55 | `${metric.name} đang ghi trung bình ${oneDecimal(metric.avgPointsFor)} điểm/trận, cao nhất sân ở khoản dập bóng.` | Plan wording should say avg points, not attackScore. |
| 28 | `defense_wall` | `total >= 8` and `avgConceded <= 5` | occasional / 1 | `${metric.name} chỉ mất trung bình ${oneDecimal(metric.avgConceded)} điểm/trận, phòng thủ kiểu này đối thủ rất khó đóng điểm.` | Good. |
| 29 | `dominant_closer` | `dominantWins >= 4` and `winRate >= 45` | occasional / 1 | `${metric.name} có ${metric.dominantWins} trận thắng cách biệt từ 7 điểm trở lên, vào tay là đóng hòm khá nhanh.` | Extra win-rate guard prevents weak records from sounding dominant. |
| 30 | `close_loss` | `closeLosses >= 3` | occasional / 1 | `${metric.name} đã thua sát nút ${metric.closeLosses} trận chỉ 1-2 điểm, đúng kiểu thánh nhọ sân bãi.` | Close loss means losing by 1-2 points. |
| 31 | `long_game_addict` | `deuceMatches >= 3` | occasional / 1 | `${metric.name} đã góp mặt trong ${metric.deuceMatches} trận kéo qua 11 điểm, đam mê cò cưa hơi rõ.` | User-facing text says `kéo qua 11 điểm`. |
| 32 | `bagel_loss` | `bagelLosses > 0`; bagel loss means losing team scored `<= 2` | occasional / 1 | `${metric.name} có ${metric.bagelLosses} trận thua mà team chỉ ghi tối đa 2 điểm, đoạn này hơi sập nguồn.` | One occurrence is enough. |
| 33 | `clutch_master` | `closeWins >= 3` | occasional / 1 | `${metric.name} thắng sát nút ${metric.closeWins} trận, càng cuối kèo càng lì.` | Close win means winning by 1-2 points. |
| 34 | `late_collapse` | `closeLosses >= 4` and `closeLosses >= closeWins + 2` | occasional / 1 | `${metric.name} thua sát nút ${metric.closeLosses} trận, nhiều kèo chỉ thiếu một nhịp là lật được.` | Good. |
| 35 | `score_bully` | `wins >= 5` and `avgWinDiff >= 5` | occasional / 1 | `Mỗi khi thắng, ${metric.name} thường thắng trung bình ${oneDecimal(metric.avgWinDiff)} điểm, không thích dây dưa.` | Good. |
| 36 | `low_score_magnet` | `lowScoreLosses >= 3`; low-score loss means losing team scored `<= 4` | occasional / 1 | `${metric.name} góp mặt trong ${metric.lowScoreLosses} trận team thua mà chỉ ghi tối đa 4 điểm, đúng kiểu cột thu lôi hôm xấu trời.` | Good. |
| 37 | `hard_counter` | Opponent edge `total >= 4` and `rate === 100` | rare / 1 | `${edge.playerName} gặp ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận, tỷ lệ ${edgeRate(edge)}%, kèo này nhìn khá khắc tinh.` | Directed edge from player perspective. |
| 38 | `target_dummy` | Opponent edge `total >= 4` and `rate === 0` | rare / 1 | `${edge.playerName} gặp ${edge.otherName} đang thua ${edge.losses}/${edge.total} trận, cứ đối đầu là hơi bị át vía.` | Directed edge from player perspective. |
| 39 | `balanced_rivalry` | Most frequent repeated opponent edge with `total >= 6` and `40 <= rate <= 60` | frequent / 0.55 | `${mostRepeated.playerName} và ${mostRepeated.otherName} đã gặp ${mostRepeated.total} trận với tỷ số ${mostRepeated.wins}-${mostRepeated.losses}, đúng kèo kỳ phùng địch thủ.` | Only strongest current candidate is emitted. |
| 40 | `long_game_rivalry` | Opponent edge `total >= 4` and `deuceGames >= 3` | occasional / 1 | `${edge.playerName} gặp ${edge.otherName} có ${edge.deuceGames}/${edge.total} trận kéo qua 11 điểm, cứ chạm nhau là dây dưa.` | User-facing text says `kéo qua 11 điểm`. |
| 41 | `boss_hunter` | `winsVsHigherElo >= 3` | rare / 1 | `${metric.name} có ${metric.winsVsHigherElo} lần thắng team có ELO trung bình cao hơn, thợ săn trùm hơi uy tín.` | Uses wins against higher-ELO teams, not expected probability. |
| 42 | `mental_block` | Opponent edge `total >= 4`, `impact <= -15`, and `rate <= 45` | rare / 1 | `${edge.playerName} gặp ${edge.otherName} thì thấp hơn mức dự tính từ ELO trước trận ${absRound(edge.impact)} điểm, dấu hiệu khớp kèo khá rõ.` | User text phrases impact as ELO expectation gap. |
| 43 | `sweet_matchup` | Opponent edge `total >= 4`, `impact >= 15`, and `rate >= 55` | rare / 1 | `${edge.playerName} gặp ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận và cao hơn mức dự tính từ ELO trước trận ${edge.impact} điểm, kèo này khá thơm.` | User text phrases impact as ELO expectation gap. |
| 44 | `bully_lower_elo` | `totalVsLowerElo >= 8` and win rate vs lower-ELO teams `>= 70` | occasional / 1 | `${metric.name} thắng ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận trước nhóm ELO thấp hơn, farm kèo mềm khá đều tay.` | Review tone: `farm kèo mềm` may be too harsh if schedule is unavoidable. |
| 45 | `victim_strong_elo` | `totalVsHigherElo >= 6` and loss rate vs higher-ELO teams `>= 65` | occasional / 1 | `${metric.name} gặp nhóm ELO cao hơn đang thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận, lịch đấu này không dễ thở.` | Good. |
| 46 | `revenge_target` | Same source row as `revenge_win`: prior consecutive losses `>= 3`, then at least 1 win in latest 4 meetings | rare / 1 | `Gần đây ${player.name} gặp ${opponent.name} thắng ${revenge.recentWins}/${revenge.recentTotal} trận sau giai đoạn bị đì, có mùi lật kèo.` | Only strongest current candidate is emitted. |
| 47 | `iron_lung` | Top activity player by total matches, then daily max; requires `total >= 20` | frequent / 0.45 | `${metric.name} đã đánh ${metric.total} trận, nhiều nhất sân, đúng chất máy cày không biết mệt.` | Good. |
| 48 | `missing_player` | `daysAbsent !== null` and `daysAbsent >= 7` | frequent / 0.55 | `${metric.name} đã vắng ${metric.daysAbsent} ngày chưa ra sân, anh em bắt đầu nghi ngờ quy ẩn giang hồ.` | Can appear often if many inactive players. |
| 49 | `mercenary` | `0 < total <= 5` and `winRate >= 80` | occasional / 1 | `${metric.name} mới đánh ${metric.total} trận nhưng thắng ${metric.wins} trận, đạt ${round(metric.winRate)}%, lính đánh thuê mẫu mỏng mà bén.` | Good. |
| 50 | `alternating_form` | `alternations >= 5` in latest result pattern | occasional / 1 | `Phong độ gần đây của ${metric.name} nhảy ${pattern(metric.recentResults)} liên tục, đúng kiểu máy test vợt.` | Good. |
| 51 | `fine_sponsor` | Top money/fine player, with `money > 0` | frequent / 0.45 | `${topFine.name} đang gánh ${topFine.losses} trận thua và đóng ${topFine.money.toLocaleString('vi-VN')}đ tiền quỹ, nhà tài trợ vàng gọi tên.` | Always picks only the top fine payer. |
| 52 | `experience_seeker` | `total >= 20` and `winRate <= 40` | frequent / 0.45 | `${metric.name} đánh ${metric.total} trận nhưng mới thắng ${metric.wins} trận, tinh thần cọ xát thì khỏi bàn.` | Good. |

## Known Implementation Notes To Review Next

- `rank_climber` is not true historical leaderboard rank yet; it uses ELO-rank
  movement approximated from recent ELO delta.
- `carry_partner` and `heavy_backpack` currently measure the named player's
  record change when paired with another player. If we want "A makes B better",
  this should be reworked to compare the other player's performance with A.
- `streak_breaker`, `revenge_win`, `revenge_target`, and `balanced_rivalry` emit
  only the strongest global candidate, not all qualifying candidates.
- `top_attack` uses average points scored per match, not `attackScore`.
- Several rules use internal `impact` fields in code, but all user-facing copy
  must phrase them as ELO expectation gaps.
- Decision: update `perfect_form5` and `zero_form5` copy to say
  "thắng/thua 5 trận gần nhất" instead of "thắng/thua 5/5" or "thua 0/5".

## Pending Copy Changes (not yet in code)

| Rule | Type | Current copy | New copy | Notes |
|---:|---|---|---|---|
| 5 | `earthquake_victim` | `...sập hầm.` | Remove "sập hầm", keep sentence neutral | |
| 6 | `perfect_form5` | `thắng 5/5 trận gần nhất` | `thắng 5 trận liên tiếp` | |
| 7 | `zero_form5` | `thua 0/5 trận gần nhất, đoạn này đúng là hơi sập hầm.` | `thua 5 trận liên tiếp.` | Remove fraction notation + "sập hầm" |
| 32 | `bagel_loss` | `...hơi sập nguồn.` | Remove "sập nguồn", keep factual | |

## Pending Copy Changes (not yet in code)

| Rule | Type | Current copy | New copy | Notes |
|---:|---|---|---|---|
| 5 | `earthquake_victim` | `...sập hầm.` | Remove "sập hầm", keep sentence neutral | |
| 6 | `perfect_form5` | `thắng 5/5 trận gần nhất` | `thắng 5 trận liên tiếp` | |
| 7 | `zero_form5` | `thua 0/5 trận gần nhất, đoạn này đúng là hơi sập hầm.` | `thua 5 trận liên tiếp.` | Remove fraction notation + "sập hầm" |
| 32 | `bagel_loss` | `...hơi sập nguồn.` | Remove "sập nguồn", keep factual | |

## Completed Verification

- Implemented scenario types in `src/lib/insights.ts`: 52.
- Plan scenario types: 52.
- Missing in code: none.
- Extra in code: none.
- Latest backup check generated 140 candidates across 44 triggered scenario
  types; the remaining types were implemented but did not trigger on that data.
- Current known sanity checks:
  - Trần Ngọc Hà total remains 15 in the current backup.
  - Hà vs Văn is `0W-6L`, not an impossible count above Hà's total.
  - Hà + Hiếu does not appear without real shared matches.
  - Khánh + Chung is `0W-3L`, below the 4-match partner insight threshold.

## Next Review Step

Review all 52 rows above with real dev data and tune:

- trigger thresholds,
- `frequency` and `appearanceRate`,
- tone strength,
- whether a rule should be global-only or allow multiple candidates,
- whether each sentence has enough evidence to justify its claim.

Only after that review should Phase E start: expanding each rule from 1 sentence
to 4-5 deterministic variants.
