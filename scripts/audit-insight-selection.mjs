#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage:
  node scripts/audit-insight-selection.mjs <backup.json> [--seeds 1000] [--lose-money 5000] [--strategy baseline|balanced-v1|balanced-v1.1] [--out report.md] [--json]

Examples:
  node scripts/audit-insight-selection.mjs pickleball_backup_2026-05-14.json
  npm run audit:insights -- pickleball_backup_2026-05-14.json --seeds 2000 --out .next/insight-audit.md
  npm run audit:insights -- pickleball_backup_2026-05-14.json --strategy balanced-v1
  npm run audit:insights -- pickleball_backup_2026-05-14.json --strategy balanced-v1.1
`);
}

function parseArgs(argv) {
  const options = {
    backupPath: '',
    seeds: 1000,
    loseMoney: 5000,
    strategy: 'baseline',
    outPath: '',
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--seeds') {
      options.seeds = Number(argv[++i] || 0);
      continue;
    }
    if (arg === '--lose-money') {
      options.loseMoney = Number(argv[++i] || 0);
      continue;
    }
    if (arg === '--strategy') {
      options.strategy = argv[++i] || '';
      continue;
    }
    if (arg === '--out') {
      options.outPath = argv[++i] || '';
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (!options.backupPath) {
      options.backupPath = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.backupPath) {
    usage();
    throw new Error('Missing backup JSON path.');
  }
  if (!Number.isFinite(options.seeds) || options.seeds <= 0) {
    throw new Error('--seeds must be a positive number.');
  }
  if (!Number.isFinite(options.loseMoney) || options.loseMoney < 0) {
    throw new Error('--lose-money must be zero or a positive number.');
  }
  if (!['baseline', 'balanced-v1', 'balanced-v1.1'].includes(options.strategy)) {
    throw new Error('--strategy must be baseline, balanced-v1, or balanced-v1.1.');
  }

  return options;
}

const BALANCED_GROUP_BY_TYPE = {
  elo_king: 'elo_power',
  giant_killer: 'elo_power',
  earthquake_victim: 'elo_power',
  gatekeeper: 'elo_power',
  most_improved: 'elo_power',
  free_fall: 'elo_power',
  elo_inflated: 'elo_power',
  elo_defied: 'elo_power',
  bully_lower_elo: 'elo_matchup',
  victim_strong_elo: 'elo_matchup',
  boss_hunter: 'elo_matchup',
  rank_leader: 'rank_race',
  rank_climber: 'rank_race',
  rank_camper: 'rank_race',
  top1_gap: 'rank_race',
  rank_launchpad: 'rank_race',
  hot_seat_threat: 'rank_race',
  hot_streak: 'form_streak',
  cold_streak: 'form_streak',
  perfect_form5: 'form_streak',
  zero_form5: 'form_streak',
  late_bloomer: 'form_streak',
  late_choker: 'form_streak',
  streak_breaker: 'form_streak',
  alternating_form: 'form_streak',
  perfect_duo: 'partner_pair',
  bad_duo: 'partner_pair',
  stable_partner: 'partner_pair',
  rare_pair_hot: 'partner_pair',
  glued_pair: 'partner_pair',
  disaster_duo: 'partner_impact',
  partner_boost: 'partner_impact',
  partner_drag: 'partner_impact',
  carry_partner: 'partner_impact',
  heavy_backpack: 'partner_impact',
  cover_master: 'partner_impact',
  parasite_win: 'partner_impact',
  king_rescue: 'partner_impact',
  anchor_drag: 'partner_impact',
  unlucky_draw: 'partner_impact',
  partner_long_games: 'clutch_drama',
  dominant_closer: 'score_style',
  top_attack: 'score_style',
  defense_wall: 'score_style',
  bagel_loss: 'score_style',
  score_bully: 'score_style',
  low_score_magnet: 'score_style',
  glass_cannon: 'score_style',
  stubborn_loser: 'score_style',
  close_loss: 'clutch_drama',
  long_game_addict: 'clutch_drama',
  clutch_master: 'clutch_drama',
  late_collapse: 'clutch_drama',
  drama_magnet: 'clutch_drama',
  hard_counter: 'head_to_head',
  target_dummy: 'head_to_head',
  long_game_rivalry: 'head_to_head',
  mental_block: 'head_to_head',
  sweet_matchup: 'head_to_head',
  balanced_rivalry: 'head_to_head',
  revenge_win: 'head_to_head',
  revenge_target: 'head_to_head',
  gatekeeper_boss: 'head_to_head',
  friendly_fire: 'head_to_head',
  iron_lung: 'activity_attendance',
  missing_player: 'activity_attendance',
  casual_visitor: 'activity_attendance',
  buffet_eater: 'activity_attendance',
  moody_player: 'activity_attendance',
  mercenary: 'activity_attendance',
  fine_sponsor: 'money_fun',
  experience_seeker: 'meta_weird',
};

const BALANCED_V11_PRIORITY_BY_GROUP = {
  head_to_head: 1.15,
  partner_impact: 1.12,
  form_streak: 1.08,
  elo_matchup: 1.08,
  clutch_drama: 1.04,
  score_style: 0.98,
  partner_pair: 0.96,
  elo_power: 0.95,
  rank_race: 0.86,
  activity_attendance: 0.82,
  money_fun: 0.84,
  meta_weird: 0.8,
};

function balancedGroupFor(type, fallbackGroup) {
  return BALANCED_GROUP_BY_TYPE[type] || fallbackGroup || 'meta_weird';
}

function evidence(value) {
  return Math.min(24, Math.round(Math.sqrt(Math.max(0, value)) * 6));
}

function oneDecimal(value) {
  return Number(value).toFixed(1);
}

function round(value) {
  return Math.round(value);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(items, weightFor, random) {
  const weighted = items.map(item => ({
    item,
    weight: Math.max(0, weightFor(item)),
  })).filter(entry => entry.weight > 0);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;

  let cursor = random() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item || null;
}

function candidateWeight(candidate, minScore) {
  return Math.max(1, candidate.selectionScore - minScore + 8);
}

function cooldownForPosition(index) {
  if (index <= 1) return 5;
  if (index <= 4) return 3;
  return 2;
}

function compileAnalysisModules() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'pickleball-insight-audit-'));
  const tscBin = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

  execFileSync(process.execPath, [
    tscBin,
    'src/lib/analysis-core.ts',
    'src/lib/insights.ts',
    'src/lib/guest.ts',
    '--outDir',
    outDir,
    '--module',
    'commonjs',
    '--target',
    'es2020',
    '--esModuleInterop',
    '--skipLibCheck',
    '--noEmit',
    'false',
    '--moduleResolution',
    'node',
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  return outDir;
}

function canonicalPairKey(a, b) {
  return [a, b].sort().join('::');
}

function uniquePartnerEdges(snapshot) {
  const pairs = new Map();
  for (const edge of snapshot.partnerEdges) {
    if (!edge.playerId || !edge.otherId || edge.total <= 0) continue;
    const key = canonicalPairKey(edge.playerId, edge.otherId);
    if (!pairs.has(key)) pairs.set(key, edge);
  }
  return [...pairs.values()];
}

function makeLabCandidate(config) {
  return {
    type: config.type,
    title: config.title,
    group: config.group,
    participants: config.participants,
    rarity: config.rarity || 'rare',
    frequency: config.frequency || 'rare',
    selectionScore: Math.round(config.selectionScore),
    text: config.text,
    experimental: true,
  };
}

function makeExperimentalTriggerCandidates(snapshot, currentCandidates) {
  const existingTypes = new Set(currentCandidates.map(candidate => candidate.type));
  const candidates = [...currentCandidates];
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const avgSynergy = active.reduce((sum, metric) => sum + metric.synergyScore, 0) / Math.max(1, active.length);
  const avgAttack = active.reduce((sum, metric) => sum + metric.attackScore, 0) / Math.max(1, active.length);
  const avgConceded = active.reduce((sum, metric) => sum + metric.avgConceded, 0) / Math.max(1, active.length);
  const topAttackIds = new Set([...active]
    .sort((a, b) => b.avgPointsFor - a.avgPointsFor)
    .slice(0, 2)
    .map(metric => metric.id));

  for (const metric of active) {
    const playerEdges = snapshot.partnerEdges.filter(edge => edge.playerId === metric.id && edge.total >= 2);
    const synergyLift = metric.synergyScore - avgSynergy;
    const attackIsNotLoud = metric.attackScore <= avgAttack + 3 || !topAttackIds.has(metric.id);
    if (!existingTypes.has('cover_master') && metric.total >= 12 && playerEdges.length >= 2 && synergyLift >= 8 && attackIsNotLoud) {
      candidates.push(makeLabCandidate({
        type: 'cover_master',
        title: 'TRUM BOC LOT LAB',
        group: 'partner_impact',
        participants: [metric.name],
        selectionScore: 50 + evidence(metric.total) + Math.min(24, Math.round(synergyLift)),
        text: `${metric.name} khong ghi diem qua on ao nhung synergy cao hon mat bang ${round(synergyLift)} diem, dung mau boc lot dong doi.`,
      }));
    }
  }

  const pairEdges = uniquePartnerEdges(snapshot).filter(edge => edge.total >= 3);
  if (pairEdges.length > 0) {
    const avgPairTotal = pairEdges.reduce((sum, edge) => sum + edge.total, 0) / pairEdges.length;
    const minPairTotal = Math.min(...pairEdges.map(edge => edge.total));
    const scarcityGap = Math.max(2, Math.round(avgPairTotal * 0.25));
    for (const edge of pairEdges) {
      const isClearlyScarce = (avgPairTotal - edge.total >= scarcityGap) || edge.total <= avgPairTotal * 0.65;
      if (!existingTypes.has('rare_pair_hot') && edge.total === minPairTotal && edge.rate >= 80 && isClearlyScarce) {
        candidates.push(makeLabCandidate({
          type: 'rare_pair_hot',
          title: 'CAP MAU MONG MA THOM LAB',
          group: 'partner_pair',
          participants: [edge.playerName, edge.otherName],
          selectionScore: 54 + evidence(edge.total) + Math.min(24, edge.rate - 70) + Math.round(avgPairTotal - edge.total),
          text: `${edge.playerName} va ${edge.otherName} la cap it danh nhat (${edge.total} tran, trung binh cap ${oneDecimal(avgPairTotal)}) nhung thang ${edge.wins}/${edge.total}.`,
        }));
      }
    }
  }

  if (!existingTypes.has('defense_wall')) {
    const defenseCandidates = active
      .filter(metric => metric.total >= 8)
      .sort((a, b) => a.avgConceded - b.avgConceded)
      .slice(0, 2)
      .filter(metric => metric.avgConceded <= avgConceded - 0.8 && metric.avgConceded <= 7.5);

    for (const metric of defenseCandidates) {
      const defenseLift = avgConceded - metric.avgConceded;
      candidates.push(makeLabCandidate({
        type: 'defense_wall',
        title: 'BUC TUONG PHONG THU LAB',
        group: 'score_style',
        participants: [metric.name],
        rarity: defenseLift >= 1.5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        selectionScore: 50 + evidence(metric.total) + Math.min(18, Math.round(defenseLift * 8)),
        text: `${metric.name} chi mat trung binh ${oneDecimal(metric.avgConceded)} diem/tran, thap hon mat bang san ${oneDecimal(defenseLift)} diem.`,
      }));
    }
  }

  return candidates;
}

function selectBalancedFeed(candidates, ruleTypes, state, seed, strategy, limit = 8) {
  const random = seededRandom(seed);
  const byType = new Map();
  for (const candidate of candidates) {
    const list = byType.get(candidate.type) || [];
    list.push(candidate);
    byType.set(candidate.type, list);
  }

  for (const type of byType.keys()) {
    const typeState = state.get(type) || { eligibleMisses: 0, cooldownLoads: 0 };
    typeState.cooldownLoads = Math.max(0, typeState.cooldownLoads - 1);
    state.set(type, typeState);
  }

  const selected = [];
  const selectedTypes = new Set();
  const groupCounts = new Map();
  const presentTypes = ruleTypes.filter(type => byType.has(type));

  while (selected.length < limit) {
    const remainingTypes = presentTypes.filter(type => !selectedTypes.has(type));
    if (remainingTypes.length === 0) break;

    const pickedType = weightedPick(remainingTypes, type => {
      const typeState = state.get(type) || { eligibleMisses: 0, cooldownLoads: 0 };
      if (typeState.cooldownLoads > 0) return 0;
      const typeCandidates = byType.get(type) || [];
      const bestScore = Math.max(...typeCandidates.map(candidate => candidate.selectionScore));
      const avgScore = typeCandidates.reduce((sum, candidate) => sum + candidate.selectionScore, 0) / Math.max(1, typeCandidates.length);
      const group = balancedGroupFor(type, typeCandidates[0]?.group);
      const groupCount = groupCounts.get(group) || 0;
      if (groupCount >= 2) return 0;
      const groupPenalty = groupCount === 1 ? 0.38 : 1;
      const isV11 = strategy === 'balanced-v1.1';
      const priority = isV11 ? (BALANCED_V11_PRIORITY_BY_GROUP[group] || 1) : 1;
      const pityBonus = isV11
        ? Math.min(26, typeState.eligibleMisses * 3)
        : Math.min(36, typeState.eligibleMisses * 4);
      const countBonus = Math.min(8, Math.log2(typeCandidates.length + 1) * 2);
      const scoreMix = isV11
        ? (bestScore * 0.85) + (avgScore * 0.15)
        : (bestScore * 0.75) + (avgScore * 0.25);
      const rawScore = Math.max(18, scoreMix + countBonus + pityBonus);
      return rawScore * groupPenalty * priority;
    }, random);

    if (!pickedType) break;

    const typeCandidates = byType.get(pickedType) || [];
    const minScore = Math.min(...typeCandidates.map(candidate => candidate.selectionScore));
    const pickedCandidate = weightedPick(typeCandidates, candidate => candidateWeight(candidate, minScore), random);
    if (!pickedCandidate) break;

    selected.push(pickedCandidate);
    selectedTypes.add(pickedType);
    const group = balancedGroupFor(pickedType, pickedCandidate.group);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }

  for (const type of presentTypes) {
    const typeState = state.get(type) || { eligibleMisses: 0, cooldownLoads: 0 };
    if (selectedTypes.has(type)) {
      const index = selected.findIndex(candidate => candidate.type === type);
      typeState.eligibleMisses = 0;
      typeState.cooldownLoads = Math.max(typeState.cooldownLoads, cooldownForPosition(index));
    } else if (typeState.cooldownLoads === 0) {
      typeState.eligibleMisses += 1;
    }
    state.set(type, typeState);
  }

  return selected;
}

function makeAudit(options) {
  const backupPath = path.resolve(repoRoot, options.backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  const players = (backup.players || []).filter(player => !player.deleted_at);
  const matches = (backup.matches || []).filter(match => !match.deleted_at);

  const outDir = compileAnalysisModules();
  try {
    const require = createRequire(import.meta.url);
    const { buildAnalysisSnapshot } = require(path.join(outDir, 'analysis-core.js'));
    const {
      INSIGHT_RULE_TYPES,
      generateInsightCandidatesForDebug,
      generateInsightSelectionResultFromSnapshot,
    } = require(path.join(outDir, 'insights.js'));
    const ruleTypes = [...INSIGHT_RULE_TYPES];

    const snapshot = buildAnalysisSnapshot(players, matches, options.loseMoney);
    const productionCandidates = generateInsightCandidatesForDebug(snapshot);
    const useBalancedLab = options.strategy.startsWith('balanced-v1');
    const candidates = useBalancedLab
      ? makeExperimentalTriggerCandidates(snapshot, productionCandidates)
      : productionCandidates;
    const candidateByType = new Map();

    for (const candidate of candidates) {
      const row = candidateByType.get(candidate.type) || {
        type: candidate.type,
        title: candidate.title,
        group: candidate.group,
        candidates: 0,
        experimentalCandidates: 0,
        bestScore: Number.NEGATIVE_INFINITY,
        example: candidate.text,
      };
      row.candidates += 1;
      if (candidate.experimental) row.experimentalCandidates += 1;
      row.bestScore = Math.max(row.bestScore, candidate.selectionScore);
      candidateByType.set(candidate.type, row);
    }

    const selectedByType = new Map();
    const balancedState = new Map();
    let productionState = {};
    for (let seed = 1; seed <= options.seeds; seed += 1) {
      let feed;
      if (useBalancedLab) {
        feed = selectBalancedFeed(candidates, ruleTypes, balancedState, seed, options.strategy);
      } else {
        const result = generateInsightSelectionResultFromSnapshot(snapshot, { seed, selectionState: productionState });
        productionState = result.nextSelectionState;
        feed = result.insights;
      }
      feed.forEach((item, index) => {
        const row = selectedByType.get(item.type) || {
          type: item.type,
          title: item.title,
          selected: 0,
          first: 0,
        };
        row.selected += 1;
        if (index === 0) row.first += 1;
        selectedByType.set(item.type, row);
      });
    }

    const allTypes = Array.from(new Set([...ruleTypes, ...candidateByType.keys(), ...selectedByType.keys()]));
    const rows = allTypes.map(type => {
      const candidate = candidateByType.get(type);
      const selected = selectedByType.get(type);
      return {
        type,
        title: selected?.title || candidate?.title || '',
        candidates: candidate?.candidates || 0,
        experimentalCandidates: candidate?.experimentalCandidates || 0,
        bestScore: Number.isFinite(candidate?.bestScore) ? candidate.bestScore : null,
        feedPct: Number((((selected?.selected || 0) / options.seeds) * 100).toFixed(1)),
        firstPct: Number((((selected?.first || 0) / options.seeds) * 100).toFixed(1)),
        example: candidate?.example || '',
      };
    });

    rows.sort((a, b) => (
      b.feedPct - a.feedPct ||
      b.firstPct - a.firstPct ||
      b.candidates - a.candidates ||
      a.type.localeCompare(b.type)
    ));

    const triggeredTypes = rows.filter(row => row.candidates > 0);
    const selectedTypes = rows.filter(row => row.feedPct > 0);
    const triggeredButNeverSelected = rows.filter(row => row.candidates > 0 && row.feedPct === 0);
    const notTriggered = ruleTypes.filter(type => !candidateByType.has(type));

    return {
      summary: {
        strategy: options.strategy,
        backupFile: path.relative(repoRoot, backupPath),
        players: players.length,
        matches: matches.length,
        rankingMatches: snapshot.rankingMatches.length,
        feedSize: 8,
        seeds: options.seeds,
        candidateTotal: candidates.length,
        productionCandidateTotal: productionCandidates.length,
        experimentalCandidateTotal: candidates.filter(candidate => candidate.experimental).length,
        ruleTypes: ruleTypes.length,
        triggeredTypes: triggeredTypes.length,
        selectedTypes: selectedTypes.length,
      },
      rows,
      triggeredButNeverSelected,
      notTriggered,
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function markdownTable(rows) {
  const lines = [
    '| Type | Candidates | Lab candidates | Best score | Feed % | First % | Example |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const row of rows) {
    const example = row.example.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
    lines.push(`| \`${row.type}\` | ${row.candidates} | ${row.experimentalCandidates || 0} | ${row.bestScore ?? '-'} | ${row.feedPct.toFixed(1)} | ${row.firstPct.toFixed(1)} | ${example} |`);
  }
  return lines.join('\n');
}

function toMarkdown(audit) {
  const { summary } = audit;
  const topFirst = audit.rows
    .filter(row => row.firstPct > 0)
    .slice()
    .sort((a, b) => b.firstPct - a.firstPct)
    .slice(0, 8);

  return `# Insight Selection Audit Report

Generated by \`scripts/audit-insight-selection.mjs\`.

## Input

- Backup file: \`${summary.backupFile}\`
- Strategy: \`${summary.strategy}\`
- Players: ${summary.players}
- Matches: ${summary.matches}
- Ranking matches: ${summary.rankingMatches}
- Feed size: ${summary.feedSize}
- Simulated page-load seeds: ${summary.seeds}

## Summary

- Candidate count: ${summary.candidateTotal}
- Production candidate count: ${summary.productionCandidateTotal}
- Experimental candidate count: ${summary.experimentalCandidateTotal}
- Rule types in code registry: ${summary.ruleTypes}
- Triggered scenario types: ${summary.triggeredTypes}/${summary.ruleTypes}
- Scenario types that appeared in at least one simulated feed: ${summary.selectedTypes}/${summary.ruleTypes}
- Triggered but never selected: ${audit.triggeredButNeverSelected.length}
- Not triggered: ${audit.notTriggered.length}

## First Slot Leaders

${markdownTable(topFirst)}

## Full Appearance Table

${markdownTable(audit.rows)}

## Triggered But Never Selected

${audit.triggeredButNeverSelected.length > 0 ? audit.triggeredButNeverSelected.map(row => `- \`${row.type}\` (${row.candidates} candidates, best score ${row.bestScore ?? '-'})`).join('\n') : '- None'}

## Not Triggered

${audit.notTriggered.length > 0 ? audit.notTriggered.map(type => `- \`${type}\``).join('\n') : '- None'}
`;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const audit = makeAudit(options);
  const output = options.json ? JSON.stringify(audit, null, 2) : toMarkdown(audit);

  if (options.outPath) {
    const outPath = path.resolve(repoRoot, options.outPath);
    writeFileSync(outPath, output, 'utf8');
    console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
  } else {
    console.log(output);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
