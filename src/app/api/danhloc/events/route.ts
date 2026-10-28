import { NextResponse } from 'next/server';
import { BroadcastEvent } from '@/lib/loc-game/network-types';

interface StoredEvent {
  id: string;
  roomId: string;
  event: BroadcastEvent;
  timestamp: number;
}

// Lưu trữ hàng đợi sự kiện tạm thời trong bộ nhớ RAM của server
// Giữ tối đa 100 sự kiện gần nhất cho mỗi phòng
const roomEventsMap = new Map<string, StoredEvent[]>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId') || 'loc_lobby';
  const since = parseInt(searchParams.get('since') || '0', 10);

  const events = roomEventsMap.get(roomId) || [];
  // Lọc lấy các events xảy ra sau mốc `since`
  const newEvents = events.filter((e) => e.timestamp > since);

  return NextResponse.json({
    events: newEvents,
    serverTime: Date.now(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roomId = 'loc_lobby', event } = body;

    if (!event) {
      return NextResponse.json({ success: false, error: 'Missing event' }, { status: 400 });
    }

    const currentEvents = roomEventsMap.get(roomId) || [];
    const storedItem: StoredEvent = {
      id: Math.random().toString(36).substring(2, 9),
      roomId,
      event,
      timestamp: Date.now(),
    };

    currentEvents.push(storedItem);
    // Giới hạn 100 sự kiện gần nhất
    if (currentEvents.length > 100) {
      currentEvents.shift();
    }
    roomEventsMap.set(roomId, currentEvents);

    // Dọn dẹp các phòng cũ quá 1 tiếng
    if (roomEventsMap.size > 50) {
      const now = Date.now();
      for (const [rId, evts] of roomEventsMap.entries()) {
        const lastEvt = evts[evts.length - 1];
        if (lastEvt && now - lastEvt.timestamp > 3600000) {
          roomEventsMap.delete(rId);
        }
      }
    }

    return NextResponse.json({ success: true, timestamp: storedItem.timestamp });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
