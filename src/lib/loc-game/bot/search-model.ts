import { Card, CardCombo, ComboType } from '../types';
import { TableState } from '../network-types';
import { calculateRoundScores, ChopEvent } from '../scoring';

// Base 5 encodes thirteen rank counts exactly in a JS number (5^13 < 2^53).
// Suits do not break ties in this game's canBeat rules.
const POWERS = Array.from({ length: 13 }, (_, i) => 5 ** i);
export interface SearchMove {
  code: number;
  type: ComboType;
  rank: number;
  length: number;
}
export interface HandInfo {
  counts: number[];
  size: number;
  moves: SearchMove[];
}
export const PASS: SearchMove = { code: 0, type: 'INVALID', rank: 0, length: 0 };
export function encodeHand(cards: Card[]): number {
  return cards.reduce((code, card) => code + POWERS[card.rank - 3], 0);
}
export function comboMove(combo: CardCombo | null): SearchMove | null {
  return combo ? { code: encodeHand(combo.cards), type: combo.type, rank: combo.highestRank, length: combo.length } : null;
}
export function beats(move: SearchMove, table: SearchMove): boolean {
  if (!move.length) return false;
  if (table.type === 'SINGLE' && table.rank === 15) return move.type === 'QUAD';
  if (table.type === 'PAIR' && table.rank === 15) return false;
  return move.type === table.type && move.length === table.length && move.rank > table.rank;
}

/** Per-decision caches are released after search; never retain a growing game tree. */
export class SearchModel {
  private hands = new Map<number, HandInfo>();
  private steps = new Map<number, number>([[0, 0]]);

  hand(code: number): HandInfo {
    const cached = this.hands.get(code);
    if (cached) return cached;
    let rest = code;
    const counts = POWERS.map(() => { const n = rest % 5; rest = Math.floor(rest / 5); return n; });
    const moves: SearchMove[] = [];
    const types: ComboType[] = ['INVALID', 'SINGLE', 'PAIR', 'TRIPLE', 'QUAD'];
    for (let r = 0; r < 13; r++) {
      for (let length = 1; length <= counts[r]; length++) {
        moves.push({ code: POWERS[r] * length, type: types[length], rank: r + 3, length });
      }
      if (r === 12 || !counts[r]) continue;
      let straight = 0;
      for (let end = r; end < 12 && counts[end]; end++) {
        straight += POWERS[end];
        if (end - r >= 2) moves.push({ code: straight, type: 'STRAIGHT', rank: end + 3, length: end - r + 1 });
      }
    }
    if (counts[0] && counts[11] && counts[12]) {
      moves.push({ code: POWERS[0] + POWERS[11] + POWERS[12], type: 'STRAIGHT', rank: 3, length: 3 });
    }
    const info = { counts, moves, size: counts.reduce((a, b) => a + b, 0) };
    if (this.hands.size < 12000) this.hands.set(code, info);
    return info;
  }

  minSteps(code: number): number {
    const cached = this.steps.get(code);
    if (cached !== undefined) return cached;
    const info = this.hand(code);
    if (info.moves.some(move => move.length === info.size)) return 1;
    // Every partition contains the lowest card: only branch on groups using it.
    const first = info.counts.findIndex(Boolean);
    let best = info.size;
    for (const move of info.moves) {
      if (Math.floor(move.code / POWERS[first]) % 5 === 0) continue;
      best = Math.min(best, 1 + this.minSteps(code - move.code));
    }
    if (this.steps.size < 12000) this.steps.set(code, best);
    return best;
  }

  legal(code: number, table: SearchMove | null, nextSize: number): SearchMove[] {
    const info = this.hand(code);
    const largest = info.counts.findLastIndex(Boolean) + 3;
    const moves = info.moves.filter(move => (!table || beats(move, table)) &&
      (nextSize !== 1 || move.type !== 'SINGLE' || move.rank === largest));
    return table ? [...moves, PASS] : moves;
  }
}

export interface SearchState {
  ids: string[];
  hands: number[];
  sizes: number[];
  passed: boolean[];
  current: number;
  owner: number;
  table: SearchMove | null;
  played: number[];
  caller: number;
  chops: ChopEvent[];
  den: { attacker: number; target: number } | null;
  winner: number;
  lastMove: SearchMove | null;
}

export function createSearchState(table: TableState, hands: number[], model: SearchModel, playedCards: Card[] = []): SearchState {
  const players = table.players.filter(p => !p.isSpectator);
  return {
    ids: players.map(p => p.id), hands: [...hands], sizes: hands.map(h => model.hand(h).size),
    passed: players.map(p => p.hasPassed), current: players.findIndex(p => p.id === table.currentTurnPlayerId),
    owner: players.findIndex(p => p.id === table.lastPlay?.playerId), table: comboMove(table.lastPlay?.combo ?? null),
    played: POWERS.map((_, r) => playedCards.filter(c => c.rank === r + 3).length),
    caller: players.findIndex(p => p.id === table.samState?.samCallerId),
    chops: [], den: null, winner: -1, lastMove: null,
  };
}

/** Mirrors HostGameEngine: a pass lasts for this trick; first empty hand ends the deal. */
export function advanceSearch(state: SearchState, move: SearchMove, model: SearchModel): void {
  const seat = state.current;
  const next = (seat + 1) % state.ids.length;
  if (!move.length) state.passed[seat] = true;
  else {
    if (state.table?.type === 'SINGLE' && state.table.rank === 15 && move.type === 'QUAD') {
      state.chops.push({ chopperId: state.ids[seat], victimId: state.ids[state.owner], count: 1 });
    }
    const largest = model.hand(state.hands[seat]).counts.findLastIndex(Boolean) + 3;
    state.den = state.sizes[next] === 1 && move.length === 1 && move.rank < largest
      ? { attacker: seat, target: next } : null;
    state.hands[seat] -= move.code;
    state.sizes[seat] -= move.length;
    state.passed[seat] = false;
    state.table = move;
    state.owner = seat;
    state.lastMove = move;
    for (let r = 0; r < 13; r++) state.played[r] += Math.floor(move.code / POWERS[r]) % 5;
    if (state.sizes[seat] === 0) { state.winner = seat; return; }
  }
  const active = state.passed.flatMap((passed, i) => passed ? [] : [i]);
  if (active.length <= 1) {
    state.current = active[0] ?? seat;
    state.owner = state.current;
    state.table = null;
    state.passed.fill(false);
  } else {
    for (let offset = 1; offset < state.ids.length; offset++) {
      const candidate = (seat + offset) % state.ids.length;
      if (!state.passed[candidate]) { state.current = candidate; break; }
    }
  }
}

function cardsFromCode(code: number, model: SearchModel): Card[] {
  const suits = ['spades', 'clubs', 'diamonds', 'hearts'] as const;
  return model.hand(code).counts.flatMap((count, r) => Array.from({ length: count }, (_, i) => ({
    id: `${r + 3}_${suits[i]}`, rank: (r + 3) as Card['rank'], suit: suits[i],
  })));
}

export function searchScores(state: SearchState, model: SearchModel) {
  const winnerId = state.ids[state.winner];
  return calculateRoundScores({
    players: state.ids.map(id => ({ id, name: id })), winnerId,
    remainingHands: Object.fromEntries(state.ids.map((id, i) => [id, cardsFromCode(state.hands[i], model)])),
    cardsPlayedCount: Object.fromEntries(state.ids.map((id, i) => [id, 10 - state.sizes[i]])),
    lastPlayedCards: cardsFromCode(state.lastMove?.code ?? 0, model), chopEvents: state.chops,
    samPlayerId: state.caller >= 0 ? state.ids[state.caller] : undefined,
    isSamSuccess: state.caller >= 0 && state.winner === state.caller,
    isSamFailed: state.caller >= 0 && state.winner !== state.caller,
    denLangPlayerId: state.den?.target === state.winner ? state.ids[state.den.attacker] : undefined,
  });
}

/** Fast rollout policy sees its own hand and public ranks only, never sampled enemy hands. */
export function rolloutMove(state: SearchState, model: SearchModel, random: () => number): SearchMove {
  const hand = state.hands[state.current];
  const info = model.hand(hand);
  const nextSize = state.sizes[(state.current + 1) % state.ids.length];
  const options = model.legal(hand, state.table, nextSize);
  const terminal = options.find(move => move.length === info.size);
  if (terminal) return terminal;
  if (options.length === 1) return options[0];
  const urgent = state.sizes.some((size, i) => i !== state.current && size <= 2 && !state.passed[i]);
  let best = options[0];
  let bestValue = -Infinity;
  for (const move of options) {
    // Small jitter explores several reasonable continuations instead of a single script.
    let value = random() * 0.25;
    if (!move.length) value -= model.minSteps(hand) + (urgent ? 1 : 0);
    else {
      const after = hand - move.code;
      const steps = model.minSteps(after);
      const twos = model.hand(after).counts[12];
      value -= steps + twos * 0.15;
      value += move.length * 0.035;
      if (!state.table) value += (15 - move.rank) * 0.025;
      else value -= (move.rank - state.table.rank) * 0.015;
      // Estimate control from public unseen ranks, including the undealt stock.
      let unseenHigher = 0;
      for (let r = move.rank - 2; r < 13; r++) unseenHigher += Math.max(0, 4 - info.counts[r] - state.played[r]);
      if (move.type === 'SINGLE') value += Math.max(0, 1 - unseenHigher / 8) * 0.35;
      if (nextSize === 1 && move.length > 1) value += 0.5;
    }
    if (value > bestValue) { bestValue = value; best = move; }
  }
  return best;
}

export function finishSearch(state: SearchState, model: SearchModel, random: () => number): void {
  // <= 50 cards: each trick consumes cards, with at most n-1 consecutive passes.
  for (let turn = 0; state.winner < 0 && turn < 300; turn++) {
    advanceSearch(state, rolloutMove(state, model, random), model);
  }
  if (state.winner < 0) throw new Error('Search rollout did not terminate');
}
