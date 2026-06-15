import { describe, it, expect } from 'vitest';
import { parseVoiceInput } from '../voice-input';

describe('Voice Input Fuzzy Match & Semantics', () => {
  const mockPlayers = [
    { id: '1', name: 'Nguyễn Thanh Sơn' },
    { id: '2', name: 'Trần Tùng' },
    { id: '3', name: 'Lê Hải' },
    { id: '4', name: 'Phạm Tuấn' },
    { id: '5', name: 'Vũ Đạt' },
    { id: '6', name: 'Nguyễn Phát' },
    { id: '7', name: 'Lê Chung' }, // Added to test Tùng/Chung overlap
  ];

  it('extracts exactly 4 players and score from vietnamese numbers', () => {
    const input = 'Sơn Tùng mười một năm Hải Tuấn';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '1', win2: '2', lose1: '3', lose2: '4',
      winScore: 11, loseScore: 5, rawText: input
    });
  });

  it('extracts players and defaults to 11-5 if no scores provided', () => {
    const input = 'Tùng Đạt Sơn Phát';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '2', win2: '5', lose1: '1', lose2: '6',
      winScore: 11, loseScore: 5, rawText: input
    });
  });

  it('handles Tùng and Chung without overlap when both are present', () => {
    const input = 'Tùng Chung Phát Đạt 11 đều';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '2', win2: '7', lose1: '6', lose2: '5',
      winScore: 11, loseScore: 11, rawText: input
    });
  });

  it('swaps teams based on word "thua" and score auto-assignment', () => {
    const input = 'Sơn Tùng thua Hải Tuấn 11-6';
    const result = parseVoiceInput(input, mockPlayers);

    // Sơn Tùng loses, so they are lose1, lose2. Hải Tuấn wins.
    // Scores 11-6 -> winScore 11, loseScore 6.
    expect(result).toEqual({
      win1: '3', win2: '4', lose1: '1', lose2: '2',
      winScore: 11, loseScore: 6, rawText: input
    });
  });

  it('swaps teams if score suggests first team lost', () => {
    const input = 'Sơn Tùng Hải Tuấn 5 11';
    const result = parseVoiceInput(input, mockPlayers);

    // No keyword, but score is 5 11. Team 1 got 5, Team 2 got 11. Team 1 lost.
    expect(result).toEqual({
      win1: '3', win2: '4', lose1: '1', lose2: '2',
      winScore: 11, loseScore: 5, rawText: input
    });
  });

  it('keeps teams if "thắng" keyword is used', () => {
    const input = 'Sơn Tùng thắng Hải Tuấn 11 8';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '1', win2: '2', lose1: '3', lose2: '4',
      winScore: 11, loseScore: 8, rawText: input
    });
  });

  it('handles connected digits correctly (e.g. 116, 112, 118, 1210, 95)', () => {
    // 116 -> 11 and 6
    const r1 = parseVoiceInput('Sơn Tùng Hải Tuấn 116', mockPlayers);
    expect(r1.winScore).toBe(11);
    expect(r1.loseScore).toBe(6);

    // 112 -> 11 and 2
    const r2 = parseVoiceInput('Sơn Tùng Hải Tuấn 112', mockPlayers);
    expect(r2.winScore).toBe(11);
    expect(r2.loseScore).toBe(2);

    // 118 -> 11 and 8
    const r3 = parseVoiceInput('Sơn Tùng Hải Tuấn 118', mockPlayers);
    expect(r3.winScore).toBe(11);
    expect(r3.loseScore).toBe(8);

    // 1210 -> 12 and 10
    const r4 = parseVoiceInput('Sơn Tùng Hải Tuấn 1210', mockPlayers);
    expect(r4.winScore).toBe(12);
    expect(r4.loseScore).toBe(10);

    // 95 -> should not split and default to 11-5 (no 2-digit splits to protect 12, 13, 20 etc.)
    const r5 = parseVoiceInput('Sơn Tùng Hải Tuấn 95', mockPlayers);
    expect(r5.winScore).toBe(11);
    expect(r5.loseScore).toBe(5);

    // 11 -> Should default to 11-5 since it is excluded from splitting
    const r6 = parseVoiceInput('Sơn Tùng Hải Tuấn 11', mockPlayers);
    expect(r6.winScore).toBe(11);
    expect(r6.loseScore).toBe(5);
  });
});
