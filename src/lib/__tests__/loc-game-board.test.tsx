// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LocGameBoard } from '@/components/loc-game/LocGameBoard';
import { TableState } from '../loc-game/network-types';
import { hasAnyPlayableMove } from '../loc-game/smart-hint';
import { HostGameEngine } from '../loc-game/network';

vi.mock('../loc-game/loc-sync', () => ({
  createSessionForRoom: vi.fn(async () => null),
  syncRoundToLocSession: vi.fn(async () => true),
}));
vi.mock('../loc-game/smart-hint', () => ({ hasAnyPlayableMove: vi.fn(() => false) }));
vi.mock('../loc-game/bot', () => ({ BotBrain: class {
  getTracker() { return { recordPlay() {}, reset() {} }; }
  decideMove() { return null; }
}, getBotHintForSelection: () => [] }));

const card = { id: '3_spades', rank: 3, suit: 'spades' } as const;
const table: TableState = {
  roomId: 'test', roomName: 'Test', hostId: 'other', status: 'playing',
  players: ['me', 'other'].map(id => ({ id, name: id, isHost: id === 'other', isSpectator: false, cardsRemaining: 1, hasPassed: false })),
  spectators: [], currentTurnPlayerId: 'me', roundLeaderPlayerId: 'other', turnDeadline: null,
  lastPlay: { playerId: 'other', playerName: 'other', combo: { type: 'SINGLE', cards: [{ id: '15_spades', rank: 15, suit: 'spades' }], highestRank: 15, length: 1 } },
  samState: null, playHistory: [], roundResult: null,
};
const props = () => ({ tableState: table, myPlayerId: 'me', myHand: [card], isSpectator: false,
  onPassTurn: vi.fn(), onPlayCards: vi.fn(), onCallSam: vi.fn(), onSkipSam: vi.fn(), onStartGame: vi.fn(), onLeaveRoom: vi.fn() });

beforeEach(() => { vi.useFakeTimers(); vi.mocked(hasAnyPlayableMove).mockReturnValue(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Lốc auto bỏ lượt', () => {
  it('ẩn nút bỏ qua và tự bỏ lượt đúng sau 2 giây khi không có bài chặn', () => {
    const p = props(); const view = render(<LocGameBoard {...p} />);
    expect(view.queryByRole('button', { name: 'Cho Qua' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Sắp Xếp' })).toBeNull();
    act(() => { vi.advanceTimersByTime(1999); });
    expect(p.onPassTurn).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(p.onPassTurn).toHaveBeenCalledTimes(1);
  });
  it('hủy auto bỏ lượt khi đã chuyển sang người khác', () => {
    const p = props(); const view = render(<LocGameBoard {...p} />);
    act(() => { vi.advanceTimersByTime(250); });
    view.rerender(<LocGameBoard {...p} tableState={{ ...table, currentTurnPlayerId: 'other' }} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(p.onPassTurn).not.toHaveBeenCalled();
  });
  it('không tự bỏ khi có bài chặn hoặc đang mở vòng', () => {
    const p = props(); vi.mocked(hasAnyPlayableMove).mockReturnValue(true);
    const view = render(<LocGameBoard {...p} />);
    act(() => { vi.advanceTimersByTime(2100); });
    vi.mocked(hasAnyPlayableMove).mockReturnValue(false);
    view.rerender(<LocGameBoard {...p} tableState={{ ...table, lastPlay: null }} />);
    act(() => { vi.advanceTimersByTime(2100); });
    expect(p.onPassTurn).not.toHaveBeenCalled();
  });
  it('đóng lịch sử mới tiếp tục phần delay còn lại, không tính thời gian tạm dừng', () => {
    const p = { ...props(), onHistoryViewChange: vi.fn() };
    const view = render(<LocGameBoard {...p} />);
    act(() => { vi.advanceTimersByTime(700); });
    fireEvent.click(view.getByTitle('Bấm để xem toàn bộ lịch sử đánh bài của ván này'));
    expect(p.onHistoryViewChange).toHaveBeenLastCalledWith(true);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(p.onPassTurn).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Đóng' }));
    expect(p.onHistoryViewChange).toHaveBeenLastCalledWith(false);
    act(() => { vi.advanceTimersByTime(1299); });
    expect(p.onPassTurn).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(p.onPassTurn).toHaveBeenCalledTimes(1);
  });
  it('bản cập nhật đồng hồ không kéo dài delay auto bỏ lượt', () => {
    const p = props(); const view = render(<LocGameBoard {...p} />);
    act(() => { vi.advanceTimersByTime(1000); });
    view.rerender(<LocGameBoard {...p} onPassTurn={() => p.onPassTurn()} tableState={{ ...table, lastPlay: { ...table.lastPlay! } }} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(p.onPassTurn).toHaveBeenCalledTimes(1);
  });
  it('nút Back đóng lịch sử và bỏ yêu cầu tạm dừng', () => {
    const p = { ...props(), onHistoryViewChange: vi.fn() };
    const view = render(<LocGameBoard {...p} />);
    fireEvent.click(view.getByTitle('Bấm để xem toàn bộ lịch sử đánh bài của ván này'));
    expect(p.onHistoryViewChange).toHaveBeenLastCalledWith(true);
    fireEvent.popState(window);
    expect(view.queryByRole('heading', { name: 'Lịch Sử Đánh Bài Ván Này' })).toBeNull();
    expect(p.onHistoryViewChange).toHaveBeenLastCalledWith(false);
  });
});

describe('Lốc cập nhật ghế khi thêm người', () => {
  it.each(['bot', 'player'])('hiện đủ 5 ghế khi thêm %s vào bàn 4 người', (kind) => {
    let published: TableState | null = null;
    const engine = new HostGameEngine('offline-seats', 'Test', 'me', 'me', event => {
      if (event.type === 'SYNC_TABLE_STATE') published = event.state;
    });
    try {
      engine.addBot();
      engine.addBot();
      engine.addBot();
      const p = props();
      const view = render(<LocGameBoard {...p} tableState={engine.getState()} />);
      expect(view.container.querySelectorAll('.loc-opponent-avatar')).toHaveLength(3);

      if (kind === 'bot') engine.addBot();
      else engine.handleJoin({ id: 'fifth', name: 'Người thứ năm', isSpectator: false });
      expect(published).not.toBeNull();
      view.rerender(<LocGameBoard {...p} tableState={published!} />);
      expect(view.container.querySelectorAll('.loc-opponent-avatar')).toHaveLength(4);

      engine.removeBot(engine.getState().players.find(player => player.isBot)!.id);
      view.rerender(<LocGameBoard {...p} tableState={published!} />);
      expect(view.container.querySelectorAll('.loc-opponent-avatar')).toHaveLength(3);
      engine.addBot();
      view.rerender(<LocGameBoard {...p} tableState={published!} />);
      expect(view.container.querySelectorAll('.loc-opponent-avatar')).toHaveLength(4);
    } finally {
      engine.destroy();
    }
  });
});
