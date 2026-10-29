import { createDeck } from '../../loc-game/deck';
import { Card } from '../../loc-game/types';
import { seededRandom } from '../../loc-game/bot/monte-carlo-brain';

export function locFixture(seed: number, count = 4): Record<string, Card[]> {
  const random = seededRandom(seed);
  const cards = createDeck();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return Object.fromEntries(Array.from({ length: count }, (_, seat) => [
    `p${seat}`, Array.from({ length: 10 }, (_, index) => cards[index * count + seat]),
  ]));
}
