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
});
