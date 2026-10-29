import { Card } from '../types';
import { TableState } from '../network-types';
import { BotDecision } from './types';
import { MonteCarloBrain } from './monte-carlo-brain';

export interface BotWorkerRequest {
  id: number;
  kind: 'move' | 'sam';
  botId: string;
  hand: Card[];
  table: TableState;
}
export interface BotWorkerResponse { id: number; result: BotDecision | boolean | null }

/** Explicit public projection: never send host hands, results or debug history to AI. */
export function publicBotTable(table: TableState): TableState {
  return {
    roomId: table.roomId, roomName: '', hostId: table.hostId, status: table.status,
    players: table.players.map(p => ({ ...p })), spectators: [],
    currentTurnPlayerId: table.currentTurnPlayerId, roundLeaderPlayerId: table.roundLeaderPlayerId,
    turnDeadline: table.turnDeadline, lastPlay: table.lastPlay,
    roundPlayRecords: table.roundPlayRecords, samState: table.samState, playHistory: [], roundResult: null,
  };
}

export class BotWorkerClient {
  private worker: Worker | null = null;
  private serial = 0;
  private pending = new Map<number, { resolve: (value: BotWorkerResponse['result']) => void; timer: ReturnType<typeof setTimeout> }>();

  private request(kind: BotWorkerRequest['kind'], botId: string, hand: Card[], table: TableState): Promise<BotWorkerResponse['result']> {
    if (typeof Worker === 'undefined') return Promise.resolve(null);
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }: MessageEvent<BotWorkerResponse>) => {
          const pending = this.pending.get(data.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(data.id);
          pending.resolve(data.result);
        };
        this.worker.onerror = () => this.cancel();
        this.worker.onmessageerror = () => this.cancel();
      }
      const id = ++this.serial;
      return new Promise(resolve => {
        // Includes startup/queue time. Terminating also interrupts a stalled search.
        const timer = setTimeout(() => this.cancel(), 1200);
        this.pending.set(id, { resolve, timer });
        try {
          this.worker!.postMessage({ id, kind, botId, hand, table: publicBotTable(table) } satisfies BotWorkerRequest);
        } catch {
          this.cancel();
        }
      });
    } catch {
      this.cancel();
      return Promise.resolve(null);
    }
  }

  async move(botId: string, hand: Card[], table: TableState): Promise<BotDecision> {
    const result = await this.request('move', botId, hand, table);
    if (result && typeof result === 'object') return result;
    return new MonteCarloBrain(undefined, { maxSamples: 0, budgetMs: 0 }).decideMove(botId, hand, table);
  }

  async sam(botId: string, hand: Card[], table: TableState): Promise<boolean> {
    return (await this.request('sam', botId, hand, table)) === true;
  }

  cancelPending(): void {
    if (this.pending.size) this.cancel();
  }

  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(null);
    }
    this.pending.clear();
  }
}
