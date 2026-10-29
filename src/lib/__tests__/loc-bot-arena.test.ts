import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import * as deck from '../loc-game/deck';
import { analyzeCombo, canBeat } from '../loc-game/analyzer';
import { HostGameEngine } from '../loc-game/network';
import { BotBrain as LegacyBotBrain } from '../loc-game/bot/bot-brain';
import { MonteCarloBrain, seededRandom } from '../loc-game/bot/monte-carlo-brain';
import { locFixture } from './helpers/loc-fixtures';

vi.mock('../loc-game/loc-sync', () => ({ createSessionForRoom: vi.fn(async () => null), syncRoundToLocSession: vi.fn(async () => true) }));

describe('Legacy vs Monte Carlo trên engine thật', () => {
  it.skipIf(process.env.LOC_BOT_ARENA !== '1')('đấu cặp cùng bài, đảo loại bot giữa các ghế', () => {
    const deals = Number(process.env.LOC_BOT_ARENA_DEALS ?? 200);
    const firstSeed = Number(process.env.LOC_BOT_ARENA_SEED ?? 20261029);
    expect(deals % 2).toBe(0);
    const stats = {
      legacy: { wins: 0, netCards: 0, burned: 0, rottenTwos: 0, denLang: 0, samCalls: 0, samWins: 0, latencies: [] as number[] },
      monteCarlo: { wins: 0, netCards: 0, burned: 0, rottenTwos: 0, denLang: 0, samCalls: 0, samWins: 0, latencies: [] as number[] },
    };
    const matches: { seed: number; swap: number; winner: string; winnerType: string; turns: number; net: Record<string, number> }[] = [];
    const samples: number[] = [];
    const started = performance.now();
    const ids = ['p0', 'p1', 'p2', 'p3'];
    for (let pair = 0; pair < deals / 2; pair++) {
      const seed = firstSeed + pair;
      const hands = locFixture(seed);
      for (let swap = 0; swap < 2; swap++) {
        const versions = Object.fromEntries(ids.map((id, seat) => [id, seat % 2 === swap ? 'monteCarlo' : 'legacy'])) as Record<string, keyof typeof stats>;
        const brains = Object.fromEntries(ids.map((id, seat) => [id, versions[id] === 'legacy'
          ? new LegacyBotBrain(undefined, 'balanced')
          : new MonteCarloBrain(undefined, { random: seededRandom(seed * 17 + seat) })]));
        const first = pair % 4;
        vi.spyOn(deck, 'dealCards').mockReturnValue({ playerHands: structuredClone(hands), remainingCards: [] });
        const engine = new HostGameEngine('offline-arena', 'Arena', ids[first], ids[first], () => {});
        for (let offset = 1; offset < 4; offset++) {
          const id = ids[(first + offset) % 4];
          engine.handleJoin({ id, name: id, isSpectator: false });
        }
        try {
          engine.startGame();
          // Both versions may call Sâm, in the same rotating seat order.
          for (const player of engine.getState().players) {
            if (engine.getState().status !== 'sam_calling') break;
            const brain = brains[player.id];
            const call = brain instanceof MonteCarloBrain
              ? brain.decideSamCall(engine.getPlayerHand(player.id), engine.getState(), player.id)
              : brain.decideSamCall(engine.getPlayerHand(player.id));
            if (call) { stats[versions[player.id]].samCalls++; engine.handleCallSam(player.id); }
            else engine.handleSkipSam(player.id);
          }
          let turns = 0;
          while (engine.getState().status === 'playing' && turns++ < 300) {
            const table = engine.getState();
            const id = table.currentTurnPlayerId!;
            const brain = brains[id];
            const hand = engine.getPlayerHand(id);
            const before = hand.length;
            const time = performance.now();
            const decision = brain.decideMove(id, hand, table);
            stats[versions[id]].latencies.push(performance.now() - time);
            if (brain instanceof MonteCarloBrain) samples.push(brain.diagnostics.samples);
            if (decision.action === 'PLAY') {
              const combo = analyzeCombo(decision.cards);
              expect(combo.type).not.toBe('INVALID');
              expect(table.lastPlay ? canBeat(combo, table.lastPlay.combo) : true).toBe(true);
              expect(decision.cards.every(card => hand.some(c => c.id === card.id))).toBe(true);
              engine.handlePlayCards(id, decision.cards);
              expect(engine.getPlayerHand(id)).toHaveLength(before - decision.cards.length);
            } else {
              expect(table.lastPlay).not.toBeNull();
              engine.handlePassTurn(id);
            }
            const played = engine.getState().roundPlayRecords?.flatMap(record => record.cards) ?? [];
            for (const brain of Object.values(brains)) brain.getTracker().recordPlay(played);
          }
          expect(turns).toBeLessThan(300);
          expect(engine.getState().status).toBe('round_ended');
          const result = engine.getState().roundResult!;
          const winner = ids.find(id => result[id].isWinner)!;
          for (const id of ids) {
            const stat = stats[versions[id]];
            const score = result[id];
            stat.wins += Number(score.isWinner);
            stat.netCards += score.netCards;
            stat.burned += Number(score.isBurned);
            stat.rottenTwos += score.twosRemaining + Number(Boolean(score.hasThoi2ByEndingWith2));
            stat.denLang += Number(Boolean(score.isDenLang));
            stat.samWins += Number(Boolean(score.isSamSuccess));
          }
          matches.push({ seed, swap, winner, winnerType: versions[winner], turns, net: Object.fromEntries(ids.map(id => [id, result[id].netCards])) });
        } finally { engine.destroy(); vi.restoreAllMocks(); }
      }
      if ((pair + 1) % 10 === 0) console.log(`Arena: ${(pair + 1) * 2}/${deals} ván`);
    }
    const reportStats = Object.fromEntries(Object.entries(stats).map(([name, stat]) => {
      const { latencies, ...rest } = stat;
      const sorted = [...latencies].sort((a, b) => a - b);
      return [name, { ...rest, winRate: stat.wins / deals, netPerSeatDeal: stat.netCards / (deals * 2),
        decisions: sorted.length, meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted.at(-1) }];
    }));
    const report = {
      deals, firstSeed, methodology: '4 seats, 2 new vs 2 legacy; identical deals paired with types swapped; rotating opening seat; real HostGameEngine; both may call Sam; production search limits',
      cpu: cpus()[0]?.model, runtime: process.version, elapsedSeconds: (performance.now() - started) / 1000,
      stats: reportStats, meanSamples: samples.reduce((a, b) => a + b, 0) / samples.length, matches,
    };
    const reportPath = process.env.LOC_BOT_ARENA_REPORT ?? join(tmpdir(), 'loc-bot-arena.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ ...report, matches: undefined, reportPath }, null, 2));
    expect(matches).toHaveLength(deals);
    expect(stats.legacy.wins + stats.monteCarlo.wins).toBe(deals);
    expect(stats.monteCarlo.denLang).toBe(0);
    // Report playing strength honestly; don't assert the new bot must win.
  }, 240000);
});
