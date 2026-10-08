import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ queries: [] as string[], values: [] as unknown[][], rows: [] as {id:string;name:string}[], blocked:false, count:1 }));
vi.mock('@vercel/postgres', () => {
  const query = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?'); mocks.queries.push(text); mocks.values.push(values);
    if (text.includes('SELECT id, name FROM players')) return {rows:mocks.rows,rowCount:mocks.rows.length};
    if (text.includes('SELECT id FROM seasons WHERE name') && text.includes('OR id')) return {rows:[],rowCount:0};
    if (text.includes('SELECT name FROM seasons')) return {rows:[{name:'S1'}],rowCount:1};
    if (text.includes('SELECT id FROM seasons')) return {rows:[{id:'S1'}],rowCount:1};
    return {rows:[],rowCount:mocks.count};
  });
  return {sql:Object.assign(query,{connect:async()=>({sql:query,release:vi.fn()})})};
});
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/server',()=>({after:vi.fn()}));
vi.mock('@vercel/blob',()=>({del:vi.fn(),put:vi.fn()}));
vi.mock('../environment',()=>({shouldBlockPreviewWrites:()=>mocks.blocked,previewWriteBlockedResult:()=>({error:'blocked'})}));
vi.mock('../data-version',()=>({APP_DATA_PARTS:[],bumpDataVersions:vi.fn(),ensureConfigTable:vi.fn(),getAppManifest:vi.fn(),nextDataVersion:vi.fn()}));
vi.mock('../data-delta',()=>({ensureDeltaLogAfterFallback:vi.fn(),readAppDataChanges:vi.fn(),recordAppDataReset:vi.fn()}));
import { addPlayerAction, createSeasonAction, setPlayerSeasonDeletedAction, updatePlayerAction, updatePlayerSeasonSettingsAction } from '../../app/actions';
const form = (values:Record<string,string>) => {const fd=new FormData();Object.entries(values).forEach(([k,v])=>fd.set(k,v));return fd;};
beforeEach(()=>{mocks.queries=[];mocks.values=[];mocks.rows=[];mocks.blocked=false;mocks.count=1;});

describe('player season writes',()=>{
  it('renames globally without copying seasonal flags into the player',async()=>{
    expect(await updatePlayerAction(form({id:'A',name:'  An   Nguyễn ',active:'false',hidden:'true'}))).toEqual({success:true});
    const index=mocks.queries.findIndex(q=>q.includes('UPDATE players'));
    expect(mocks.queries[index]).toBe('UPDATE players SET name = ? WHERE id = ?');
    expect(mocks.values[index]).toEqual(['An Nguyễn','A']);
    expect(mocks.queries.some(q=>q.includes('UPDATE player_season_settings'))).toBe(false);
  });
  it('rejects duplicate creation including deleted identities and rolls back',async()=>{
    mocks.rows=[{id:'OLD',name:'Nguyễn An'}];
    expect(await addPlayerAction(form({name:' NGUYỄN   AN ',season:'S2'}))).toHaveProperty('error');
    expect(mocks.queries).toContain('ROLLBACK');
    expect(mocks.queries.some(q=>q.includes('INSERT INTO players'))).toBe(false);
  });
  it('deletes and restores only season membership, leaving match deletions untouched',async()=>{
    await setPlayerSeasonDeletedAction('A','S1',true);
    await setPlayerSeasonDeletedAction('A','S1',false);
    expect(mocks.queries.filter(q=>q.startsWith('UPDATE'))).toHaveLength(2);
    expect(mocks.queries.filter(q=>q.startsWith('UPDATE')).every(q=>q.includes('player_season_settings')&&q.includes('season = ?'))).toBe(true);
    expect(mocks.values[0]).toEqual([true,'A','S1']);
    expect(mocks.values.some(v=>v[0]===false&&v[1]==='A'&&v[2]==='S1')).toBe(true);
  });
  it('patches one flag and rejects writes to a deleted roster row',async()=>{
    mocks.count=0;
    expect(await updatePlayerSeasonSettingsAction('A','S1',{hidden:true})).toHaveProperty('error');
    expect(mocks.values[0]).toEqual([null,null,true,'A','S1']);
    expect(mocks.queries[0]).toContain('deleted_at IS NULL');
  });
  it('copies prior season roster including deleted state atomically',async()=>{
    expect(await createSeasonAction(form({name:'S2'}))).toEqual({success:true});
    expect(mocks.queries).toContain('BEGIN');
    expect(mocks.queries).toContain('COMMIT');
    const index=mocks.queries.findIndex(q=>q.includes('SELECT player_id,'));
    expect(mocks.queries[index]).toContain('active, pay_fine, hidden, deleted_at FROM player_season_settings');
    expect(mocks.values[index]).toEqual(['S2','S1']);
    expect(mocks.queries[index]).not.toContain('deleted_at IS NULL');
  });
  it('keeps preview write guard for all player mutations',async()=>{
    mocks.blocked=true;
    expect(await addPlayerAction(form({name:'A',season:'S1'}))).toEqual({error:'blocked'});
    expect(await updatePlayerAction(form({id:'A',name:'B'}))).toEqual({error:'blocked'});
    expect(await setPlayerSeasonDeletedAction('A','S1',true)).toEqual({error:'blocked'});
    expect(await updatePlayerSeasonSettingsAction('A','S1',{active:false})).toEqual({error:'blocked'});
    expect(await createSeasonAction(form({name:'S2'}))).toEqual({error:'blocked'});
    expect(mocks.queries).toEqual([]);
  });
});
