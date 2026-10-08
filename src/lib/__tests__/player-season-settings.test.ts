import { describe, expect, it } from 'vitest';
import { applyPlayerSeasonSettings, filterSeasonMatches, normalizePlayerName, playerNameKey, selectAnalysisPlayers, selectLeaderboardPlayers, selectScorePlayers, type SeasonSetting } from '../player-season-settings';
import { calculateLeaderboard } from '../stats';
import { calculateFineTotal } from '../fines';
import { buildAnalysisSnapshot } from '../analysis-core';
import { buildHallOfFameEntries } from '../hall-of-fame';

const players = ['A','B','C','D'].map(id => ({ id, name: id, active: true }));
const match = { id: 'm1', season: 'S1', date: '2026-01-01T10:00:00Z', win_1: 'A', win_2: 'B', lose_1: 'C', lose_2: 'D', win_score: 11, lose_score: 5 };
const matches = [match, { ...match, id: 'm2', season: 'S2' }];
const settings = ['S1','S2'].flatMap(season => players.map(p => ({ player_id: p.id, season, active: true, pay_fine: true, hidden: false, deleted_at: null as string | null })));
const ids = (rows: { id?: string }[]) => rows.map(p => p.id);
function changed(player: string, season: string, patch: Partial<SeasonSetting>) {
  return settings.map(s => s.player_id === player && s.season === season ? { ...s, ...patch } : s);
}

describe('season roster rules', () => {
  it('keeps an inactive player on the board and preserves all matches and fines', () => {
    const s = changed('A','S1',{ active: false });
    expect(ids(selectScorePlayers(players,'S1',s))).not.toContain('A');
    expect(ids(selectLeaderboardPlayers(players,'S1',s))).toContain('A');
    expect(filterSeasonMatches(matches,s)).toEqual(matches);
    expect(calculateLeaderboard(selectLeaderboardPlayers(players,'S1',s),[match],5000).find(p=>p.id==='B')?.wins).toBe(1);
    expect(calculateFineTotal([match], { playerSeasonSettings:s })).toBe(10000);
  });
  it('hidden only affects ranking, not input, profile, ELO opponents or fines', () => {
    const s = changed('A','S1',{ hidden:true });
    expect(ids(selectScorePlayers(players,'S1',s))).toContain('A');
    expect(ids(selectLeaderboardPlayers(players,'S1',s))).not.toContain('A');
    const snapshot = buildAnalysisSnapshot(players.map(p=>({...p, active:false, hidden:p.id==='A'})), [match]);
    expect(snapshot.metrics.has('A')).toBe(true);
    expect(ids(snapshot.board)).not.toContain('A');
    expect(snapshot.elo.rating.get('B')).toBe(buildAnalysisSnapshot(players,[match]).elo.rating.get('B'));
    expect(ids(selectAnalysisPlayers(players,[match]))).toContain('A');
  });
  it('does not enroll a globally active player in an unrelated season', () => {
    expect(selectScorePlayers(players,'S5',[],[match])).toEqual([]);
    expect(ids(applyPlayerSeasonSettings(players,'S1',[],[match]))).toEqual(['A','B','C','D']);
  });
  it('aggregate unions visibility instead of borrowing current season flags', () => {
    const s = changed('A','S2',{ active:false, hidden:true, deleted_at:'2026-01-02' });
    expect(ids(selectScorePlayers(players,null,s))).toContain('A');
    expect(ids(selectLeaderboardPlayers(players,null,s))).toContain('A');
    expect(filterSeasonMatches(matches,s).map(m=>m.id)).toEqual(['m1']);
  });
  it('deletion is per season, preserves toggles, and restoration respects other deletions', () => {
    const deleted = changed('A','S1',{ deleted_at:'2026-01-02' }).map(s=>s.player_id==='B'&&s.season==='S1'?{...s,deleted_at:'2026-01-02'}:s);
    expect(filterSeasonMatches(matches,deleted).map(m=>m.id)).toEqual(['m2']);
    const oneRestored = deleted.map(s=>s.player_id==='A'?{...s,deleted_at:null}:s);
    expect(filterSeasonMatches(matches,oneRestored).map(m=>m.id)).toEqual(['m2']);
    expect(filterSeasonMatches([...matches,{...match,id:'manual',deleted_at:'2026-01-01'}],settings).map(m=>m.id)).toEqual(['m1','m2']);
    expect(applyPlayerSeasonSettings(players,'S1',deleted)[0]).toMatchObject({active:true,hidden:false,deleted_at:'2026-01-02'});
  });
  it('sums fines by each match season, regardless of input and leaderboard flags', () => {
    const s = changed('C','S1',{ pay_fine:false, active:false, hidden:true });
    expect(calculateFineTotal(matches,{playerSeasonSettings:s,seasons:[{name:'S1',lose_money:5000},{name:'S2',lose_money:10000}]})).toBe(25000);
  });
  it('hall excludes hidden champions but still computes full matches', () => {
    const s = changed('A','S1',{hidden:true});
    const hall = buildHallOfFameEntries(players,[match],[{name:'S1',active:false}], 'S2',5000,s);
    expect(hall[0].playerId).toBe('B');
    expect(buildHallOfFameEntries(players,[match],[{name:'S1',active:false}], 'S2',5000,changed('A','S1',{deleted_at:'2026-01-02'}))).toEqual([]);
  });
  it('normalizes duplicate names across whitespace, case and Unicode encoding', () => {
    expect(normalizePlayerName('  Nguyễn   An  ')).toBe('Nguyễn An');
    expect(playerNameKey('  NGUYỄN   AN ')).toBe(playerNameKey('Nguyễn An'.normalize('NFD')));
  });
});
