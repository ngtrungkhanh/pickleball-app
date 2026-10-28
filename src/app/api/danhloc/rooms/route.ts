import { NextResponse } from 'next/server';
import { RoomSummary } from '@/lib/loc-game/network-types';

// Lưu trữ danh sách phòng trong bộ nhớ Node.js dev/server
// Giúp đồng bộ hoàn hảo giữa các tab thường, tab ẩn danh, và điện thoại cùng mạng LAN
const globalRooms = new Map<string, RoomSummary>();

export async function GET() {
  const now = Date.now();
  // Dọn dẹp phòng quá 7 giây không gửi heartbeat
  for (const [id, r] of globalRooms.entries()) {
    if (now - r.updatedAt > 7000) {
      globalRooms.delete(id);
    }
  }

  return NextResponse.json({
    rooms: Array.from(globalRooms.values()),
  });
}

export async function POST(req: Request) {
  try {
    const room: RoomSummary = await req.json();
    if (room && room.id) {
      globalRooms.set(room.id, {
        ...room,
        updatedAt: Date.now(),
      });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('id');
    if (roomId) {
      globalRooms.delete(roomId);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
