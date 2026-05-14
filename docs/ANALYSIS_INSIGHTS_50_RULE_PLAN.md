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

## Selection Model

Each candidate in code has:

- `type`
- `group`: `form`, `rank`, `elo`, `partner`, `opponent`, `score`, `fun`
- `rarity`: `common`, `uncommon`, `rare`, `epic`
- `frequency`: `always`, `frequent`, `occasional`, `rare`
- `appearanceRate`
- `baseWeight`
- `evidenceStrength`
- `surpriseScore`

Selection rules:

- Return about 6-8 insights.
- A player can appear at most twice.
- A player can appear at most once in the same semantic group.
- A global scenario type appears at most once.
- Score shape in code:
  `selectionScore = (baseWeight + rarityBonus + evidenceStrength + surpriseScore - frequencyPenalty) * appearanceRate`.

## Trigger Table: Current Code Truth

This table reflects the current implementation in `src/lib/insights.ts`.
If code changes, update this table in the same unit of work.

| # | Type | Group | Trigger currently in code | Frequency / rate | Notes for review |
|---:|---|---|---|---|---|
| 1 | `hot_streak` | form | `streakType === W` and `streakCount >= 4` | occasional / 1 | Good. |
| 2 | `cold_streak` | form | `streakType === L` and `streakCount >= 4` | occasional / 1 | Good. |
| 3 | `elo_king` | elo | Top ELO player with `total >= 8` | always / 0.35 | ELO gap changes rarity/weight, not trigger. |
| 4 | `giant_killer` | elo | `upsetWins > 0`; each upset win means expected win rate below 30% | rare / 1 | Good, but one upset is enough. |
| 5 | `earthquake_victim` | elo | `upsetLosses > 0`; each upset loss means expected win rate above 70% | rare / 1 | Good, but one upset loss is enough. |
| 6 | `perfect_form5` | form | `total >= 5` and `formScore === 100` | occasional / 1 | Means latest 5 matches are all wins. |
| 7 | `zero_form5` | form | `total >= 5` and `formScore === 0` | occasional / 1 | Means latest 5 matches are all losses. |
| 8 | `gatekeeper` | elo | `total >= 20` and `abs(rating - 1000) <= 20` | frequent / 0.55 | Good. |
| 9 | `most_improved` | elo | `recentEloDelta >= 30` | rare / 1 | Uses recent ELO delta from the latest window, not long-season trend. |
| 10 | `free_fall` | elo | `recentEloDelta <= -30` | rare / 1 | Uses recent ELO delta from the latest window, not long-season trend. |
| 11 | `streak_breaker` | form | Best global event where a player beats someone who had a win streak `>= 4` before that match | rare / 1 | Only the strongest current candidate is emitted. |
| 12 | `revenge_win` | opponent | Best global opponent row with `meetings >= 4`, prior consecutive losses `>= 3`, and at least 1 recent win in latest 4 meetings | rare / 1 | Only the strongest current candidate is emitted. |
| 13 | `rank_leader` | rank | Current leaderboard #1 by win rate, then wins, then fewer losses; requires `total >= 8` | always / 0.25 | This is not ELO rank. |
| 14 | `rank_climber` | rank | ELO rank improved by `>= 2` places versus approximated old ELO rank, and latest 5 has at least 3 wins | rare / 1 | Not true historical leaderboard rank yet. Rename or improve later if needed. |
| 15 | `perfect_duo` | partner | Partner edge `total >= 4` and `rate >= 75` | occasional / 1 | Directed edge from the selected player perspective. |
| 16 | `bad_duo` | partner | Partner edge `total >= 4` and `rate <= 25` | occasional / 1 | Directed edge from the selected player perspective. |
| 17 | `partner_boost` | partner | Partner edge `total >= 4`, `impact >= 15`, and `rate >= 50` | rare / 1 | User text phrases impact as ELO expectation gap. |
| 18 | `partner_drag` | partner | Partner edge `total >= 4`, `impact <= -15`, and `rate <= 40` | rare / 1 | User text phrases impact as ELO expectation gap. |
| 19 | `cover_master` | partner | Player `total >= 8`, `attackScore <= 85`, `synergyScore >= 60`, and at least 2 partner edges with `total >= 4` | rare / 1 | Review thresholds; attack cutoff may be too loose. |
| 20 | `carry_partner` | partner | Partner edge `total >= 4`, edge win rate is at least 18 points above that player's overall win rate, and edge `rate >= 55` | rare / 1 | Despite name, this currently measures the named player's lift with that partner, not the reverse partner's lift. |
| 21 | `heavy_backpack` | partner | Partner edge `total >= 4`, edge win rate is at least 18 points below that player's overall win rate, and edge `rate <= 45` | rare / 1 | Same direction note as `carry_partner`. |
| 22 | `stable_partner` | partner | Partner edge `total >= 6`, `50 <= rate <= 65`, and `abs(impact) <= 5` | frequent / 0.55 | Good. |
| 23 | `glued_pair` | partner | Most frequent directional partner edge with `total >= 8` | frequent / 0.45 | Directional edge can choose one side of a pair. |
| 24 | `rare_pair_hot` | partner | Partner edge `total` between 4 and 5, and `rate >= 80` | rare / 1 | Because partner candidates are prefiltered at `total >= 4`. |
| 25 | `disaster_duo` | partner | Partner edge `total >= 4`, `rate <= 35`, and `avgDiff <= -3` | rare / 1 | Good. |
| 26 | `partner_long_games` | partner | Partner edge `total >= 4` and `deuceGames >= 3` | occasional / 1 | User-facing text says `kéo qua 11 điểm`. |
| 27 | `top_attack` | score | Highest `avgPointsFor` among players with `total >= 8`, and `avgPointsFor >= 9` | frequent / 0.55 | Plan wording should say avg points, not attackScore. |
| 28 | `defense_wall` | score | `total >= 8` and `avgConceded <= 5` | occasional / 1 | Good. |
| 29 | `dominant_closer` | score | `dominantWins >= 4` and `winRate >= 45` | occasional / 1 | Extra win-rate guard prevents weak overall records from sounding dominant. |
| 30 | `close_loss` | score | `closeLosses >= 3` | occasional / 1 | Close loss means losing by 1-2 points. |
| 31 | `long_game_addict` | score | `deuceMatches >= 3` | occasional / 1 | User-facing text says `kéo qua 11 điểm`. |
| 32 | `bagel_loss` | score | `bagelLosses > 0`; bagel loss means losing team scored `<= 2` | occasional / 1 | One occurrence is enough. |
| 33 | `clutch_master` | score | `closeWins >= 3` | occasional / 1 | Close win means winning by 1-2 points. |
| 34 | `late_collapse` | score | `closeLosses >= 4` and `closeLosses >= closeWins + 2` | occasional / 1 | Good. |
| 35 | `score_bully` | score | `wins >= 5` and `avgWinDiff >= 5` | occasional / 1 | Good. |
| 36 | `low_score_magnet` | score | `lowScoreLosses >= 3`; low-score loss means losing team scored `<= 4` | occasional / 1 | Plan wording should mention the `<= 4` threshold. |
| 37 | `hard_counter` | opponent | Opponent edge `total >= 4` and `rate === 100` | rare / 1 | Directed edge from the selected player perspective. |
| 38 | `target_dummy` | opponent | Opponent edge `total >= 4` and `rate === 0` | rare / 1 | Directed edge from the selected player perspective. |
| 39 | `balanced_rivalry` | opponent | Most frequent repeated opponent edge with `total >= 6` and `40 <= rate <= 60` | frequent / 0.55 | Only the strongest current candidate is emitted. |
| 40 | `long_game_rivalry` | opponent | Opponent edge `total >= 4` and `deuceGames >= 3` | occasional / 1 | User-facing text says `kéo qua 11 điểm`. |
| 41 | `boss_hunter` | opponent | `winsVsHigherElo >= 3` | rare / 1 | Uses wins against higher-ELO teams, not expected win rate. |
| 42 | `mental_block` | opponent | Opponent edge `total >= 4`, `impact <= -15`, and `rate <= 45` | rare / 1 | User text phrases impact as ELO expectation gap. |
| 43 | `sweet_matchup` | opponent | Opponent edge `total >= 4`, `impact >= 15`, and `rate >= 55` | rare / 1 | User text phrases impact as ELO expectation gap. |
| 44 | `bully_lower_elo` | opponent | `totalVsLowerElo >= 8` and win rate vs lower-ELO teams `>= 70` | occasional / 1 | Review tone: `farm kèo mềm` may be too harsh if schedule is unavoidable. |
| 45 | `victim_strong_elo` | opponent | `totalVsHigherElo >= 6` and loss rate vs higher-ELO teams `>= 65` | occasional / 1 | Good. |
| 46 | `revenge_target` | opponent | Same source row as `revenge_win`: prior consecutive losses `>= 3`, then at least 1 win in latest 4 meetings | rare / 1 | Only the strongest current candidate is emitted. |
| 47 | `iron_lung` | fun | Top activity player by total matches, then daily max; requires `total >= 20` | frequent / 0.45 | Good. |
| 48 | `missing_player` | fun | `daysAbsent !== null` and `daysAbsent >= 7` | frequent / 0.55 | Good, but can appear often if many inactive players. |
| 49 | `mercenary` | fun | `0 < total <= 5` and `winRate >= 80` | occasional / 1 | Frequency in old plan said uncommon; code uses occasional. |
| 50 | `alternating_form` | fun | `alternations >= 5` in latest result pattern | occasional / 1 | Frequency in old plan said uncommon; code uses occasional. |
| 51 | `fine_sponsor` | fun | Top money/fine player, with `money > 0` | frequent / 0.45 | Always picks only the top fine payer. |
| 52 | `experience_seeker` | fun | `total >= 20` and `winRate <= 40` | frequent / 0.45 | Good. |

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
