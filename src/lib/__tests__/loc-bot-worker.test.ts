import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotWorkerClient, BotWorkerRequest, BotWorkerResponse } from '../loc-game/bot/worker-client';
import { MonteCarloBrain } from '../loc-game/bot/monte-carlo-brain';
import { TableState } from '../loc-game/network-types';
import { locFixture } from './helpers/loc-fixtures';
import { BotDecision } from '../loc-game/bot/types';
import { HostGameEngine } from '../loc-game/network';
import * as deck from '../loc-game/deck';

vi.mock('../loc-game/loc-sync', () => ({ createSessionForRoom: vi.fn(async () => null), syncRoundToLocSession: vi.fn(async () => true) }));

const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: BotWorkerResponse }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  messages: BotWorkerRequest[] = [];
  terminate = vi.fn();
  constructor() { workers.push(this); }
  postMessage(message: BotWorkerRequest) { this.messages.push(message); }
}
function table(): TableState {
  return { roomId: 'test', roomName: '', hostId: 'p0', status: 'playing',
    players: [0, 1, 2, 3].map(i => ({ id: `p${i}`, name: '', isHost: i === 0, isSpectator: false, cardsRemaining: 10, hasPassed: false })),
    spectators: [], currentTurnPlayerId: 'p0', roundLeaderPlayerId: 'p0', turnDeadline: null,
    lastPlay: null, samState: null, roundResult: null, playHistory: [] };
}

beforeEach(() => { vi.useFakeTimers(); workers.length = 0; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Worker bot: thời hạn và hủy kết quả', () => {
  it('tái sử dụng một worker và chỉ gửi dữ liệu công khai', async () => {
    const client = new BotWorkerClient();
    const state = table();
    state.remainingHands = locFixture(99);
    const promise = client.move('p0', locFixture(12).p0, state);
    const message = workers[0].messages[0];
    expect(message.table).not.toHaveProperty('remainingHands');
    const decision: BotDecision = { action: 'PASS', cards: [], reason: 'test' };
    workers[0].onmessage!({ data: { id: message.id, result: decision } });
    expect(await promise).toEqual(decision);
    client.cancelPending();
    expect(workers[0].terminate).not.toHaveBeenCalled();
    const sam = client.sam('p0', locFixture(12).p0, state);
    expect(workers).toHaveLength(1);
    workers[0].onmessage!({ data: { id: workers[0].messages[1].id, result: false } });
    expect(await sam).toBe(false);
    client.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['timeout', 'error', 'postMessage', 'unsupported'])('trả fallback hợp lệ nếu %s, không để promise treo', async failure => {
    const client = new BotWorkerClient();
    if (failure === 'unsupported') vi.stubGlobal('Worker', undefined);
    if (failure === 'postMessage') vi.spyOn(FakeWorker.prototype, 'postMessage').mockImplementation(() => { throw new Error('Blocked'); });
    const hand = locFixture(12).p0;
    const promise = client.move('p0', hand, table());
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(1200);
    if (failure === 'error') workers[0].onerror!();
    const decision = await promise;
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBeGreaterThan(0);
    expect(decision.cards.every(card => hand.some(c => c.id === card.id))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    client.cancel();
  });

  it('hủy khi đang tính và bỏ qua thông điệp cũ', async () => {
    const client = new BotWorkerClient();
    const promise = client.sam('p0', locFixture(1).p0, table());
    client.cancelPending();
    expect(await promise).toBe(false);
    expect(workers[0].terminate).toHaveBeenCalled();
    workers[0].onmessage!({ data: { id: workers[0].messages[0].id, result: true } });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Host bỏ qua quyết định bất đồng bộ đã hết hiệu lực', () => {
  it('không nhận quyết định Sâm sau destroy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(deck, 'dealCards').mockImplementation(ids => ({
      playerHands: Object.fromEntries(ids.map((id, i) => [id, Object.values(locFixture(12, 3))[i]])), remainingCards: [],
    }));
    let resolveSam!: (value: boolean) => void;
    vi.spyOn(BotWorkerClient.prototype, 'sam').mockImplementation(() => new Promise(resolve => { resolveSam = resolve; }));
    const engine = new HostGameEngine('offline-sam-worker', '', 'p0', 'p0', () => {});
    engine.addBot();
    engine.handleJoin({ id: 'p2', name: 'p2', isSpectator: false });
    engine.startGame();
    await vi.advanceTimersByTimeAsync(1750);
    expect(resolveSam).toBeDefined();
    engine.destroy();
    resolveSam(true);
    await Promise.resolve();
    expect(engine.getState().status).toBe('sam_calling');
    expect(engine.getState().samState?.samCallerId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['pause', 'waiting', 'destroy'])('worker trả muộn sau %s không được đánh vào bàn', async action => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(deck, 'dealCards').mockImplementation(ids => ({
      playerHands: Object.fromEntries(ids.map((id, i) => [id, Object.values(locFixture(12, 3))[i]])), remainingCards: [],
    }));
    let resolveMove!: (value: BotDecision) => void;
    vi.spyOn(BotWorkerClient.prototype, 'move').mockImplementation(() => new Promise(resolve => { resolveMove = resolve; }));
    const engine = new HostGameEngine('offline-worker', '', 'p0', 'p0', () => {});
    try {
      engine.addBot();
      engine.handleJoin({ id: 'p2', name: 'p2', isSpectator: false });
      engine.startGame();
      for (const player of engine.getState().players) engine.handleSkipSam(player.id);
      engine.handlePlayCards('p0', [engine.getPlayerHand('p0')[0]]);
      const bot = engine.getState().currentTurnPlayerId!;
      expect(engine.getState().players.find(p => p.id === bot)?.botVersion).toBe('monte-carlo');
      await vi.advanceTimersByTimeAsync(1200);
      expect(resolveMove).toBeDefined();
      const decision = new MonteCarloBrain(undefined, { budgetMs: 0 }).decideMove(bot, engine.getPlayerHand(bot), engine.getState());
      if (action === 'pause') engine.handleHistoryView('p0', true);
      if (action === 'waiting') engine.endRoundToWaiting();
      if (action === 'destroy') engine.destroy();
      const records = engine.getState().roundPlayRecords?.length;
      resolveMove(decision);
      await Promise.resolve();
      expect(engine.getState().roundPlayRecords?.length).toBe(records);
      expect(engine.getPlayerHand(bot)).toHaveLength(10);
    } finally { engine.destroy(); }
  });
});
