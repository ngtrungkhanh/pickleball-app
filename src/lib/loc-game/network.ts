import { getSupabaseClient } from './supabase';
import { BroadcastEvent, TableState, RoomSummary, RoundPlayRecord } from './network-types';
import { dealCards } from './deck';
import { analyzeCombo, canBeat, hasHigherSingleCard, checkInstantWin } from './analyzer';
import { calculateRoundScores, ChopEvent } from './scoring';
import { Card } from './types';
import { BotBrain } from './bot';
import { RoundDebugLog, CompletedRoundSummary } from './debug-types';
import { saveRoundDebugLog } from './debug-storage';
import { createSessionForRoom, syncRoundToLocSession } from './loc-sync';

type EventCallback = (event: BroadcastEvent) => void;

interface ChannelSubscription {
  unsubscribe: () => void;
}

/**
 * Tạo kênh kết nối Broadcast qua Supabase hoặc Fallback sang Local Relay (BroadcastChannel + HTTP Server Relay)
 */
function createBroadcastTransport(channelName: string, onEvent: EventCallback): {
  send: (event: BroadcastEvent) => void;
  unsubscribe: () => void;
} {
  const supabase = getSupabaseClient();

  if (supabase) {
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'loc_msg' }, ({ payload }) => {
        onEvent(payload as BroadcastEvent);
      })
      .subscribe();

    return {
      send: (event: BroadcastEvent) => {
        channel.send({
          type: 'broadcast',
          event: 'loc_msg',
          payload: event,
        });
      },
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  }

  // Fallback: Local Relay (Kết hợp BroadcastChannel siêu nhanh + HTTP API hỗ trợ trình duyệt khác & mạng LAN)
  const processedEventIds = new Set<string>();
  let lastServerTime = Date.now();
  let pollInterval: NodeJS.Timeout | null = null;
  let isUnsubscribed = false;

  const dispatchEvent = (event: BroadcastEvent, eventId?: string) => {
    if (eventId) {
      if (processedEventIds.has(eventId)) return;
      processedEventIds.add(eventId);
      // Giới hạn bộ nhớ cache id
      if (processedEventIds.size > 200) {
        const first = processedEventIds.values().next().value;
        if (first) processedEventIds.delete(first);
      }
    }
    onEvent(event);
  };

  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    bc = new BroadcastChannel(channelName);
    bc.onmessage = (msg) => {
      const { event, eventId } = msg.data || {};
      if (event) {
        dispatchEvent(event, eventId);
      }
    };
  }

  // HTTP Polling mỗi 400ms để nhận sự kiện từ các trình duyệt khác hoặc mạng LAN
  if (typeof window !== 'undefined') {
    const pollEvents = async () => {
      if (isUnsubscribed) return;
      try {
        const res = await fetch(`/api/danhloc/events?roomId=${encodeURIComponent(channelName)}&since=${lastServerTime}`);
        if (res.ok) {
          const data = await res.json();
          if (data.serverTime) {
            lastServerTime = data.serverTime;
          }
          if (Array.isArray(data.events)) {
            data.events.forEach((item: { id: string; event: BroadcastEvent }) => {
              dispatchEvent(item.event, item.id);
            });
          }
        }
      } catch {
        // ignore network error
      }
    };

    pollInterval = setInterval(pollEvents, 400);
  }

  return {
    send: (event: BroadcastEvent) => {
      const eventId = Math.random().toString(36).substring(2, 9);
      // Đánh dấu để chính máy này không tự nhận lại từ polling
      processedEventIds.add(eventId);

      // 1. Bắn qua BroadcastChannel cho các tab cùng trình duyệt
      if (bc) {
        try {
          bc.postMessage({ event, eventId });
        } catch {
          // ignore
        }
      }

      // 2. Gửi lên HTTP Server Relay cho các trình duyệt khác / tab ẩn danh / LAN
      if (typeof window !== 'undefined') {
        fetch('/api/danhloc/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: channelName, event }),
        }).catch(() => {});
      }
    },
    unsubscribe: () => {
      isUnsubscribed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (bc) bc.close();
    },
  };
}

export function subscribeLobby(onEvent: EventCallback): ChannelSubscription & { send: (e: BroadcastEvent) => void } {
  return createBroadcastTransport('loc_lobby', onEvent);
}

export function subscribeRoom(roomId: string, onEvent: EventCallback): ChannelSubscription & { send: (e: BroadcastEvent) => void } {
  return createBroadcastTransport(`loc_room_${roomId}`, onEvent);
}

/**
 * State Manager máy Host (Giữ cờ sự thật)
 */
export class HostGameEngine {
  private state: TableState;
  private hands: Record<string, Card[]> = {};
  private initialHands: Record<string, Card[]> = {};
  private cardsPlayedCount: Record<string, number> = {};
  private chopEvents: ChopEvent[] = [];
  private lastPlayedCardsOfWinner: Card[] = [];
  private sendFn: (event: BroadcastEvent) => void;
  private lobbySendFn?: (event: BroadcastEvent) => void;
  private announceInterval: NodeJS.Timeout | null = null;
  private samTimer: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private botTurnDeadline: number | null = null;
  private previousWinnerId: string | null = null;
  private bots: Map<string, BotBrain> = new Map();
  private botTimers: Map<string, NodeJS.Timeout> = new Map();
  private potentialDenLang: { attackerId: string; targetBaoId: string } | null = null;
  private roundIndex = 0;
  private completedRounds: CompletedRoundSummary[] = [];
  private currentRoundDebugLog: RoundDebugLog | null = null;
  private locSessionId: string | null = null;

  constructor(
    roomId: string,
    roomName: string,
    hostId: string,
    hostName: string,
    sendFn: (event: BroadcastEvent) => void,
    lobbySendFn?: (event: BroadcastEvent) => void
  ) {
    this.sendFn = sendFn;
    this.lobbySendFn = lobbySendFn;
    this.state = {
      roomId,
      roomName,
      hostId,
      status: 'waiting',
      players: [
        {
          id: hostId,
          name: hostName,
          isHost: true,
          isSpectator: false,
          cardsRemaining: 0,
          hasPassed: false,
          isReady: false,
        },
      ],
      spectators: [],
      currentTurnPlayerId: null,
      roundLeaderPlayerId: null,
      turnDeadline: null,
      lastPlay: null,
      recentPlays: [],
      roundPlayRecords: [],
      samState: null,
      playHistory: [],
      roundResult: null,
      completedRounds: [],
      locSessionId: null,
    };
    void this.ensureLocSession();
  }

  private async ensureLocSession(): Promise<string | null> {
    if (this.locSessionId) return this.locSessionId;
    const players = this.state.players.map((p) => ({ id: p.id, name: p.name }));
    const sid = await createSessionForRoom(this.state.roomName, players);
    if (sid) {
      this.locSessionId = sid;
      this.state.locSessionId = sid;
      this.broadcastState();
    }
    return sid;
  }

  public getState(): TableState {
    return this.state;
  }

  public getPlayerHand(playerId: string): Card[] {
    return this.hands[playerId] || [];
  }

  /**
   * Thêm người chơi Bot vào phòng (tối đa 5 người)
   */
  public addBot(): void {
    if (this.state.status !== 'waiting') return;
    if (this.state.players.length >= 5) return;

    const botIndex = this.state.players.filter((p) => p.isBot).length + 1;
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const botNames = ['Bot Gà Con 🐣', 'Bot Sát Thủ ⚡', 'Bot Thần Bài 🃏', 'Bot Bá Đạo 🔥'];
    const botName = botNames[(botIndex - 1) % botNames.length] || `Bot ${botIndex}`;

    this.state.players.push({
      id: botId,
      name: botName,
      isHost: false,
      isSpectator: false,
      isBot: true,
      cardsRemaining: 0,
      hasPassed: false,
      isReady: true,
    });

    this.bots.set(botId, new BotBrain());
    this.broadcastState();
  }

  /**
   * Xóa Bot khỏi phòng
   */
  public removeBot(botId: string): void {
    if (this.state.status !== 'waiting') return;
    this.state.players = this.state.players.filter((p) => p.id !== botId);
    this.bots.delete(botId);
    const timer = this.botTimers.get(botId);
    if (timer) {
      clearTimeout(timer);
      this.botTimers.delete(botId);
    }
    this.broadcastState();
  }

  private clearAllBotTimers(): void {
    for (const [, timer] of this.botTimers) {
      clearTimeout(timer);
    }
    this.botTimers.clear();
  }

  /**
   * Khởi chạy phát sóng danh sách phòng ra Lobby
   */
  public startLobbyAnnounce() {
    this.stopLobbyAnnounce();

    const announce = () => {
      const summary = this.getSummary();
      // 1. Gửi qua kênh broadcast lobby
      if (this.lobbySendFn) {
        this.lobbySendFn({
          type: 'LOBBY_ANNOUNCE',
          room: summary,
        });
      }
      // 2. Gửi qua HTTP endpoint (hỗ trợ tab ẩn danh và các thiết bị cùng mạng LAN)
      if (typeof window !== 'undefined') {
        fetch('/api/danhloc/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(summary),
        }).catch(() => {});
      }
    };

    // Phát sóng ngay lập tức phát đầu tiên
    announce();
    this.announceInterval = setInterval(announce, 2000);
  }

  public stopLobbyAnnounce() {
    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
    }
    if (this.lobbySendFn) {
      this.lobbySendFn({
        type: 'LOBBY_CLOSE',
        roomId: this.state.roomId,
      });
    }
    if (typeof window !== 'undefined') {
      fetch(`/api/danhloc/rooms?id=${this.state.roomId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }

  public getSummary(): RoomSummary {
    return {
      id: this.state.roomId,
      name: this.state.roomName,
      hostId: this.state.hostId,
      hostName: this.state.players.find((p) => p.isHost)?.name || 'Host',
      playerCount: this.state.players.length,
      maxPlayers: 5,
      status: this.state.status,
      updatedAt: Date.now(),
    };
  }

  private broadcastState() {
    this.sendFn({
      type: 'SYNC_TABLE_STATE',
      roomId: this.state.roomId,
      // Host dispatches locally without serialization; publish fresh roster
      // references so React derives the seats again after joins/addBot.
      state: {
        ...this.state,
        players: this.state.players.map(player => ({ ...player })),
        spectators: this.state.spectators.map(player => ({ ...player })),
      },
    });
  }

  private sendHandToPlayer(playerId: string) {
    this.sendFn({
      type: 'SYNC_HAND',
      roomId: this.state.roomId,
      targetPlayerId: playerId,
      hand: this.hands[playerId] || [],
    });
  }

  /**
   * Xử lý khi có người xin vào phòng (hỗ trợ đổi thiết bị nếu trùng tên)
   */
  public handleJoin(player: { id: string; name: string; isSpectator: boolean }, forceClaim?: boolean): void {
    if (player.isSpectator) {
      if (!this.state.spectators.some((s) => s.id === player.id)) {
        this.state.spectators.push({
          id: player.id,
          name: player.name,
          isHost: false,
          isSpectator: true,
          cardsRemaining: 0,
          hasPassed: false,
        });
      }
      this.broadcastState();
      return;
    }

    const trimmedName = player.name.trim().toLowerCase();
    const existingSameNameIndex = this.state.players.findIndex(
      (p) => p.name.trim().toLowerCase() === trimmedName && p.id !== player.id
    );

    if (existingSameNameIndex !== -1) {
      const existingSameNamePlayer = this.state.players[existingSameNameIndex];

      if (!forceClaim) {
        // Gửi thông báo xác nhận đổi thiết bị cho client mới
        this.sendFn({
          type: 'NAME_EXISTS_CONFIRM',
          roomId: this.state.roomId,
          targetPlayerId: player.id,
          existingName: existingSameNamePlayer.name,
        });
        return;
      }

      // XÁC NHẬN ĐỔI MÁY (TAKEOVER):
      const oldId = existingSameNamePlayer.id;

      // 1. Đá máy cũ ra ngoài
      this.sendFn({
        type: 'KICKED_TAKEOVER',
        roomId: this.state.roomId,
        targetPlayerId: oldId,
        reason: 'Tài khoản của bạn đã được đăng nhập từ thiết bị khác.',
      });

      // 2. Chuyển quyền Host nếu người cũ là Host
      const wasHost = existingSameNamePlayer.isHost;
      if (wasHost) {
        this.state.hostId = player.id;
      }

      // 3. Thay ID trong mảng người chơi
      this.state.players[existingSameNameIndex] = {
        ...existingSameNamePlayer,
        id: player.id,
        name: player.name,
        isHost: wasHost,
      };

      // 4. Chuyển giao bài trên tay
      if (this.hands[oldId]) {
        this.hands[player.id] = this.hands[oldId];
        delete this.hands[oldId];
      }
      if (this.initialHands[oldId]) {
        this.initialHands[player.id] = this.initialHands[oldId];
        delete this.initialHands[oldId];
      }
      if (this.cardsPlayedCount[oldId] !== undefined) {
        this.cardsPlayedCount[player.id] = this.cardsPlayedCount[oldId];
        delete this.cardsPlayedCount[oldId];
      }

      // 5. Chuyển giao lượt chơi nếu đang đến lượt người cũ
      if (this.state.currentTurnPlayerId === oldId) {
        this.state.currentTurnPlayerId = player.id;
      }
      if (this.state.roundLeaderPlayerId === oldId) {
        this.state.roundLeaderPlayerId = player.id;
      }
      if (this.state.lastPlay && this.state.lastPlay.playerId === oldId) {
        this.state.lastPlay.playerId = player.id;
      }
      if (this.state.samState && this.state.samState.samCallerId === oldId) {
        this.state.samState.samCallerId = player.id;
      }
      if (this.state.samState && this.state.samState.skipPlayerIds.includes(oldId)) {
        this.state.samState.skipPlayerIds = this.state.samState.skipPlayerIds.map((id) =>
          id === oldId ? player.id : id
        );
      }

      this.state.playHistory.push({
        id: Math.random().toString(),
        text: `🔄 ${player.name} đã chuyển sang thiết bị mới.`,
        timestamp: Date.now(),
      });

      // Gửi lại bài cho máy mới
      this.sendHandToPlayer(player.id);
      this.broadcastState();
      return;
    }

    // Người chơi thường mới
    const existing = this.state.players.find((p) => p.id === player.id);
    if (!existing) {
      if (this.state.players.length >= 5) {
        return this.handleJoin({ ...player, isSpectator: true });
      }
      this.state.players.push({
        id: player.id,
        name: player.name,
        isHost: player.id === this.state.hostId,
        isSpectator: false,
        cardsRemaining: 0,
        hasPassed: false,
        isReady: false,
      });
    }

    this.broadcastState();
  }

  /**
   * Xử lý người rời phòng
   */
  public handleLeave(playerId: string) {
    this.state.historyPause = undefined;
    const leaver = this.state.players.find((p) => p.id === playerId) || this.state.spectators.find((s) => s.id === playerId);
    const leaverName = leaver?.name || 'Một người chơi';

    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    this.state.spectators = this.state.spectators.filter((s) => s.id !== playerId);

    // Dừng ván đang chơi và đưa tất cả người còn lại về phòng chờ (waiting)
    this.stopTurnTimer();
    this.clearAllBotTimers();
    this.state.turnDeadline = null;
    this.state.currentTurnPlayerId = null;
    this.state.lastPlay = null;
    this.state.recentPlays = [];
    this.state.roundPlayRecords = [];

    this.state.roundResult = null;
    this.state.samState = null;
    this.state.status = 'waiting';

    // Reset trạng thái sẵn sàng của những người còn lại
    for (const p of this.state.players) {
      p.isReady = p.isBot ? true : false;
      p.cardsRemaining = 0;
      p.hasPassed = false;
    }

    this.state.playHistory.push({
      id: Math.random().toString(),
      text: `⚠️ ${leaverName} đã rời phòng. Bàn chơi quay về phòng chờ để đợi người tiếp theo vào!`,
      timestamp: Date.now(),
    });

    this.broadcastState();
  }

  /**
   * Người chơi bấm Bắt đầu / Sẵn sàng
   */
  public handlePlayerReady(playerId: string, isReady: boolean) {
    if (this.state.status !== 'waiting') return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.isReady = isReady;
    }

    // Nếu tất cả người chơi trong phòng đã sẵn sàng và đủ từ 3 người trở lên -> Tự động bắt đầu ván!
    const activePlayers = this.state.players.filter((p) => !p.isSpectator);
    const allReady = activePlayers.length >= 3 && activePlayers.every((p) => p.isReady || p.isBot);

    if (allReady) {
      this.startGame();
    } else {
      this.broadcastState();
    }
  }

  /**
   * Kết thúc ván, không đánh tiếp (về bàn chờ)
   */
  public endRoundToWaiting() {
    this.state.historyPause = undefined;
    this.stopTurnTimer();
    this.clearAllBotTimers();
    this.state.turnDeadline = null;
    this.state.currentTurnPlayerId = null;
    this.state.lastPlay = null;
    this.state.recentPlays = [];
    this.state.roundPlayRecords = [];

    this.state.roundResult = null;
    this.state.samState = null;
    this.state.status = 'waiting';

    for (const p of this.state.players) {
      p.isReady = p.isBot ? true : false;
      p.cardsRemaining = 0;
      p.hasPassed = false;
    }

    this.state.playHistory.push({
      id: Math.random().toString(),
      text: 'Đã kết thúc ván đấu và quay về phòng chờ.',
      timestamp: Date.now(),
    });

    this.broadcastState();
  }

  /**
   * Host bấm Bắt đầu ván mới
   */
  public startGame() {
    if (this.state.players.length < 3) {
      throw new Error('Cần tối thiểu 3 người chơi để bắt đầu ván đấu.');
    }

    // 1. Chia bài cho tất cả người chơi
    this.state.historyPause = undefined;
    this.stopTurnTimer();
    this.clearAllBotTimers();
    for (const [, brain] of this.bots) {
      brain.getTracker().reset();
    }

    const playerIds = this.state.players.map((p) => p.id);
    const deal = dealCards(playerIds);

    this.hands = deal.playerHands;
    this.initialHands = JSON.parse(JSON.stringify(deal.playerHands));
    this.cardsPlayedCount = {};
    this.chopEvents = [];
    this.lastPlayedCardsOfWinner = [];
    this.potentialDenLang = null;
    this.state.remainingHands = undefined;
    this.roundIndex++;

    this.currentRoundDebugLog = {
      id: `${this.state.roomId}_r${this.roundIndex}`,
      roomId: this.state.roomId,
      roundNumber: this.roundIndex,
      timestamp: Date.now(),
      players: this.state.players.map((p) => ({ id: p.id, name: p.name, isBot: !!p.isBot })),
      initialHands: JSON.parse(JSON.stringify(deal.playerHands)),
      turns: [],
      finalResult: {},
    };
    void this.ensureLocSession();

    for (const p of this.state.players) {
      p.cardsRemaining = 10;
      p.hasPassed = false;
      p.isReady = false;
      this.cardsPlayedCount[p.id] = 0;
    }

    // Gửi bài cho từng người
    for (const pid of playerIds) {
      this.sendHandToPlayer(pid);
    }    // 2. Kiểm tra Tới Trắng (Auto thắng ăn 30 lá)
    let instantWinnerId: string | null = null;
    let highestWinCheck = {
      isInstantWin: false,
      priority: 0,
      reason: '',
    };

    for (const p of this.state.players) {
      const hand = this.hands[p.id] || [];
      const winCheck = checkInstantWin(hand);
      if (winCheck.isInstantWin && winCheck.priority > highestWinCheck.priority) {
        highestWinCheck = {
          isInstantWin: true,
          priority: winCheck.priority,
          reason: winCheck.reason || 'Tới trắng',
        };
        instantWinnerId = p.id;
      }
    }

    if (instantWinnerId) {
      const winnerName = this.state.players.find((p) => p.id === instantWinnerId)?.name || 'Người chơi';
      this.state.playHistory = [{
        id: Math.random().toString(),
        text: `👑 ${winnerName} TỚI TRẮNG (${highestWinCheck.reason})! Ăn mỗi người 30 lá!`,
        timestamp: Date.now(),
      }];
      this.finishRound(instantWinnerId, undefined, highestWinCheck.reason);
      return;
    }

    // 3. Chuyển sang giai đoạn Báo Sâm
    this.state.status = 'sam_calling';
    this.state.samState = {
      samCallerId: null,
      samCallerName: null,
      skipPlayerIds: [],
      deadline: null,
    };
    this.state.lastPlay = null;
    this.state.recentPlays = [];
    this.state.roundPlayRecords = [];

    this.state.roundResult = null;
    this.state.playHistory = [{
      id: Math.random().toString(),
      text: 'Ván đấu bắt đầu! Chờ người chơi Báo Sâm...',
      timestamp: Date.now(),
    }];

    this.broadcastState();

    // Tự động Báo Sâm cho Bot
    this.scheduleBotsSamCalling();
  }

  private scheduleBotsSamCalling() {
    for (const player of this.state.players) {
      if (!player.isBot) continue;
      const botId = player.id;
      const brain = this.bots.get(botId);
      if (!brain) continue;

      const delay = 1000 + Math.floor(Math.random() * 1500);
      const timer = setTimeout(() => {
        if (this.state.status !== 'sam_calling') return;
        const hand = this.hands[botId] || [];
        const callSam = brain.decideSamCall(hand);
        if (callSam) {
          this.handleCallSam(botId);
        } else {
          this.handleSkipSam(botId);
        }
      }, delay);
      this.botTimers.set(botId, timer);
    }
  }

  /**
   * Người chơi Báo Sâm
   */
  public handleCallSam(playerId: string) {
    if (this.state.status !== 'sam_calling' || !this.state.samState) return;
    
    // Chỉ nhận người bấm sớm nhất
    if (this.state.samState.samCallerId) return;

    const caller = this.state.players.find((p) => p.id === playerId);
    if (!caller) return;

    this.state.samState.samCallerId = playerId;
    this.state.samState.samCallerName = caller.name;

    this.state.playHistory.push({
      id: Math.random().toString(),
      text: `${caller.name} đã BÁO SÂM!`,
      timestamp: Date.now(),
    });

    // Bắt đầu ván đấu ngay lập tức với lượt của người báo sâm
    this.enterPlayingPhase(playerId);
  }

  /**
   * Người chơi bấm Bỏ qua Báo Sâm
   */
  public handleSkipSam(playerId: string) {
    if (this.state.status !== 'sam_calling' || !this.state.samState) return;

    if (!this.state.samState.skipPlayerIds.includes(playerId)) {
      this.state.samState.skipPlayerIds.push(playerId);
    }

    const totalPlayers = this.state.players.length;
    const skippedCount = this.state.samState.skipPlayerIds.length;

    // Nếu tất cả đều bỏ qua -> Bắt đầu chơi ngay
    if (skippedCount >= totalPlayers) {
      if (this.samTimer) clearTimeout(this.samTimer);
      this.enterPlayingPhase();
      return;
    }

    // Nếu chỉ còn đúng 1 người chưa bấm -> Kích hoạt đếm ngược 60s
    if (skippedCount === totalPlayers - 1 && !this.state.samState.deadline) {
      const deadline = Date.now() + 60000;
      this.state.samState.deadline = deadline;

      this.samTimer = setTimeout(() => {
        if (this.state.status === 'sam_calling') {
          for (const p of this.state.players) {
            if (!this.state.samState?.skipPlayerIds.includes(p.id)) {
              this.state.samState?.skipPlayerIds.push(p.id);
            }
          }
          this.enterPlayingPhase();
        }
      }, 60000);
    }

    this.broadcastState();
  }

  /**
   * Bắt đầu đánh bài (Playing Phase)
   */
  private enterPlayingPhase(forceTurnPlayerId?: string) {
    if (this.samTimer) clearTimeout(this.samTimer);

    this.state.status = 'playing';

    // Xác định ai đi trước:
    // Nếu có người báo sâm -> người đó đi.
    // Nếu ván đầu tiên -> Host đi.
    // Nếu ván sau -> người thắng ván trước đi.
    let firstTurn = forceTurnPlayerId || this.previousWinnerId || this.state.hostId;
    if (!this.state.players.some((p) => p.id === firstTurn)) {
      firstTurn = this.state.players[0].id;
    }

    this.state.currentTurnPlayerId = firstTurn;
    this.state.roundLeaderPlayerId = firstTurn;
    this.state.lastPlay = null;
    this.state.recentPlays = [];
    this.state.roundPlayRecords = [];


    const firstPlayerName = this.state.players.find((p) => p.id === firstTurn)?.name || 'Người chơi';
    this.state.playHistory.push({
      id: Math.random().toString(),
      text: `${firstPlayerName} đánh trước.`,
      timestamp: Date.now(),
    });

    this.startTurnTimer();
    this.broadcastState();
  }

  /**
   * Giữ thời gian còn lại cho đến khi tất cả người xem lịch sử đã đóng.
   */
  public handleHistoryView(playerId: string, isOpen: boolean) {
    if (this.state.status !== 'playing' || !this.state.players.some(player => player.id === playerId && !player.isBot)) return;
    const pause = this.state.historyPause;
    if (isOpen) {
      if (pause?.viewerIds.includes(playerId)) return;
      this.state.historyPause = pause
        ? { ...pause, viewerIds: [...pause.viewerIds, playerId] }
        : {
            viewerIds: [playerId],
            remainingTurnMs: Math.max(0, (this.state.turnDeadline ?? Date.now()) - Date.now()),
            remainingBotMs: this.botTurnDeadline === null ? undefined : Math.max(0, this.botTurnDeadline - Date.now()),
          };
      this.stopTurnTimer();
      this.state.turnDeadline = null;
    } else {
      if (!pause?.viewerIds.includes(playerId)) return;
      const viewerIds = pause.viewerIds.filter(id => id !== playerId);
      if (viewerIds.length) this.state.historyPause = { ...pause, viewerIds };
      else {
        this.state.historyPause = undefined;
        this.startTurnTimer(pause.remainingTurnMs, pause.remainingBotMs);
      }
    }
    this.broadcastState();
  }

  /** Bắt đầu lượt mới hoặc tiếp tục thời gian còn lại sau khi tạm dừng. */
  private startTurnTimer(remainingMs = 30000, remainingBotMs?: number) {
    this.stopTurnTimer();
    const currentId = this.state.currentTurnPlayerId;
    if (!currentId || this.state.status !== 'playing' || this.state.historyPause) {
      this.state.turnDeadline = null;
      return;
    }

    // Nếu người chơi hiện tại là Bot -> Hẹn giờ cho Bot tự đánh bài
    const currentPlayer = this.state.players.find((p) => p.id === currentId);
    if (currentPlayer?.isBot) {
      const brain = this.bots.get(currentId);
      if (brain) {
        const botDelay = remainingBotMs ?? (800 + Math.floor(Math.random() * 800));
        this.botTurnDeadline = Date.now() + botDelay;
        const timer = setTimeout(() => {
          if (this.state.status !== 'playing' || this.state.historyPause || this.state.currentTurnPlayerId !== currentId) return;
          const botHand = this.hands[currentId] || [];
          const decision = brain.decideMove(currentId, botHand, this.state);
          if (decision.action === 'PLAY' && decision.cards.length > 0) {
            this.handlePlayCards(currentId, decision.cards, decision.reason);
          } else {
            this.handlePassTurn(currentId, decision.reason);
          }
        }, botDelay);
        this.botTimers.set(currentId, timer);
      }
    }

    this.state.turnDeadline = Date.now() + remainingMs;
    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout();
    }, remainingMs);
  }

  private stopTurnTimer() {
    this.botTurnDeadline = null;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    const currentId = this.state.currentTurnPlayerId;
    if (currentId && this.botTimers.has(currentId)) {
      clearTimeout(this.botTimers.get(currentId));
      this.botTimers.delete(currentId);
    }
  }

  /**
   * Tự động qua lượt khi hết 30s
   */
  private handleTurnTimeout() {
    const currentId = this.state.currentTurnPlayerId;
    if (!currentId || this.state.status !== 'playing' || this.state.historyPause) return;

    const playerName = this.state.players.find((p) => p.id === currentId)?.name || 'Người chơi';

    if (this.state.lastPlay) {
      // Có bài trên bàn -> Tự động qua lượt
      this.state.playHistory.push({
        id: Math.random().toString(),
        text: `⏳ Hết 30s: ${playerName} tự động qua lượt.`,
        timestamp: Date.now(),
      });
      this.handlePassTurn(currentId);
    } else {
      // Bàn trống (làm chủ vòng) -> Tự động đánh lá nhỏ nhất
      const hand = this.hands[currentId];
      if (hand && hand.length > 0) {
        this.state.playHistory.push({
          id: Math.random().toString(),
          text: `⏳ Hết 30s: ${playerName} tự động đánh lá nhỏ nhất.`,
          timestamp: Date.now(),
        });
        this.handlePlayCards(currentId, [hand[0]]);
      }
    }
  }

  /**
   * Người chơi đánh bài
   */
  public handlePlayCards(playerId: string, cards: Card[], botReason?: string) {
    if (this.state.status !== 'playing' || this.state.historyPause) return;
    if (this.state.currentTurnPlayerId !== playerId) return;

    const combo = analyzeCombo(cards);
    if (combo.type === 'INVALID') return;

    // Kiểm tra tính hợp lệ:
    // Nếu bàn đang có bài (không phải roundLeader mới) thì phải đè được bài trên bàn
    if (this.state.lastPlay) {
      const canPlay = canBeat(combo, this.state.lastPlay.combo);
      if (!canPlay) return;

      // Kiểm tra Chặt 2: Tứ quý chặt 2
      if (this.state.lastPlay.combo.type === 'SINGLE' && this.state.lastPlay.combo.highestRank === 15 && combo.type === 'QUAD') {
        this.chopEvents.push({
          chopperId: playerId,
          victimId: this.state.lastPlay.playerId,
          count: 1,
        });
        const chopperName = this.state.players.find((p) => p.id === playerId)?.name || '';
        const victimName = this.state.lastPlay.playerName;
        this.state.playHistory.push({
          id: Math.random().toString(),
          text: `💥 ${chopperName} dùng Tứ quý chặt 2 của ${victimName} (+10 lá)!`,
          timestamp: Date.now(),
        });
      }
    }

    // Kiểm tra quy tắc Báo 1 lá & Đền Làng:
    // Xác định người kế tiếp theo vòng tròn (chiều kim đồng hồ)
    const handBeforePlay = this.hands[playerId] || [];
    const currentIdx = this.state.players.findIndex((p) => p.id === playerId);
    if (currentIdx !== -1) {
      const nextIdx = (currentIdx + 1) % this.state.players.length;
      const nextPlayer = this.state.players[nextIdx];
      // Nếu người kế tiếp đang có đúng 1 lá (đã báo 1 lá)
      if (nextPlayer && nextPlayer.cardsRemaining === 1) {
        if (cards.length === 1 && hasHigherSingleCard(cards, handBeforePlay)) {
          // Vi phạm: Đánh rác lẻ nhưng không đánh lá to nhất!
          this.potentialDenLang = {
            attackerId: playerId,
            targetBaoId: nextPlayer.id,
          };
        } else {
          // Đánh hợp lệ (lá to nhất hoặc đánh bộ)
          this.potentialDenLang = null;
    this.state.remainingHands = undefined;
        }
      } else {
        this.potentialDenLang = null;
    this.state.remainingHands = undefined;
      }
    }

    // Trừ bài khỏi tay người chơi
    const playedCardIds = new Set(cards.map((c) => c.id));
    this.hands[playerId] = (this.hands[playerId] || []).filter((c) => !playedCardIds.has(c.id));
    this.cardsPlayedCount[playerId] = (this.cardsPlayedCount[playerId] || 0) + cards.length;

    // Cập nhật số lá còn lại
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.cardsRemaining = this.hands[playerId].length;
      player.hasPassed = false;
    }

    const playerName = player?.name || '';
    const currentPlay = { playerId, playerName, combo };
    this.state.lastPlay = currentPlay;
    this.state.recentPlays = [...(this.state.recentPlays || []), currentPlay].slice(-2);
    this.state.roundLeaderPlayerId = playerId;

    const playRecord: RoundPlayRecord = {
      id: `${playerId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      turnIndex: (this.state.roundPlayRecords?.length || 0) + 1,
      playerId,
      playerName,
      cards: [...cards],
      combo,
      timestamp: Date.now(),
    };
    this.state.roundPlayRecords = [...(this.state.roundPlayRecords || []), playRecord];

    this.state.playHistory.push({
      id: Math.random().toString(),
      text: `${playerName} đã đánh ${cards.length} lá.`,
      timestamp: Date.now(),
    });

    // Ghi debug log cho nước đánh
    if (this.currentRoundDebugLog) {
      const isBot = Boolean(player?.isBot);
      this.currentRoundDebugLog.turns.push({
        turnIndex: this.currentRoundDebugLog.turns.length + 1,
        playerId,
        playerName,
        isBot,
        action: 'PLAY',
        cardsPlayed: [...cards],
        combo,
        botLog: isBot && botReason ? { handBefore: handBeforePlay, reason: botReason } : undefined,
        timestamp: Date.now(),
      });
    }

    // Gửi cập nhật bài riêng cho người đó
    this.sendHandToPlayer(playerId);

    // Cập nhật Card Tracker cho tất cả các Bot
    for (const [, brain] of this.bots) {
      brain.getTracker().recordPlay(cards);
    }

    // Kiểm tra hết bài (Về nhất)
    if (this.hands[playerId].length === 0) {
      this.lastPlayedCardsOfWinner = cards;
      let denLangPlayerId: string | undefined = undefined;
      if (this.potentialDenLang && this.potentialDenLang.targetBaoId === playerId) {
        denLangPlayerId = this.potentialDenLang.attackerId;
      }
      this.finishRound(playerId, denLangPlayerId);
      return;
    }

    // Chuyển lượt sang người kế tiếp (chưa bỏ lượt)
    this.passTurnToNext(playerId);
  }

  /**
   * Người chơi Bỏ lượt
   */
  public handlePassTurn(playerId: string, botReason?: string) {
    if (this.state.status !== 'playing' || this.state.historyPause) return;
    if (this.state.currentTurnPlayerId !== playerId) return;
    if (this.state.roundLeaderPlayerId === playerId) {
      // Người làm chủ vòng không được bỏ lượt khi bàn trống
      return;
    }

    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.hasPassed = true;
    }

    this.state.playHistory.push({
      id: Math.random().toString(),
      text: `${player?.name || 'Người chơi'} đã bỏ lượt.`,
      timestamp: Date.now(),
    });

    if (this.currentRoundDebugLog) {
      const isBot = Boolean(player?.isBot);
      this.currentRoundDebugLog.turns.push({
        turnIndex: this.currentRoundDebugLog.turns.length + 1,
        playerId,
        playerName: player?.name || '',
        isBot,
        action: 'PASS',
        cardsPlayed: [],
        botLog: isBot && botReason ? { handBefore: this.hands[playerId] || [], reason: botReason } : undefined,
        timestamp: Date.now(),
      });
    }

    // Chuyển lượt
    this.passTurnToNext(playerId);
  }

  /**
   * Tìm người kế tiếp để chuyển lượt
   */
  private passTurnToNext(currentPlayerId: string) {
    const players = this.state.players;
    const currentIndex = players.findIndex((p) => p.id === currentPlayerId);

    // Đếm số người chưa bỏ lượt
    const activePlayers = players.filter((p) => !p.hasPassed);

    // Nếu chỉ còn duy nhất 1 người chưa bỏ lượt -> Người đó ăn vòng!
    if (activePlayers.length <= 1) {
      const winnerOfTrick = activePlayers[0] || players[currentIndex];
      // Reset vòng mới: tất cả người chơi bỏ cờ hasPassed
      players.forEach((p) => {
        p.hasPassed = false;
      });
      this.state.lastPlay = null;
      this.state.recentPlays = [];
      this.state.roundLeaderPlayerId = winnerOfTrick.id;
      this.state.currentTurnPlayerId = winnerOfTrick.id;

      this.state.playHistory.push({
        id: Math.random().toString(),
        text: `--- Bắt đầu vòng mới: lượt của ${winnerOfTrick.name} ---`,
        timestamp: Date.now(),
      });

      this.startTurnTimer();
      this.broadcastState();
      return;
    }

    // Tìm người kế tiếp theo vòng tròn chưa bỏ lượt
    for (let offset = 1; offset < players.length; offset++) {
      const nextIndex = (currentIndex + offset) % players.length;
      const nextPlayer = players[nextIndex];
      if (!nextPlayer.hasPassed) {
        this.state.currentTurnPlayerId = nextPlayer.id;
        break;
      }
    }

    this.startTurnTimer();
    this.broadcastState();
  }

  /**
   * Kết thúc ván đấu
   */
  private finishRound(winnerId: string, denLangPlayerId?: string, instantWinReason?: string) {
    this.stopTurnTimer();
    this.clearAllBotTimers();
    this.state.turnDeadline = null;
    this.state.status = 'round_ended';
    this.previousWinnerId = winnerId;
    this.state.currentTurnPlayerId = null;

    const isSam = !!this.state.samState?.samCallerId;
    const samSuccess = isSam && this.state.samState?.samCallerId === winnerId;
    const samFailed = isSam && this.state.samState?.samCallerId !== winnerId;

    const scoreboard = calculateRoundScores({
      players: this.state.players.map((p) => ({ id: p.id, name: p.name })),
      remainingHands: this.hands,
      cardsPlayedCount: this.cardsPlayedCount,
      winnerId,
      lastPlayedCards: this.lastPlayedCardsOfWinner,
      isSamSuccess: samSuccess,
      isSamFailed: samFailed,
      samPlayerId: this.state.samState?.samCallerId || undefined,
      isInstantWin: !!instantWinReason,
      instantWinPlayerId: instantWinReason ? winnerId : undefined,
      instantWinReason,
      denLangPlayerId,
      chopEvents: this.chopEvents,
    });

    this.state.roundResult = scoreboard;
    this.state.remainingHands = JSON.parse(JSON.stringify(this.hands));

    if (this.currentRoundDebugLog) {
      this.currentRoundDebugLog.finalResult = scoreboard;
      if (this.state.samState) {
        this.currentRoundDebugLog.samState = {
          callerId: this.state.samState.samCallerId,
          success: samSuccess,
          failed: samFailed,
        };
      }
      void saveRoundDebugLog(this.currentRoundDebugLog);
    }


    const winnerName = this.state.players.find((p) => p.id === winnerId)?.name || '';
    const summary: CompletedRoundSummary = {
      roundNumber: this.roundIndex,
      winnerId,
      winnerName,
      reason: isSam ? (samSuccess ? 'Ăn Sâm' : 'Đền Sâm') : (denLangPlayerId ? 'Đền Làng' : 'Tới Nhất'),
      timestamp: Date.now(),
      scores: scoreboard,
    };
    this.completedRounds.push(summary);
    this.state.completedRounds = [...this.completedRounds];

    if (this.locSessionId) {
      void syncRoundToLocSession(this.locSessionId, winnerId, scoreboard);
    }

    if (denLangPlayerId) {
      const denLangPlayer = this.state.players.find((p) => p.id === denLangPlayerId);
      this.state.playHistory.push({
        id: Math.random().toString(),
        text: `💥 ${denLangPlayer?.name || 'Người chơi'} đánh lọt bài khi ${winnerName} đã báo! BỊ ĐỀN LÀNG cả bàn!`,
        timestamp: Date.now(),
      });
    }

    this.state.playHistory.push({
      id: Math.random().toString(),
      text: `🏆 Ván đấu kết thúc! ${winnerName} về nhất!`,
      timestamp: Date.now(),
    });

    this.broadcastState();
  }

  public destroy() {
    this.stopLobbyAnnounce();
    this.stopTurnTimer();
    this.clearAllBotTimers();
    if (this.samTimer) {
      clearTimeout(this.samTimer);
      this.samTimer = null;
    }
  }
}
