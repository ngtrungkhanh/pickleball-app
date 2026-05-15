# Analysis Insights Selection

This file records the data-backed audit method and the agreed implementation
plan for `/analysis` Hub insight selection. Use it before changing insight
weights, groups, appearance rates, cooldown/pity behavior, or selection rules.

## How To Re-run

Use the committed audit script whenever a new JSON backup is available:

```bash
npm run audit:insights -- pickleball_backup_2026-05-14.json
```

Useful options:

```bash
npm run audit:insights -- path/to/backup.json --seeds 2000
npm run audit:insights -- path/to/backup.json --out docs/latest-insight-audit.md
npm run audit:insights -- path/to/backup.json --json
npm run audit:insights -- path/to/backup.json --strategy baseline
npm run audit:insights -- path/to/backup.json --strategy balanced-v1
npm run audit:insights -- path/to/backup.json --strategy balanced-v1.1
```

Script details:

- File: `scripts/audit-insight-selection.mjs`
- The script compiles `src/lib/analysis-core.ts`, `src/lib/insights.ts`, and
  `src/lib/guest.ts` to a temporary OS directory, then runs the real production
  insight engine.
- It parses the current implemented rule types from
  `docs/ANALYSIS_INSIGHTS_RULES.md`, stopping before the future expansion
  roadmap so planned scenarios are not counted as current missing rules.
- It reports candidates per rule, best selection score, feed appearance rate,
  first-slot rate, triggered-but-never-selected rules, and not-triggered rules.
- `--strategy baseline` runs the current production selector.
- `--strategy balanced-v1` is a lab-only simulator. It does not change
  `src/lib/insights.ts`; it groups by rule type, uses weighted candidate
  selection inside a type, simulates cooldown/soft pity across page-load seeds,
  applies semantic-group diversity, and tests experimental trigger logic for
  `cover_master`, `rare_pair_hot`, and `defense_wall`.
- `--strategy balanced-v1.1` keeps the same lab shape but reduces soft-pity
  strength, gives stronger story groups a small priority multiplier, lowers
  always-on/fun groups slightly, and reduces the relative `defense_wall` score.
- It does not write temp files inside the repo unless `--out` is provided.
- If PowerShell displays Vietnamese text incorrectly, the output file is still
  written as UTF-8; open it in an editor/browser that reads UTF-8.

## Approved Selection Redesign

These are the agreed implementation rules for the next insight-selection pass.
Do not start by hand-tuning individual weights only; fix the selection model
first.

### Rule Selection

- Select by scenario `type` first, then select a candidate inside that type.
- `type` is the scenario/kịch bản id, such as `boss_hunter`, `hard_counter`, or
  `perfect_duo`.
- Do not keep only the single best candidate forever. When a selected type has
  multiple candidates, choose the candidate with weighted randomness so stronger
  evidence appears more often but weaker valid candidates still have a chance.
- Candidate weight can use either a softmax-style score or a simpler positive
  score spread, for example `candidateWeight = max(1, score - minScore + 8)`.

### Appearance Chance

- A rule type's appearance chance should be proportional to its final rule
  score against the total score of currently eligible rule types:
  `chance(type) = typeScore / sum(typeScores)`.
- Stronger rule types still appear more often, but no triggered rule should be
  permanently starved by candidate count alone.
- Use saturated scoring for evidence/sample size. Counts should help a story,
  but they must not grow without bound as the match database grows.

### Pity And Cooldown

- Do not implement hard pity for now.
- Keep a soft pity/cooldown model:
  - If a rule type has at least one candidate and is not selected while not in
    cooldown, increase its missed-eligibility bonus.
  - If a rule type is selected, reset its miss bonus and apply cooldown.
  - While a rule type is cooling down, do not add miss/pity bonus.
- Recommended cooldown:
  - feed position 1-2: 5 page loads
  - feed position 3-5: 3 page loads
  - feed position 6-8: 2 page loads
  - cap cooldown at 8 page loads when a rule appears repeatedly in a short
    window
- Cooldown should reduce chance/score but does not have to make a rule
  impossible if the field is sparse.
- State can live in client localStorage by rule type. This state only affects
  feed selection, never metric correctness.

### Semantic Groups

Use groups to diversify the feed, not to block too broadly. The planned group
taxonomy should support both the current 62-rule registry and V4 expansion:

- `rank_race`: leaderboard rank, rank takeover, hot-seat threats, top-1 gap or
  time, stuck-rank stories
- `elo_power`: ELO leader, ELO climb/fall, ELO inflated/defied
- `form_streak`: hot/cold streak, latest-5 form, late bloomer/choker, streak
  breaker
- `partner_pair`: perfect/bad/stable/glued/rare/disaster partner-pair stories
- `partner_impact`: partner boost/drag, carry/backpack, rescue/anchor,
  dependency or unlucky-draw stories
- `head_to_head`: hard counter, target dummy, balanced rivalry, revenge,
  rank-launchpad, friendly-fire, triangle paradox
- `elo_matchup`: boss hunter, giant killer, earthquake victim, lower/higher ELO
  schedule stories, gatekeeper boss
- `score_style`: attack, defense, dominant wins, score bully, quick finisher,
  glass cannon, stubborn loser
- `clutch_drama`: clutch, close loss, late collapse, long games, drama magnet,
  last laugh
- `activity_attendance`: iron lung, missing player, casual visitor, buffet
  eater, moody player, attendance king
- `money_fun`: fine sponsor, money blackhole, experience seeker, mercenary,
  golden victim
- `meta_weird`: alternating form, quantity-over-quality, vulture/charity
  stories, other oddities

### Feed Shape

- Keep the visible Hub feed around 8 comments.
- Use soft group quotas so the feed does not become all ELO/opponent/partner.
- If a group lacks candidates, its slot can flow to another group.
- Re-run `npm run audit:insights -- <backup.json>` after implementation and
  compare feed/first-slot percentages before changing copy.

## 2026-05-15 Backup Calibration

Input data:

- Backup file: `pickleball_backup_2026-05-14.json`
- Players: 8
- Matches: 75
- Ranking matches: 75
- Feed size: 8 comments
- Simulation: 1000 page-load seeds using current `generateInsightsFromSnapshot`

Summary:

- Candidate count: 143
- Triggered scenario types: 44/52
- Scenario types that appeared in at least one simulated feed: 22/52
- Important finding: `hard_counter` (`KHẮC TINH`) and `target_dummy` are no
  longer first every time after score dampening, but they still appear 0% in
  this dataset because other `opponent` group stories, especially
  `boss_hunter`, are selected first and then block the same players from getting
  another opponent-group comment.

Implication:

- If `KHẮC TINH` should appear sometimes, tuning only `appearanceRate` is not
  enough. Review semantic grouping:
  - keep `boss_hunter` in a broader ELO/opponent-achievement group, or
  - move direct head-to-head rules such as `hard_counter`, `target_dummy`,
    `mental_block`, and `sweet_matchup` into a separate head-to-head semantic
    group, or
  - add a per-group quota instead of the current one-opponent-group-per-player
    blocker.

## Simulated Feed Appearance Rates

`Feed %` means the scenario appeared anywhere in the 8-comment feed across 1000
page-load seeds. `First %` means it appeared as the first comment.

| Type | Candidates | Best score | Feed % | First % | Notes |
|---|---:|---:|---:|---:|---|
| `boss_hunter` | 6 | 152 | 99.9 | 61.2 | Dominates first slot in this backup. |
| `free_fall` | 3 | 134 | 99.1 | 13.6 | Very stable feed member. |
| `giant_killer` | 6 | 130 | 96.9 | 5.7 | Very stable feed member. |
| `most_improved` | 2 | 124 | 91.5 | 0.9 | Stable feed member. |
| `dominant_closer` | 5 | 129 | 89.4 | 6.8 | Stable feed member. |
| `carry_partner` | 6 | 127 | 70.8 | 1.3 | Frequent but not always. |
| `partner_boost` | 5 | 128 | 48.0 | 1.4 | Often blocked by partner/group constraints. |
| `sweet_matchup` | 2 | 141 | 43.8 | 4.1 | Strong but competes in `opponent` group. |
| `streak_breaker` | 1 | 119 | 28.5 | 0.2 | Occasional despite one candidate. |
| `heavy_backpack` | 5 | 114 | 19.1 | 0.0 | Often blocked by partner/group constraints. |
| `zero_form5` | 1 | 119 | 18.8 | 0.2 | Occasional. |
| `bagel_loss` | 6 | 103 | 14.4 | 0.0 | Occasional. |
| `earthquake_victim` | 6 | 111 | 13.8 | 0.0 | Occasional. |
| `cold_streak` | 1 | 118 | 13.8 | 0.0 | Occasional. |
| `rank_climber` | 1 | 104 | 13.4 | 0.0 | Occasional. |
| `partner_drag` | 5 | 117 | 12.0 | 0.0 | Often blocked by partner/group constraints. |
| `revenge_win` | 1 | 140 | 10.6 | 4.6 | High score, but participant/group conflicts limit it. |
| `close_loss` | 5 | 88 | 6.0 | 0.0 | Low feed share. |
| `victim_strong_elo` | 1 | 89 | 5.9 | 0.0 | Low feed share. |
| `long_game_addict` | 7 | 86 | 2.8 | 0.0 | Very low feed share. |
| `clutch_master` | 6 | 82 | 1.4 | 0.0 | Very low feed share. |
| `mental_block` | 2 | 123 | 0.1 | 0.0 | Almost fully blocked by stronger opponent-group stories. |
| `hard_counter` | 6 | 95 | 0.0 | 0.0 | Triggered but blocked by opponent group competition. |
| `target_dummy` | 6 | 95 | 0.0 | 0.0 | Triggered but blocked by opponent group competition. |
| `perfect_duo` | 3 | 97 | 0.0 | 0.0 | Triggered but blocked by partner group competition. |
| `bad_duo` | 4 | 86 | 0.0 | 0.0 | Triggered but blocked by partner group competition. |
| `disaster_duo` | 2 | 90 | 0.0 | 0.0 | Triggered but blocked by partner group competition. |
| `revenge_target` | 1 | 93 | 0.0 | 0.0 | Same source story as `revenge_win`; currently loses selection. |
| `balanced_rivalry` | 1 | 46 | 0.0 | 0.0 | Too low versus current field. |
| `elo_king` | 1 | 47 | 0.0 | 0.0 | Always available but heavily dampened. |
| `rank_leader` | 1 | 7 | 0.0 | 0.0 | Always available but heavily dampened. |

Other triggered-but-0% types in this backup:

- `long_game_rivalry`
- `low_score_magnet`
- `score_bully`
- `alternating_form`
- `late_collapse`
- `partner_long_games`
- `bully_lower_elo`
- `experience_seeker`
- `fine_sponsor`
- `gatekeeper`
- `glued_pair`
- `iron_lung`
- `top_attack`

## Next Tuning Questions

- Should `boss_hunter` really appear in almost every feed and own the first slot
  about 61% of the time?
- Should direct head-to-head stories get a separate semantic group so
  `KHẮC TINH`, `KÈO THƠM`, `KHỚP KÈO`, and `BỊCH BÔNG` can rotate against ELO
  achievement stories instead of being blocked by them?
- Should always-on rank/ELO/fine/activity facts stay near 0% unless the feed is
  sparse, or should they have a reserved low-priority slot?

---

## Implementation Plan

This is the current agreed plan for the unfinished `/analysis` Hub insight work.
Read this together with:

- `docs/ANALYSIS_INSIGHTS_RULES.md`
- the audit and selection notes above in this file

## Goals

- Keep all current implemented rule types intact.
- Make every triggered scenario type capable of appearing in the Hub feed.
- Prevent high-scoring or high-candidate-count scenarios from dominating every
  page load.
- Keep stronger, more valuable stories more likely to appear than weaker ones.
- Make the selection model resilient as match count and future V4 scenario count
  grow.

## Agreed Selection Design

1. Generate candidates exactly from the analysis snapshot.
2. Group candidates by scenario `type` (the kịch bản id).
3. Compute a final score/chance for each eligible type.
4. Select rule types into the 8-comment feed using score-proportional weighted
   selection, soft group quotas, cooldown, and soft pity.
5. For each selected type, pick one candidate inside that type with weighted
   randomness. Better evidence should be more likely, but not guaranteed.

Do not select by sorting all raw candidates directly. That lets types with many
candidates, such as `boss_hunter`, dominate the feed.

## Candidate Selection Within A Type

When a selected type has multiple candidates:

- Do not always choose the best candidate.
- Use weighted randomness based on candidate score.
- Suggested simple weighting:
  `candidateWeight = max(1, candidateScore - minCandidateScore + 8)`.
- Candidate scores should use saturated evidence/sample terms so repeated match
  counts do not grow without bound.

## Type Chance

For eligible scenario types:

```text
chance(type) = finalTypeScore / sum(finalTypeScores)
```

This keeps strong stories more frequent while still giving lower-score triggered
types a chance.

## Cooldown And Soft Pity

No hard pity for now.

Track rule-type state in client localStorage:

- `eligibleMisses`
- `cooldownLoads`
- `recentSeenCount`
- `lastSeenAt`

Rules:

- If a type is selected, reset `eligibleMisses`, apply cooldown, and increment
  recent seen state.
- If a type has candidates but is not selected and `cooldownLoads === 0`,
  increment `eligibleMisses`.
- If a type is cooling down, decrement cooldown and do not add pity/miss bonus.
- If a type has no candidates, do not change miss bonus.

Recommended cooldown:

- Position 1-2: 5 page loads
- Position 3-5: 3 page loads
- Position 6-8: 2 page loads
- Cap repeated short-window cooldown at 8 page loads

Soft pity:

- Add a moderate score/chance bonus from `eligibleMisses`.
- Cap the soft pity bonus so it helps starved valid rules without making weak
  rules permanently dominate.
- Do not implement forced 100% hard pity in this pass.

## Semantic Groups

Use semantic groups for soft feed diversity. They should not be broad blockers.

Planned groups:

- `rank_race`
- `elo_power`
- `form_streak`
- `partner_pair`
- `partner_impact`
- `head_to_head`
- `elo_matchup`
- `score_style`
- `clutch_drama`
- `activity_attendance`
- `money_fun`
- `meta_weird`

See the group definitions and V4 coverage notes above before implementing.

## Trigger Adjustments To Implement

### `cover_master`

Keep the original idea: a player who does not score loudly but supports partners
well.

Current trigger is too narrow. Replace absolute thresholds with relative
thresholds:

```text
total >= 12
partnerEdges >= 2
synergyScore >= groupAvgSynergy + 8
attackScore <= groupAvgAttack + 3
```

Acceptable alternative for the attack condition:

```text
avgPointsFor is not top 2 among active players
```

### `rare_pair_hot`

Change from fixed `total 4-5` to relative scarcity.

Proposed trigger:

```text
pair.total === minPairTotal among qualifying pairs
pair.total >= 3
pair.rate >= 80
avgPairTotal - pair.total >= scarcityGap
```

Alternative scarcity condition:

```text
pair.total <= avgPairTotal * 0.65
```

Examples:

- Pair totals `3, 4, 6, 8`: `3` is rare enough.
- Pair totals `6, 7, 8, 8`: `6` is not rare enough.

### `defense_wall`

Replace hard `avgConceded <= 5` with relative + soft absolute threshold.

`avgConceded` means the average opponent score in matches where the player
appears:

- win 11-6 => conceded 6
- lose 8-11 => conceded 11

Proposed trigger:

```text
total >= 8
player is lowest or top-2 lowest avgConceded
avgConceded <= groupAvgConceded - 0.8
avgConceded <= 7.5
```

This allows a clear defensive leader to trigger even when real match scores make
`<= 5` unrealistic.

## Implementation Order

1. Refactor insight candidate metadata:
   - add new semantic group names,
   - keep current type/title/text behavior unchanged,
   - expose enough debug data for audit script.
2. Implement type-level weighted selection:
   - group by `type`,
   - score each type,
   - select 8 types with score-proportional weighted sampling and soft quotas.
3. Implement weighted candidate choice inside selected types.
4. Add client-side localStorage state for cooldown and soft pity:
   - state lives in `AnalysisCenter` or a small helper,
   - pass selection state into `generateInsightsFromSnapshot`,
   - update state after feed selection.
5. Implement trigger changes for `cover_master`, `rare_pair_hot`, and
   `defense_wall`.
6. Run:
   - `npm run audit:insights -- pickleball_backup_2026-05-14.json --seeds 1000`
   - targeted ESLint
   - `npx tsc --noEmit`
7. Compare the audit:
   - no triggered type should remain at 0% unless intentionally suppressed,
   - no single type should dominate first slot,
   - strong stories should still appear more often than weak stories.
8. Only after selection is stable, continue with insight copy expansion or
   Sports Ticker / Flash Card UI work.

## Historical Baseline And Lab Result

Test data: `pickleball_backup_2026-05-14.json`.

Important distinction:

- The `baseline` row below is the pre-port production selector and is kept as
  the broken historical reference point.
- `balanced-v1` and `balanced-v1.1` were lab-only strategies used to approve
  the production port.
- After the production port, current `--strategy baseline` runs the real
  type-first selector in `src/lib/insights.ts`.

### Summary

| Strategy | Seeds | Candidates | Triggered types | Selected types | Triggered but 0% | Top feed | Top first slot |
|---|---:|---:|---:|---:|---:|---:|---:|
| `baseline` | 1000 | 143 | 44/52 | 22/52 | 22 | 99.9% | 61.2% |
| `balanced-v1` | 5000 | 144 | 45/52 | 45/52 | 0 | 23.4% | 3.4% |
| `balanced-v1.1` | 1000 | 144 | 45/52 | 45/52 | 0 | 24.0% | 3.7% |

The extra `balanced-v1` candidate was lab-only `defense_wall`. After the port,
`defense_wall` is generated by production code.

### Baseline Problem

Current production selection still sorts mostly by raw candidate score. This
causes high-score rules and broad groups to crowd out many valid rules.

Top baseline feed rates:

| Type | Feed % | First % |
|---|---:|---:|
| `boss_hunter` | 99.9 | 61.2 |
| `free_fall` | 99.1 | 13.6 |
| `giant_killer` | 96.9 | 5.7 |
| `most_improved` | 91.5 | 0.9 |
| `dominant_closer` | 89.4 | 6.8 |
| `carry_partner` | 70.8 | 1.3 |

Examples of triggered rules that never appeared in baseline:

- `hard_counter`
- `target_dummy`
- `long_game_rivalry`
- `perfect_duo`
- `bad_duo`
- `score_bully`
- `top_attack`
- `rank_leader`
- `elo_king`
- `iron_lung`

This confirms the issue is not only trigger difficulty. Many scenarios already
have candidates, but the selector blocks them.

### Balanced-v1 Result

`balanced-v1` changes the simulated selection shape:

- Select rule type first, then candidate inside that type.
- Candidate inside the selected type is still weighted by score, not chosen
  uniformly.
- Apply semantic group diversity so one theme does not fill the feed.
- Simulate cooldown/soft pity across page loads, so triggered-but-missed rules
  gain some chance later.
- No hard pity and no forced 100% rule.

Top `balanced-v1` feed rates:

| Type | Feed % | First % |
|---|---:|---:|
| `boss_hunter` | 23.4 | 2.6 |
| `rank_climber` | 22.6 | 2.6 |
| `perfect_duo` | 21.4 | 2.2 |
| `streak_breaker` | 21.3 | 2.6 |
| `zero_form5` | 21.2 | 2.5 |
| `cold_streak` | 21.1 | 2.7 |
| `carry_partner` | 20.9 | 2.7 |
| `dominant_closer` | 20.9 | 2.9 |
| `partner_boost` | 20.7 | 2.2 |
| `free_fall` | 20.7 | 3.0 |

Lowest triggered `balanced-v1` feed rates:

| Type | Feed % | First % |
|---|---:|---:|
| `rank_leader` | 9.9 | 0.8 |
| `gatekeeper` | 10.9 | 1.3 |
| `glued_pair` | 10.9 | 0.9 |
| `balanced_rivalry` | 11.6 | 1.6 |
| `top_attack` | 12.5 | 1.5 |
| `experience_seeker` | 12.7 | 1.2 |
| `elo_king` | 13.8 | 1.5 |
| `iron_lung` | 14.2 | 1.4 |

Interpretation:

- The result is not flat random. Stronger stories still appear more often.
- The spread between top and bottom triggered rules is about 13.5 percentage
  points, which is acceptable for a feed of 8 comments across 45 triggered
  types.
- First slot is no longer owned by one rule. The top first-slot rate is 3.4%.
- `boss_hunter` remains the most frequent rule, but no longer appears on nearly
  every page load.

### Balanced-v1.1 Result

`balanced-v1.1` was tested after reviewing the `balanced-v1` output. It changes
only lab parameters:

- Soft pity cap reduced from 36 to 26.
- Pity increment reduced from 4 to 3 per eligible miss.
- Type score mix changed from `best * 0.75 + avg * 0.25` to
  `best * 0.85 + avg * 0.15`.
- Story priority multipliers added:
  - `head_to_head`: 1.15
  - `partner_impact`: 1.12
  - `form_streak` / `elo_matchup`: 1.08
  - lower-priority always-on/fun groups: roughly 0.80-0.86
- Experimental `defense_wall` score reduced.

`balanced-v1.1`, 1000 seeds:

| Type | Feed % | First % |
|---|---:|---:|
| `boss_hunter` | 24.0 | 2.4 |
| `carry_partner` | 23.0 | 2.1 |
| `cold_streak` | 22.5 | 2.6 |
| `streak_breaker` | 22.1 | 2.5 |
| `partner_drag` | 21.6 | 3.2 |
| `dominant_closer` | 21.3 | 2.5 |
| `perfect_duo` | 21.3 | 2.1 |
| `giant_killer` | 21.3 | 2.7 |
| `free_fall` | 21.3 | 2.7 |
| `partner_boost` | 21.1 | 3.1 |

Lowest triggered `balanced-v1.1` feed rates:

| Type | Feed % | First % |
|---|---:|---:|
| `rank_leader` | 8.0 | 0.7 |
| `gatekeeper` | 9.3 | 1.2 |
| `glued_pair` | 10.2 | 0.7 |
| `experience_seeker` | 10.5 | 0.7 |
| `top_attack` | 11.6 | 1.2 |
| `fine_sponsor` | 12.1 | 1.2 |
| `balanced_rivalry` | 12.5 | 2.6 |
| `elo_king` | 12.7 | 1.0 |

Selected rule checks:

| Type | Feed % | First % | Note |
|---|---:|---:|---|
| `hard_counter` | 17.0 | 3.4 | Previously blocked at 0%. |
| `target_dummy` | 17.3 | 3.2 | Previously blocked at 0%. |
| `revenge_win` | 19.5 | 3.7 | Strong rare story, appropriately high. |
| `sweet_matchup` | 20.2 | 3.5 | Strong head-to-head story, appropriately high. |
| `mental_block` | 19.9 | 2.7 | Strong head-to-head story, visible but not dominant. |
| `defense_wall` | 17.2 | 2.6 | Lab-only trigger lowered from v1. |

### Trigger Lab Notes

`defense_wall` triggered in `balanced-v1`:

- Player: `Nguyễn Thanh Tùng`
- `avgConceded`: 6.8 points per match
- Field average conceded: 8.8
- Defensive lift: 2.0 points better than field average

This supports changing `defense_wall` from hard `avgConceded <= 5` to relative
field comparison.

`rare_pair_hot` did not trigger:

- Least-played qualifying pair had 3 matches, but win rate was 0%.
- The 9/9 hot pair is strong, but it is not "rare sample" anymore.
- Keeping this rule untriggered on this backup is correct.

`cover_master` did not trigger:

- Highest synergy player was also a top attack player, so the sentence "does
  not score loudly but covers partners well" would be misleading.
- The next-best synergy players were only about 5-6 points above field average,
  below the proposed +8 threshold.
- Keeping this rule untriggered is better than weakening the copy/meaning.

### Production Port Notes

`balanced-v1.1` has been ported into production selection with conservative
trigger adjustments:

- Type-first weighted selection.
- Weighted candidate choice inside selected type.
- Semantic-group diversity, cooldown, and soft pity.
- Relative `defense_wall` trigger.
- Keep `rare_pair_hot` and `cover_master` thresholds as proposed unless future
  data shows they almost never trigger over a larger backup.

Current production audit after the port on the same backup:

- `npm run audit:insights -- pickleball_backup_2026-05-14.json --seeds 1000 --strategy baseline`
- 45/52 core types triggered.
- 45/52 core types selected at least once.
- Triggered but never selected: 0.
- Top feed rate: 24.9%.
- Top first-slot rate: 3.6%.

The stateful UI behavior is closer to `balanced-v1.1` because the browser keeps
cooldown/soft-pity state in localStorage across reloads.

### Batch 1 Expansion Audit

Batch 1 adds 10 rule types to production:

- `casual_visitor`
- `rank_camper`
- `elo_inflated`
- `elo_defied`
- `top1_gap`
- `late_bloomer`
- `late_choker`
- `drama_magnet`
- `glass_cannon`
- `stubborn_loser`

Audit after Batch 1:

- `npm run audit:insights -- pickleball_backup_2026-05-14.json --seeds 1000 --strategy balanced-v1.1`
- Rule types in current table: 62.
- Triggered scenario types: 51/62.
- Scenario types selected at least once: 51/62.
- Triggered but never selected: 0.
- Production candidate total: 157.
- Top feed rate: 22.3%.
- Top first-slot rate: 3.4%.
- Batch 1 types triggered in this backup: `casual_visitor`, `elo_inflated`,
  `top1_gap`, `late_choker`, `drama_magnet`, and `glass_cannon`.
- Batch 1 types not triggered in this backup: `rank_camper`, `elo_defied`,
  `late_bloomer`, and `stubborn_loser`.

