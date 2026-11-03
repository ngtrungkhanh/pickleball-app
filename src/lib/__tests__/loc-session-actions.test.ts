import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blocked: false,
  rowCount: 1,
  queries: [] as string[],
  values: [] as unknown[][],
}));

vi.mock('@vercel/postgres', () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    mocks.queries.push(strings.join('?').replace(/\s+/g, ' ').trim());
    mocks.values.push(values);
    return { rows: [], rowCount: mocks.rowCount };
  }),
}));
vi.mock('../environment', () => ({
  shouldBlockPreviewWrites: () => mocks.blocked,
  previewWriteBlockedResult: () => ({ error: 'blocked' }),
}));

import {
  addLocRoundAction,
  deleteLocRoundAction,
  getLocSessionAction,
  getLocSessionsListAction,
  setLocSessionDeletedAction,
} from '@/app/actions-loc';
import { GET } from '@/app/api/loc/sync/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  mocks.blocked = false;
  mocks.rowCount = 1;
  mocks.queries = [];
  mocks.values = [];
});

describe('xóa mềm buổi tính điểm', () => {
  it('giữ nguyên các ván và tăng version khi xóa', async () => {
    expect(await setLocSessionDeletedAction('s1', true)).toEqual({ success: true });
    const index = mocks.queries.findIndex(q => q.startsWith('UPDATE'));
    expect(mocks.queries[index]).toContain('version = version + 1');
    expect(mocks.values[index]).toEqual(['deleted', 's1', false]);
    expect(mocks.queries.some(q => /^(DELETE|DROP|ALTER)/.test(q))).toBe(false);
  });

  it('khôi phục trạng thái trước khi xóa', async () => {
    expect(await setLocSessionDeletedAction('s1', false, 'closed')).toEqual({ success: true });
    expect(mocks.values.at(-1)).toEqual(['closed', 's1', true]);
  });

  it('báo lỗi nếu buổi không tồn tại hoặc đã bị thay đổi', async () => {
    mocks.rowCount = 0;
    expect(await setLocSessionDeletedAction('missing', true)).toHaveProperty('success', false);
  });

  it('giữ preview write guard cho cả xóa và khôi phục', async () => {
    mocks.blocked = true;
    expect(await setLocSessionDeletedAction('s1', true)).toEqual({ success: false, error: 'blocked' });
    expect(await setLocSessionDeletedAction('s1', false)).toEqual({ success: false, error: 'blocked' });
    expect(mocks.queries).toEqual([]);
  });

  it('không trả buổi đã xóa qua danh sách, link trực tiếp hoặc sync', async () => {
    await getLocSessionsListAction();
    expect(await getLocSessionAction('s1')).toEqual({ session: null, rounds: [] });
    const response = await GET(new NextRequest('http://localhost/api/loc/sync?sessionId=s1'));
    expect(response.status).toBe(404);
    const reads = mocks.queries.filter(q => q.startsWith('SELECT'));
    expect(reads).toHaveLength(3);
    expect(reads.every(q => q.includes("status <> 'deleted'"))).toBe(true);
  });

  it('từ chối thêm ván vào buổi đã xóa', async () => {
    mocks.rowCount = 0;
    expect(await addLocRoundAction('s1', 'p1', [{ loserId: 'p2', cards: 5 }])).toHaveProperty('success', false);
    expect(mocks.queries.find(q => q.startsWith('INSERT'))).toContain("status <> 'deleted'");
    expect(mocks.queries.some(q => q.startsWith('UPDATE'))).toBe(false);
  });

  it('không sửa các ván của buổi đã xóa từ tab cũ', async () => {
    await deleteLocRoundAction('r1', 's1');
    expect(mocks.queries.find(q => q.startsWith('DELETE'))).toContain("status <> 'deleted'");
  });
});
