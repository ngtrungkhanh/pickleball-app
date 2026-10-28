import { describe, it, expect, vi } from 'vitest';
import { HostGameEngine } from '../loc-game/network';
import { BroadcastEvent } from '../loc-game/network-types';

vi.mock('../loc-game/loc-sync', () => ({
  createSessionForRoom: vi.fn(async () => null),
  syncRoundToLocSession: vi.fn(async () => true),
}));

describe('HostGameEngine State & Network Protocol', () => {
  it('phát danh sách người chơi độc lập khi thêm người trực tiếp trên máy host', () => {
    const sentEvents: BroadcastEvent[] = [];
    const engine = new HostGameEngine('offline-roster', 'Test', 'host', 'Host', event => sentEvents.push(event));
    try {
      engine.addBot();
      const first = sentEvents.find(event => event.type === 'SYNC_TABLE_STATE');
      expect(first?.type).toBe('SYNC_TABLE_STATE');
      if (first?.type !== 'SYNC_TABLE_STATE') throw new Error('Missing table state');
      engine.addBot();
      const latest = sentEvents.filter(event => event.type === 'SYNC_TABLE_STATE').at(-1);
      if (latest?.type !== 'SYNC_TABLE_STATE') throw new Error('Missing updated table state');
      expect(first.state.players).toHaveLength(2);
      expect(latest.state.players).toHaveLength(3);
      expect(latest.state.players).not.toBe(first.state.players);
      expect(latest.state.players[0]).not.toBe(engine.getState().players[0]);
    } finally {
      engine.destroy();
    }
  });

  it('quản lý vòng đời phòng chơi từ Lobby đến Kết thúc ván', () => {
    const sentEvents: BroadcastEvent[] = [];
    const mockSend = vi.fn((e: BroadcastEvent) => {
      sentEvents.push(e);
    });

    const engine = new HostGameEngine('room-1', 'Bàn 1', 'host-1', 'Chủ phòng', mockSend);

    // 1. Kiểm tra ban đầu có Host
    expect(engine.getState().players).toHaveLength(1);
    expect(engine.getState().players[0].name).toBe('Chủ phòng');

    // 2. Thêm 2 người chơi nữa để đủ 3 người
    engine.handleJoin({ id: 'p2', name: 'Người chơi 2', isSpectator: false });
    engine.handleJoin({ id: 'p3', name: 'Người chơi 3', isSpectator: false });
    expect(engine.getState().players).toHaveLength(3);

    // Thêm 1 khán giả (Spectator)
    engine.handleJoin({ id: 'spec-1', name: 'Khán giả 1', isSpectator: true });
    expect(engine.getState().spectators).toHaveLength(1);

    // 3. Host bấm Bắt đầu ván
    engine.startGame();
    expect(engine.getState().status).toBe('sam_calling');

    // Mỗi người nhận được đúng 10 lá
    expect(engine.getPlayerHand('host-1')).toHaveLength(10);
    expect(engine.getPlayerHand('p2')).toHaveLength(10);
    expect(engine.getPlayerHand('p3')).toHaveLength(10);

    // 4. Cả 3 người chơi bấm Skip Sam
    engine.handleSkipSam('host-1');
    engine.handleSkipSam('p2');
    engine.handleSkipSam('p3');

    // Tự động chuyển sang playing
    expect(engine.getState().status).toBe('playing');
    expect(engine.getState().currentTurnPlayerId).toBe('host-1');

    // 5. Host đánh bài: lấy 1 lá nhỏ nhất đánh ra
    const hostHand = engine.getPlayerHand('host-1');
    const firstCard = hostHand[0];
    engine.handlePlayCards('host-1', [firstCard]);

    // Host còn 9 lá, lượt chuyển sang p2
    expect(engine.getPlayerHand('host-1')).toHaveLength(9);
    expect(engine.getState().currentTurnPlayerId).toBe('p2');

    // 6. p2 bỏ lượt, p3 bỏ lượt -> host được ăn vòng, bắt đầu vòng mới
    engine.handlePassTurn('p2');
    engine.handlePassTurn('p3');

    expect(engine.getState().lastPlay).toBeNull(); // Reset vòng
    expect(engine.getState().currentTurnPlayerId).toBe('host-1');
  });
});
