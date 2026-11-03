// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocLobby } from '@/components/loc/LocLobby';
import type { LocSession } from '@/lib/loc-core';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));

const session: LocSession = {
  id: 's1', title: 'Buổi chơi thử', players: [], version: 1, status: 'active',
  createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z',
};
const props = () => ({
  sessions: [session], availableClubPlayers: [],
  onSelectSession: vi.fn().mockResolvedValue(undefined),
  onCreateSession: vi.fn(), onDeleteSession: vi.fn().mockResolvedValue(undefined),
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('danh sách tính điểm', () => {
  it('hiện trạng thái tải ngay và chặn bấm lặp khi đang mở', async () => {
    let finish!: () => void;
    const p = props();
    p.onSelectSession.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<LocLobby {...p} />);
    const button = screen.getByRole('button', { name: /^Buổi chơi thử/ });
    fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Đang mở buổi chơi');
    fireEvent.click(button);
    expect(p.onSelectSession).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'));
  });

  it('hiện lỗi mở buổi chơi và cho phép thử lại', async () => {
    const p = props();
    p.onSelectSession.mockRejectedValue(new Error('Mất kết nối'));
    render(<LocLobby {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /^Buổi chơi thử/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('Mất kết nối');
  });

  it('hủy xác nhận không xóa; xóa không mở buổi và có thể hoàn tác', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const p = props();
    render(<LocLobby {...p} />);
    const deleteButton = screen.getByRole('button', { name: 'Xóa buổi chơi Buổi chơi thử' });
    fireEvent.click(deleteButton);
    expect(p.onDeleteSession).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(deleteButton);
    await screen.findByRole('button', { name: 'Hoàn tác' });
    expect(p.onDeleteSession).toHaveBeenCalledWith(session, true);
    expect(p.onSelectSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(p.onDeleteSession).toHaveBeenCalledWith(session, false));
  });
});
