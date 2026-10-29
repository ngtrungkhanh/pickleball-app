import { MonteCarloBrain } from './monte-carlo-brain';
import type { BotWorkerRequest, BotWorkerResponse } from './worker-client';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BotWorkerRequest>) => void) | null;
  postMessage: (response: BotWorkerResponse) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const brain = new MonteCarloBrain();
    const result = data.kind === 'move'
      ? brain.decideMove(data.botId, data.hand, data.table)
      : brain.decideSamCall(data.hand, data.table, data.botId);
    scope.postMessage({ id: data.id, result });
  } catch {
    scope.postMessage({ id: data.id, result: null });
  }
};
