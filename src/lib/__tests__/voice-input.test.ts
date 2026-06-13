import { describe, it, expect } from 'vitest';
import { parseVoiceInput } from '../voice-input';

describe('Voice Input Fuzzy Match', () => {
  const mockPlayers = [
    { id: '1', name: 'Nguyễn Thanh Sơn' },
    { id: '2', name: 'Trần Tùng' },
    { id: '3', name: 'Lê Hải' },
    { id: '4', name: 'Phạm Tuấn' },
    { id: '5', name: 'Vũ Đạt' },
    { id: '6', name: 'Nguyễn Phát' },
  ];

  it('extracts exactly 4 players and score from vietnamese numbers', () => {
    const input = 'Sơn Tùng mười một năm Hải Tuấn';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '1',
      win2: '2',
      lose1: '3',
      lose2: '4',
      winScore: 11,
      loseScore: 5,
    });
  });

  it('extracts players and defaults to 11-5 if no scores provided', () => {
    const input = 'Tùng Đạt Sơn Phát';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '2',
      win2: '5',
      lose1: '1',
      lose2: '6',
      winScore: 11,
      loseScore: 5,
    });
  });

  it('matches partial and misspelled names robustly', () => {
    const input = 'thanh sơn tun 15 13 hải tuân'; // "tun" vs "tùng", "tuân" vs "tuấn"
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '1',
      win2: '2',
      lose1: '3',
      lose2: '4',
      winScore: 15,
      loseScore: 13,
    });
  });

  it('extracts standard numbers', () => {
    const input = 'Sơn Tùng 11 8 Hải Tuấn';
    const result = parseVoiceInput(input, mockPlayers);

    expect(result).toEqual({
      win1: '1',
      win2: '2',
      lose1: '3',
      lose2: '4',
      winScore: 11,
      loseScore: 8,
    });
  });
});
