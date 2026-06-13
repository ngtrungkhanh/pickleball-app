import { describe, it, expect } from 'vitest';
import { isFullDoublesMatch, buildAnalysisElo, type AnalysisMatch, type AnalysisPlayer } from '../analysis-core';

describe('analysis-core tests', () => {
  describe('isFullDoublesMatch', () => {
    it('returns true when there are 4 players', () => {
      const match: AnalysisMatch = {
        id: '1',
        win_1: 'p1',
        win_2: 'p2',
        lose_1: 'p3',
        lose_2: 'p4',
        win_score: 11,
        lose_score: 5,
      };
      expect(isFullDoublesMatch(match)).toBe(true);
    });

    it('returns false when missing players', () => {
      const match: AnalysisMatch = {
        id: '1',
        win_1: 'p1',
        win_2: null,
        lose_1: 'p3',
        lose_2: 'p4',
      };
      expect(isFullDoublesMatch(match)).toBe(false);
    });
  });

  describe('buildAnalysisElo', () => {
    it('calculates ELO properly for a simple match', () => {
      const players: AnalysisPlayer[] = [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
        { id: 'p3', name: 'P3' },
        { id: 'p4', name: 'P4' },
      ];

      const matches: AnalysisMatch[] = [
        {
          id: 'm1',
          date: '2026-06-01T10:00:00.000Z',
          win_1: 'p1',
          win_2: 'p2',
          lose_1: 'p3',
          lose_2: 'p4',
          win_score: 11,
          lose_score: 5,
        }
      ];

      const now = new Date('2026-06-01T20:00:00.000Z');
      const result = buildAnalysisElo(players, matches, now);
      
      // All players start at 1500
      // p1, p2 should win points, p3, p4 should lose points
      const p1Elo = result.rating.get('p1');
      const p3Elo = result.rating.get('p3');

      expect(p1Elo).toBeGreaterThan(1500);
      expect(p3Elo).toBeLessThan(1500);
    });
  });
});
