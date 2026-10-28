import { Card, CardCombo, Rank } from '../types';

export interface HandPartition {
  quads: Card[][];
  straights: Card[][];
  triples: Card[][];
  pairs: Card[][];
  singles: Card[];
}

export interface CardTrackerState {
  playedCards: Card[];
  remainingTwosCount: number;
  suspectedQuadsRanks: Rank[];
  nextPlayerCardsRemaining: number | null;
  minOpponentCardsRemaining: number;
}

export type BotAction = 'PLAY' | 'PASS';

export type BotPersonality = 'aggressive' | 'conservative' | 'balanced';

export interface BotDecision {
  action: BotAction;
  cards: Card[];
  combo?: CardCombo;
  reason: string;
}

export interface CandidateMove {
  action: BotAction;
  cards: Card[];
  combo?: CardCombo;
  description: string;
}
