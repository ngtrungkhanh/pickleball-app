import { Card, CardCombo, PlayerScoreDetail } from './types';

export type RoomStatus = 'waiting' | 'sam_calling' | 'playing' | 'round_ended';

export interface RoomSummary {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  updatedAt: number;
}

export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isSpectator: boolean;
  isBot?: boolean;
  cardsRemaining: number;
  hasPassed: boolean;
  isReady?: boolean;
}

export interface TableState {
  roomId: string;
  roomName: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  spectators: RoomPlayer[];
  currentTurnPlayerId: string | null;
  roundLeaderPlayerId: string | null;
  turnDeadline: number | null; // Timestamp đếm ngược 30s cho mỗi lượt đánh
  lastPlay: { playerId: string; playerName: string; combo: CardCombo } | null;
  samState: {
    samCallerId: string | null;
    samCallerName: string | null;
    skipPlayerIds: string[];
    deadline: number | null; // Timestamp đếm ngược 60s
  } | null;
  playHistory: {
    id: string;
    text: string;
    timestamp: number;
  }[];
  roundResult: Record<string, PlayerScoreDetail> | null;
}

/**
 * Các sự kiện Broadcast giữa Client và Host
 */
export type BroadcastEvent =
  // LOBBY EVENTS
  | { type: 'LOBBY_ANNOUNCE'; room: RoomSummary }
  | { type: 'LOBBY_CLOSE'; roomId: string }

  // ROOM EVENTS: Client -> Host
  | { type: 'JOIN_ROOM'; roomId: string; player: { id: string; name: string; isSpectator: boolean }; forceClaim?: boolean }
  | { type: 'LEAVE_ROOM'; roomId: string; playerId: string }
  | { type: 'PLAYER_READY'; roomId: string; playerId: string; isReady: boolean }
  | { type: 'END_ROUND_WAITING'; roomId: string }
  | { type: 'ADD_BOT'; roomId: string }
  | { type: 'REMOVE_BOT'; roomId: string; botId: string }
  | { type: 'START_GAME'; roomId: string; hostId: string }
  | { type: 'NEXT_ROUND'; roomId: string; hostId: string }
  | { type: 'CALL_SAM'; roomId: string; playerId: string }
  | { type: 'SKIP_SAM'; roomId: string; playerId: string }
  | { type: 'PLAY_CARDS'; roomId: string; playerId: string; cards: Card[] }
  | { type: 'PASS_TURN'; roomId: string; playerId: string }

  // ROOM EVENTS: Host -> Clients
  | { type: 'SYNC_TABLE_STATE'; roomId: string; state: TableState }
  | { type: 'SYNC_HAND'; roomId: string; targetPlayerId: string; hand: Card[] }
  | { type: 'NAME_EXISTS_CONFIRM'; roomId: string; targetPlayerId: string; existingName: string }
  | { type: 'KICKED_TAKEOVER'; roomId: string; targetPlayerId: string; reason: string }
  | { type: 'ROOM_CLOSED'; roomId: string; reason: string };
