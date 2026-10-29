import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostGameEngine } from '../loc-game/network';
import * as deck from '../loc-game/deck';
import { Card, Rank, Suit } from '../loc-game/types';

vi.mock('../loc-game/loc-sync', () => ({
  createSessionForRoom: vi.fn(async () => null),
  syncRoundToLocSession: vi.fn(async () => true),
}));
vi.mock('../loc-game/bot', () => ({ BotBrain: class {
  getTracker() { return { recordPlay() {}, reset() {} }; }
  decideSamCall() { return false; }
  decideMove(_id: string, hand: Card[]) { return { action: 'PLAY', cards: [hand[hand.length - 1]] }; }
} }));

const engines: HostGameEngine[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(deck, 'dealCards').mockImplementation(ids => {
    const ranks: Rank[] = [3, 4, 5, 6, 8, 9, 10, 11, 13, 14];
    const suits: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
    return {
      playerHands: Object.fromEntries(ids.map((id, player) => [id, ranks.map((rank, i) => {
        const suit = suits[(i + player) % 4];
        return { id: `${rank}_${suit}`, rank, suit };
      })])), remainingCards: [],
    };
  });
});
afterEach(() => { engines.splice(0).forEach(engine => engine.destroy()); vi.restoreAllMocks(); vi.useRealTimers(); });

function start(withBot = false) {
  const engine = new HostGameEngine('offline-pause', 'Test', 'me', 'me', () => {});
  engines.push(engine);
  if (withBot) engine.addBot('legacy');
  else engine.handleJoin({ id: 'p2', name: 'p2', isSpectator: false });
  engine.handleJoin({ id: 'p3', name: 'p3', isSpectator: false });
  engine.startGame();
  for (const player of engine.getState().players) engine.handleSkipSam(player.id);
  expect(engine.getState().status).toBe('playing');
  return engine;
}

describe('Tạm dừng ván khi xem lịch sử', () => {
  it('giữ nguyên thời gian và chỉ tiếp tục khi tất cả người xem đã đóng', () => {
    const engine = start();
    vi.advanceTimersByTime(4000);
    engine.handleHistoryView('me', true);
    engine.handleHistoryView('me', true); // gói tin trùng không thêm lượt giữ
    engine.handleHistoryView('p2', true);
    expect(engine.getState().historyPause?.viewerIds).toEqual(['me', 'p2']);
    expect(engine.getState().historyPause?.remainingTurnMs).toBe(26000);
    expect(engine.getState().turnDeadline).toBeNull();
    vi.advanceTimersByTime(120000);
    expect(engine.getState().currentTurnPlayerId).toBe('me');
    expect(engine.getPlayerHand('me')).toHaveLength(10);
    engine.handleHistoryView('me', false);
    expect(engine.getState().historyPause?.viewerIds).toEqual(['p2']);
    engine.handleHistoryView('p2', false);
    expect(engine.getState().historyPause).toBeUndefined();
    expect(engine.getState().turnDeadline).toBe(Date.now() + 26000);
    vi.advanceTimersByTime(25999);
    expect(engine.getState().currentTurnPlayerId).toBe('me');
    vi.advanceTimersByTime(1);
    expect(engine.getState().currentTurnPlayerId).toBe('p2');
  });
  it('dừng cả bot và từ chối đánh/bỏ lượt trong thời gian tạm dừng', () => {
    const engine = start(true);
    engine.handlePlayCards('me', [engine.getPlayerHand('me')[0]]);
    const bot = engine.getState().currentTurnPlayerId!;
    expect(bot).not.toBe('me');
    vi.advanceTimersByTime(400);
    engine.handleHistoryView('me', true);
    expect(engine.getState().historyPause?.remainingBotMs).toBe(800);
    engine.handlePlayCards(bot, [engine.getPlayerHand(bot).at(-1)!]);
    engine.handlePassTurn(bot);
    vi.advanceTimersByTime(120000);
    expect(engine.getState().currentTurnPlayerId).toBe(bot);
    expect(engine.getPlayerHand(bot)).toHaveLength(10);
    engine.handleHistoryView('me', false);
    vi.advanceTimersByTime(799);
    expect(engine.getState().currentTurnPlayerId).toBe(bot);
    vi.advanceTimersByTime(1);
    expect(engine.getState().currentTurnPlayerId).toBe('p3');
    expect(engine.getPlayerHand(bot)).toHaveLength(9);
  });
  it('khán giả không dừng được bàn và về phòng chờ xóa trạng thái tạm dừng', () => {
    const engine = start();
    engine.handleHistoryView('spectator', true);
    expect(engine.getState().historyPause).toBeUndefined();
    engine.handleHistoryView('me', true);
    engine.endRoundToWaiting();
    engine.handleHistoryView('me', false);
    vi.advanceTimersByTime(60000);
    expect(engine.getState().status).toBe('waiting');
    expect(engine.getState().historyPause).toBeUndefined();
    expect(engine.getState().turnDeadline).toBeNull();
  });
  it('người rời bàn không để lại trạng thái tạm dừng bị kẹt', () => {
    const engine = start();
    engine.handleHistoryView('p2', true);
    engine.handleLeave('p2');
    expect(engine.getState().status).toBe('waiting');
    expect(engine.getState().historyPause).toBeUndefined();
  });
});
