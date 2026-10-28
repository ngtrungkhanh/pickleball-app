import { Card, CardCombo, PlayerScoreDetail } from './types';

export interface BotTurnLog {
  handBefore: Card[];
  reason: string;
  suspectedTwos?: number;
}

export interface TurnActionLog {
  turnIndex: number;
  playerId: string;
  playerName: string;
  isBot: boolean;
  action: 'PLAY' | 'PASS';
  cardsPlayed: Card[];
  combo?: CardCombo;
  botLog?: BotTurnLog;
  timestamp: number;
}

export interface RoundDebugLog {
  id: string;
  roomId: string;
  roundNumber: number;
  timestamp: number;
  players: { id: string; name: string; isBot: boolean }[];
  initialHands: Record<string, Card[]>;
  samState?: {
    callerId: string | null;
    success?: boolean;
    failed?: boolean;
  };
  turns: TurnActionLog[];
  finalResult: Record<string, PlayerScoreDetail>;
}

export interface CompletedRoundSummary {
  roundNumber: number;
  winnerId: string;
  winnerName: string;
  reason: string;
  timestamp: number;
  scores: Record<string, PlayerScoreDetail>;
}
