import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeck } from '../loc-game/deck';
import * as deck from '../loc-game/deck';
import { analyzeCombo, canBeat } from '../loc-game/analyzer';
import { TableState } from '../loc-game/network-types';
import { HostGameEngine } from '../loc-game/network';
import { MonteCarloBrain, sampleHiddenHands, seededRandom } from '../loc-game/bot/monte-carlo-brain';
import { SearchModel, advanceSearch, createSearchState, encodeHand, rolloutMove, searchScores } from '../loc-game/bot/search-model';
import { generateCandidateMoves } from '../loc-game/bot/candidate-generator';
import { publicBotTable } from '../loc-game/bot/worker-client';
import * as search from '../loc-game/bot/search-model';
import { locFixture as fixture } from './helpers/loc-fixtures';

vi.mock('../loc-game/loc-sync', () => ({ createSessionForRoom: vi.fn(async () => null), syncRoundToLocSession: vi.fn(async () => true) }));

function tableFor(hands = fixture(12)): TableState {
  return {
    roomId: 'test', roomName: '', hostId: 'p0', status: 'playing',
    players: Object.keys(hands).map(id => ({ id, name: id, isHost: id === 'p0', isSpectator: false, cardsRemaining: hands[id].length, hasPassed: false })),
    spectators: [], currentTurnPlayerId: 'p0', roundLeaderPlayerId: 'p0', turnDeadline: null,
    lastPlay: null, roundPlayRecords: [], samState: null, playHistory: [], roundResult: null,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Monte Carlo: thông tin ẩn và ngân sách', () => {
  it.each([3, 4, 5])('chia đúng số lá đối thủ và giữ bài dư cho bàn %i người', count => {
    const hands = fixture(22, count);
    const table = tableFor(hands);
    const world = sampleHiddenHands('p0', hands.p0, table, [], seededRandom(12))!;
    const model = new SearchModel();
    expect(world.hands.map(h => model.hand(h).size)).toEqual(Array(count).fill(10));
    expect(world.stock).toHaveLength(52 - count * 10);
    const counts = Array(13).fill(0) as number[];
    world.hands.forEach(h => model.hand(h).counts.forEach((n, i) => { counts[i] += n; }));
    world.stock.forEach(r => counts[r]++);
    expect(counts).toEqual(Array(13).fill(4));
  });

  it('không đưa remainingHands/debug/result vào dữ liệu worker', () => {
    const table = tableFor();
    table.remainingHands = fixture(99);
    table.completedRounds = [];
    const projected = publicBotTable(table);
    expect(projected).not.toHaveProperty('remainingHands');
    expect(projected).not.toHaveProperty('completedRounds');
    expect(projected.roundResult).toBeNull();
  });

  it('kết quả tái lập và không bị thay đổi bởi bài thật đối thủ trong host state', () => {
    const hands = fixture(88);
    const table = tableFor(hands);
    const run = () => new MonteCarloBrain(undefined, { random: seededRandom(8), maxSamples: 8, budgetMs: 10000 }).decideMove('p0', hands.p0, table);
    const first = run();
    table.remainingHands = fixture(999);
    expect(run().cards).toEqual(first.cards);
    expect(run().action).toBe(first.action);
  });

  it('không trả nước đền làng; fallback ngân sách 0 vẫn hợp lệ', () => {
    const hands = fixture(18);
    const table = tableFor(hands);
    table.players[1].cardsRemaining = 1;
    const brain = new MonteCarloBrain(undefined, { budgetMs: 0, maxSamples: 0 });
    const decision = brain.decideMove('p0', hands.p0, table);
    expect(decision.action).toBe('PLAY');
    const combo = analyzeCombo(decision.cards);
    expect(combo.type).not.toBe('INVALID');
    if (combo.type === 'SINGLE') expect(combo.highestRank).toBe(Math.max(...hands.p0.map(c => c.rank)));
    expect(brain.diagnostics.samples).toBe(0);
  });

  it('ưu tiên hết bài và không báo Sâm khi không có đủ bằng chứng', () => {
    const hand = createDeck().filter(c => [3, 4, 5].includes(c.rank) && c.suit === 'spades');
    const table = tableFor({ ...fixture(1), p0: hand });
    const brain = new MonteCarloBrain(undefined, { budgetMs: 0 });
    expect(brain.decideMove('p0', hand, table).cards).toHaveLength(3);
    expect(brain.decideSamCall(hand, table, 'p0')).toBe(false);
  });

  it('dừng lấy mẫu khi hết ngân sách, chỉ nhận vòng so sánh đầy đủ', () => {
    const hands = fixture(93);
    let clock = 0;
    const brain = new MonteCarloBrain(undefined, { now: () => clock++, budgetMs: 5, maxSamples: 1000 });
    const decision = brain.decideMove('p0', hands.p0, tableFor(hands));
    expect(brain.diagnostics.samples).toBe(0);
    expect(brain.diagnostics.elapsedMs).toBeLessThan(12);
    expect(analyzeCombo(decision.cards).type).not.toBe('INVALID');
  });

  it('so sánh Sâm với lượt đầu của người thắng ván trước, không mặc định host', () => {
    const hands = fixture(51);
    const table = tableFor(hands);
    table.roundLeaderPlayerId = 'p2';
    const firstSeats: number[] = [];
    const finish = search.finishSearch;
    vi.spyOn(search, 'finishSearch').mockImplementation((state, model, random) => {
      firstSeats.push(state.current);
      finish(state, model, random);
    });
    new MonteCarloBrain(undefined, { random: seededRandom(7), budgetMs: 10000 }).decideSamCall(hands.p0, table, 'p0');
    expect(firstSeats.length).toBeGreaterThan(0);
    expect(firstSeats.every((seat, i) => seat === (i % 2 === 0 ? 2 : 0))).toBe(true);
  });
});

describe('Mô hình tìm kiếm khớp luật engine thật', () => {
  it('sinh nước theo rank tương đương candidate generator, kể cả A-2-3/chặt Heo', () => {
    const model = new SearchModel();
    for (let seed = 1; seed <= 100; seed++) {
      const hand = fixture(seed).p0;
      const tables = [null, ...generateCandidateMoves(fixture(seed + 100).p1, null).map(m => m.combo!)];
      for (const table of tables) {
        const expected = generateCandidateMoves(hand, table).map(m => m.action === 'PASS' ? 0 : encodeHand(m.cards)).sort((a, b) => a - b);
        const actual = model.legal(encodeHand(hand), table ? { code: encodeHand(table.cards), type: table.type, rank: table.highestRank, length: table.length } : null, 10).map(m => m.code).sort((a, b) => a - b);
        expect(actual).toEqual(expected);
      }
    }
  });

  it.each([3, 4, 5])('đối chiếu toàn bộ lượt, bỏ vòng và kết toán với HostGameEngine ở bàn %i', count => {
    for (let seed = 10; seed < 16; seed++) {
      const hands = fixture(seed, count);
      vi.spyOn(deck, 'dealCards').mockReturnValue({ playerHands: structuredClone(hands), remainingCards: [] });
      const engine = new HostGameEngine('offline-parity', '', 'p0', 'p0', () => {});
      for (let i = 1; i < count; i++) engine.handleJoin({ id: `p${i}`, name: `p${i}`, isSpectator: false });
      try {
        engine.startGame();
        if (engine.getState().status === 'round_ended') continue;
        if (seed % 2 === 0) engine.handleCallSam('p0');
        else for (let i = 0; i < count; i++) engine.handleSkipSam(`p${i}`);
        const model = new SearchModel();
        const state = createSearchState(engine.getState(), Object.values(hands).map(encodeHand), model);
        const random = seededRandom(seed);
        while (state.winner < 0) {
          const seat = state.current;
          const id = state.ids[seat];
          const move = rolloutMove(state, model, random);
          const decision = move.length ? generateCandidateMoves(engine.getPlayerHand(id), engine.getState().lastPlay?.combo ?? null).find(m => encodeHand(m.cards) === move.code)! : null;
          if (decision) {
            expect(engine.getState().lastPlay ? canBeat(analyzeCombo(decision.cards), engine.getState().lastPlay!.combo) : true).toBe(true);
            engine.handlePlayCards(id, decision.cards);
          } else engine.handlePassTurn(id);
          advanceSearch(state, move, model);
          expect(engine.getState().players.map(p => p.cardsRemaining)).toEqual(state.sizes);
          if (state.winner < 0) {
            expect(engine.getState().currentTurnPlayerId).toBe(state.ids[state.current]);
            expect(engine.getState().lastPlay?.combo.type ?? null).toBe(state.table?.type ?? null);
            expect(engine.getState().players.map(p => p.hasPassed)).toEqual(state.passed);
          }
        }
        const scores = searchScores(state, model);
        for (const id of state.ids) expect(engine.getState().roundResult![id]).toEqual(scores[id]);
      } finally { engine.destroy(); vi.restoreAllMocks(); }
    }
  });
});
