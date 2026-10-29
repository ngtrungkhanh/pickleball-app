import { analyzeCombo } from '../analyzer';
import { Card } from '../types';
import { TableState } from '../network-types';
import { CardTracker } from './card-tracker';
import { BotDecision } from './types';
import {
  SearchModel, SearchMove, advanceSearch, createSearchState, encodeHand,
  finishSearch, rolloutMove, searchScores,
} from './search-model';

export interface SearchOptions {
  maxSamples?: number;
  budgetMs?: number;
  random?: () => number;
  now?: () => number;
}
export interface SearchDiagnostics {
  samples: number;
  elapsedMs: number;
  candidates: number;
  expectedNetCards?: number;
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** No hidden input: only the observing player's hand and public played cards. */
export function sampleHiddenHands(botId: string, hand: Card[], table: TableState, played: Card[], random: () => number) {
  const known = new Map([...hand, ...played].map(card => [card.id, card]));
  const counts = Array.from({ length: 13 }, (_, rank) => 4 - [...known.values()].filter(card => card.rank === rank + 3).length);
  const unseen = counts.flatMap((count, rank) => Array(Math.max(0, count)).fill(rank) as number[]);
  const players = table.players.filter(p => !p.isSpectator);
  const needed = players.reduce((sum, p) => sum + (p.id === botId ? 0 : p.cardsRemaining), 0);
  if (counts.some(n => n < 0) || needed > unseen.length) return null;
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
  }
  let offset = 0;
  const hands = players.map(player => {
    if (player.id === botId) return encodeHand(hand);
    let code = 0;
    for (let i = 0; i < player.cardsRemaining; i++) code += 5 ** unseen[offset++];
    return code;
  });
  // Unassigned cards remain hidden in the stock, not forced into opponents' hands.
  return { hands, stock: unseen.slice(offset) };
}

function materialize(move: SearchMove, hand: Card[]): BotDecision {
  if (!move.length) return { action: 'PASS', cards: [], reason: 'Monte Carlo: bỏ lượt' };
  const cards = Array.from({ length: 13 }, (_, r) => {
    const count = Math.floor(move.code / 5 ** r) % 5;
    return hand.filter(c => c.rank === r + 3).slice(0, count);
  }).flat();
  return { action: 'PLAY', cards, combo: analyzeCombo(cards), reason: 'Monte Carlo' };
}

export class MonteCarloBrain {
  private tracker: CardTracker;
  private options: Required<SearchOptions>;
  public diagnostics: SearchDiagnostics = { samples: 0, elapsedMs: 0, candidates: 0 };

  constructor(tracker = new CardTracker(), options: SearchOptions = {}) {
    this.tracker = tracker;
    this.options = {
      maxSamples: options.maxSamples ?? 32, budgetMs: options.budgetMs ?? 180,
      random: options.random ?? Math.random, now: options.now ?? (() => performance.now()),
    };
  }
  getTracker() { return this.tracker; }

  private publicCards(table: TableState): Card[] {
    return [...new Map([
      ...this.tracker.getPlayedCards(),
      ...(table.roundPlayRecords ?? []).flatMap(record => record.cards),
      ...(table.lastPlay?.combo.cards ?? []),
    ].map(card => [card.id, card])).values()];
  }

  decideMove(botId: string, hand: Card[], table: TableState): BotDecision {
    const { now, random, budgetMs, maxSamples } = this.options;
    const started = now();
    const model = new SearchModel();
    const players = table.players.filter(p => !p.isSpectator);
    const seat = players.findIndex(p => p.id === botId);
    this.diagnostics = { samples: 0, elapsedMs: 0, candidates: 0 };
    if (!hand.length || seat < 0) return { action: 'PASS', cards: [], reason: 'Không có bài / không có ghế' };
    const played = this.publicCards(table);
    const base = createSearchState(table, players.map(p => p.id === botId ? encodeHand(hand) : 0), model, played);
    base.current = seat;
    base.sizes = players.map(p => p.id === botId ? hand.length : p.cardsRemaining);
    const candidates = model.legal(encodeHand(hand), base.table, base.sizes[(seat + 1) % players.length]);
    this.diagnostics.candidates = candidates.length;
    const terminal = candidates.find(move => move.length === hand.length);
    let chosen = terminal ?? rolloutMove(base, model, () => 0.5);
    const totals = candidates.map(() => 0);
    let samples = 0;
    if (!terminal && candidates.length > 1) {
      for (let sample = 0; sample < maxSamples && now() - started < budgetMs; sample++) {
        const world = sampleHiddenHands(botId, hand, table, played, random);
        if (!world) break;
        const seed = Math.floor(random() * 4294967296);
        const values: number[] = [];
        for (const move of candidates) {
          if (now() - started >= budgetMs) break;
          const state = createSearchState(table, world.hands, model, played);
          state.current = seat;
          advanceSearch(state, move, model);
          finishSearch(state, model, seededRandom(seed));
          values.push(searchScores(state, model)[botId].netCards);
        }
        // Commit complete rounds only: every candidate faces exactly the same worlds.
        if (values.length !== candidates.length) break;
        values.forEach((value, i) => { totals[i] += value; });
        samples++;
      }
      if (samples) {
        let best = 0;
        for (let i = 1; i < totals.length; i++) if (totals[i] > totals[best]) best = i;
        chosen = candidates[best];
        this.diagnostics.expectedNetCards = totals[best] / samples;
      }
    }
    this.diagnostics.samples = samples;
    this.diagnostics.elapsedMs = now() - started;
    const decision = materialize(chosen, hand);
    decision.reason = terminal ? 'Monte Carlo: đánh hết bài' : samples
      ? `Monte Carlo: ${samples} mẫu bài ẩn; ${this.diagnostics.expectedNetCards!.toFixed(1)} lá kỳ vọng; ${Math.round(this.diagnostics.elapsedMs)}ms`
      : 'Monte Carlo: nước dự phòng nhanh, bảo vệ báo một lá';
    return decision;
  }

  /** Compare calling vs ordinary play on paired worlds; require a positive confidence margin. */
  decideSamCall(hand: Card[], table?: TableState, botId?: string): boolean {
    if (!table || !botId) return false;
    const { now, random } = this.options;
    const started = now();
    const model = new SearchModel();
    const players = table.players.filter(p => !p.isSpectator);
    const seat = players.findIndex(p => p.id === botId);
    if (seat < 0) return false;
    let sum = 0, squares = 0, samples = 0;
    for (let sample = 0; sample < 32 && now() - started < Math.min(100, this.options.budgetMs); sample++) {
      const world = sampleHiddenHands(botId, hand, table, [], random);
      if (!world) break;
      const seed = Math.floor(random() * 4294967296);
      const normal = createSearchState(table, world.hands, model);
      const firstPlayerId = table.roundLeaderPlayerId ?? table.hostId;
      normal.current = Math.max(0, players.findIndex(p => p.id === firstPlayerId));
      const call = createSearchState(table, world.hands, model);
      call.current = seat;
      call.caller = seat;
      finishSearch(normal, model, seededRandom(seed));
      finishSearch(call, model, seededRandom(seed));
      const delta = searchScores(call, model)[botId].netCards - searchScores(normal, model)[botId].netCards;
      sum += delta;
      squares += delta * delta;
      samples++;
    }
    if (samples < 8) return false;
    const mean = sum / samples;
    const standardError = Math.sqrt(Math.max(0, squares / samples - mean * mean) / (samples - 1));
    return mean - 2 * standardError > 0;
  }
}
