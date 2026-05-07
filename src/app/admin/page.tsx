'use client';
import { useState, useEffect, useTransition } from 'react';
import {
  ShieldCheck,
  History,
  RotateCcw,
  Database,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  ArrowLeft,
  Search,
  RefreshCw,
  Upload
} from 'lucide-react';
import {
  getAuditLogs,
  getArchives,
  restoreFromArchive,
  rebuildStatsAction,
  verifyAdminAction,
  updatePlayerAction,
  addPlayerAction,
  deletePlayerAction,
  getMatchesAfterAction,
  deleteMatchAction,
  getPlayersAction,
  getSeasonsAction,
  togglePlayerActiveAction,
  updateMatchAction
} from '@/app/actions';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const adminTabs = ['Nhật ký & Hệ thống', 'Thành viên', 'Season', 'Trận đấu'];
const ADMIN_AUTH_DATE_KEY = 'pickleball_admin_auth_date';

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<Array<{ getFile: () => Promise<File> }>>;
};

function actionSucceeded(res: { success?: boolean } | { error?: string } | undefined) {
  return Boolean(res && 'success' in res && res.success);
}

function actionError(res: { success?: boolean } | { error?: string } | undefined, fallback: string) {
  return res && 'error' in res && res.error ? res.error : fallback;
}

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState(adminTabs[0]);

  const [logs, setLogs] = useState<any[]>([]);
  const [archives, setArchives] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchSearch, setMatchSearch] = useState('');

  // Inline editing states
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerName, setEditPlayerName] = useState('');

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editMatchData, setEditMatchData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString('en-CA');
      if (localStorage.getItem(ADMIN_AUTH_DATE_KEY) === today) {
        setIsAuth(true);
      }
    } catch {}
  }, []);

  // Task 20: Auto-load data on auth
  useEffect(() => {
    if (isAuth) {
      loadData();
    }
  }, [isAuth]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    checkPass(pass);
  };

  const checkPass = async (input: string) => {
    setLoading(true);
    try {
      const res = await verifyAdminAction(input);
      if (actionSucceeded(res)) {
        try {
          const today = new Date().toLocaleDateString('en-CA');
          localStorage.setItem(ADMIN_AUTH_DATE_KEY, today);
        } catch {}
        setIsAuth(true);
        // loadData will be triggered by useEffect
      } else {
        setMsg({ type: 'error', text: actionError(res, 'Máº­t kháº©u sai rá»“i sáº¿p Æ¡i!') });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Lá»—i káº¿t ná»‘i server.' });
    }
    setLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    console.log('Admin: Loading all data...');
    try {
      const [l, a, p, s, m] = await Promise.all([
        getAuditLogs(),
        getArchives(),
        getPlayersAction(),
        getSeasonsAction(),
        getMatchesAfterAction('')
      ]);
      console.log('Admin Data Loaded:', { logs: l?.length, players: p?.length, matches: m?.length });
      setLogs(l || []);
      setArchives(a || []);
      setPlayers(p || []);
      setSeasons(s || []);
      setMatches(m || []);
    } catch (err) {
      console.error('Admin Load Failed:', err);
      setMsg({ type: 'error', text: 'KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u tá»« server.' });
    }
    setLoading(false);
  };

  const onBackup = () => {
    const data = { players, matches, logs, archives, seasons, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pickleball_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const onRebuild = () => {
    if (!confirm('Bạn có chắc muốn tính toán lại toàn bộ số liệu không?')) return;
    startTransition(async () => {
      const res = await rebuildStatsAction();
      if (actionSucceeded(res)) {
        setMsg({ type: 'success', text: 'Đã đồng bộ lại toàn bộ số liệu thành công!' });
        loadData();
      } else {
        setMsg({ type: 'error', text: actionError(res, 'Lỗi rồi!') });
      }
    });
  };

  const deferImport = (file: File | null) => {
    if (!file) return;
    setTimeout(() => {
      void onImportXlsx(file);
    }, 0);
  };

  const openFallbackFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.onchange = () => {
      const file = input.files?.[0] || null;
      input.remove();
      deferImport(file);
    };
    document.body.appendChild(input);
    input.click();
  };

  const onPickXlsx = async () => {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      openFallbackFilePicker();
      return;
    }

    try {
      const [handle] = await picker({
        multiple: false,
        types: [
          {
            description: 'Excel workbook',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
      });
      deferImport(handle ? await handle.getFile() : null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMsg({ type: 'error', text: 'Không thể mở file XLSX.' });
    }
  };

  const onImportXlsx = async (file: File | null) => {
    if (!file) return;
    if (!confirm('Import từ file sẽ xóa toàn bộ lịch sử trận hiện có và thay bằng dữ liệu trong sheet MATCHES. Tiếp tục?')) {
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/migrate', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: json?.error || 'Import thất bại.' });
      } else {
        setMsg({ type: 'success', text: `Đã import ${json?.inserted ?? 0} trận từ file XLSX.` });
        await loadData();
      }
    } catch {
      setMsg({ type: 'error', text: 'Lỗi kết nối khi import XLSX.' });
    } finally {
      setLoading(false);
    }
  };

  const onRestore = (id: number) => {
    startTransition(async () => {
      const res = await restoreFromArchive(id);
      if (actionSucceeded(res)) {
        setMsg({ type: 'success', text: 'Đã khôi phục dữ liệu thành công!' });
        loadData();
      } else {
        setMsg({ type: 'error', text: actionError(res, 'Lỗi rồi!') });
      }
    });
  };

  const onTogglePlayer = async (pid: string, current: boolean) => {
    const res = await togglePlayerActiveAction(pid, !current);
    if (actionSucceeded(res)) loadData();
  };

  const onSavePlayer = async (pid: string) => {
    if (!editPlayerName.trim()) return alert('Tên thành viên không được để trống');
    const fd = new FormData();
    fd.append('id', pid);
    fd.append('name', editPlayerName.trim());
    fd.append('active', 'true'); // Keep active by default when editing name
    
    setLoading(true);
    const res = await updatePlayerAction(fd);
    if (actionSucceeded(res)) {
      setEditingPlayerId(null);
      loadData();
    } else {
      alert(actionError(res, 'Lỗi khi cập nhật thành viên'));
    }
    setLoading(false);
  };

  const onSaveMatch = async (mid: string) => {
    if (!editMatchData) return;
    const fd = new FormData();
    fd.append('id', mid);
    fd.append('win_1', editMatchData.win_1);
    if (editMatchData.win_2) fd.append('win_2', editMatchData.win_2);
    fd.append('lose_1', editMatchData.lose_1);
    fd.append('lose_2', editMatchData.lose_2);
    fd.append('win_score', String(editMatchData.win_score));
    fd.append('lose_score', String(editMatchData.lose_score));
    if (editMatchData.date) fd.append('date', editMatchData.date);

    setLoading(true);
    const res = await updateMatchAction(fd);
    if (actionSucceeded(res)) {
      setEditingMatchId(null);
      loadData();
    } else {
      alert(actionError(res, 'Lỗi khi cập nhật trận đấu'));
    }
    setLoading(false);
  };

  const playerName = (id?: string | null) => players.find(p => p.id === id)?.name || id || '';
  const visibleMatches = [...matches]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter(m => {
      const q = matchSearch.trim().toLowerCase();
      if (!q) return true;
      const text = [
        m.id,
        m.season,
        m.created_by,
        m.win_score,
        m.lose_score,
        playerName(m.win_1),
        playerName(m.win_2),
        playerName(m.lose_1),
        playerName(m.lose_2),
        new Date(m.date).toLocaleString('vi-VN'),
      ].join(' ').toLowerCase();
      return text.includes(q);
    });

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-primary/10 rounded-[2rem] border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter">Admin <span className="text-primary italic">Center</span></h1>
            <p className="text-white/30 font-bold text-sm uppercase tracking-widest">Khu vực điều hành cấp cao</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative group">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Nhập mật khẩu Admin..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-5 text-white placeholder:text-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-center font-bold tracking-widest"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-black font-black py-5 rounded-2xl transition-all active:scale-95 shadow-xl shadow-primary/20 uppercase tracking-widest text-xs"
            >
              {loading ? 'Đang kiểm tra...' : 'Xác nhận quyền'}
            </button>
            {msg.text && (
              <p className={cn("text-center text-xs font-bold animate-pulse", msg.type === 'error' ? "text-red-400" : "text-primary")}>
                {msg.text}
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-8 border-b border-white/5">
          <div className="flex items-center gap-5">
            <Link href="/" className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all active:scale-90">
              <ArrowLeft className="w-5 h-5 text-white/40" />
            </Link>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Trung tâm <span className="text-primary">Điều hành</span></h1>
              <p className="text-xs font-bold text-white/20 uppercase tracking-widest mt-1">Quản trị hệ thống Pickleball</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onPickXlsx} className="px-5 py-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all">
              <Upload className="w-4 h-4" /> Import XLSX
            </button>
            <button onClick={onBackup} className="px-5 py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all">
              <Database className="w-4 h-4" /> Sao lưu dữ liệu
            </button>
            <button onClick={onRebuild} className="px-5 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all">
              <RotateCcw className="w-4 h-4" /> Đồng bộ số liệu
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {adminTabs.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "shrink-0 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                activeTab === t ? "bg-primary text-black border-primary" : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {msg.text && (
          <div className={cn(
            "p-4 rounded-2xl flex items-center gap-3 border animate-in slide-in-from-top-2",
            msg.type === 'success' ? "bg-primary/10 border-primary/20 text-primary" : "bg-red-500/10 border-red-500/20 text-red-400"
          )}>
            {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-bold">{msg.text}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'Nhật ký & Hệ thống' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
                <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <History className="w-5 h-5 text-primary" />
                    <h3 className="font-black text-sm uppercase tracking-widest">Nhật ký hoạt động</h3>
                  </div>
                </div>
                <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="p-12 text-center text-white/10 italic text-sm">Chưa có nhật ký nào...</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="p-5 hover:bg-white/[0.02] flex items-start gap-4">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          log.action_type.includes('ADD') ? "bg-green-500/10 text-green-400" :
                            log.action_type.includes('DELETE') ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400")}>
                          {log.action_type.includes('ADD') ? <CheckCircle2 className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{log.action_type}</span>
                            <span className="text-[10px] font-bold text-white/15">{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                          </div>
                          <p className="text-sm font-bold text-white/80">{log.details}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
                  <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
                    <Trash2 className="w-5 h-5 text-red-400" />
                    <h3 className="font-black text-sm uppercase tracking-widest">Thùng rác</h3>
                  </div>
                  <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                    {archives.map(item => (
                      <div key={item.id} className="bg-white/[0.03] p-4 rounded-2xl space-y-3">
                        <div className="flex justify-between text-[9px] font-black uppercase text-white/20">
                          <span>{item.type}</span>
                          <span>{new Date(item.deleted_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm font-black text-white/80">{item.name}</p>
                        <button onClick={() => onRestore(item.id)} className="w-full py-2 bg-white/5 hover:bg-primary/20 text-[10px] font-black uppercase rounded-xl transition-all">Khôi phục</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Trận đấu' && (
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-black text-sm uppercase tracking-widest">Quản lý Lịch sử Trận đấu</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    value={matchSearch}
                    onChange={e => setMatchSearch(e.target.value)}
                    placeholder="Tìm theo tên, season, thiết bị..."
                    className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs"
                  />
                </div>
              </div>
              <div className="px-6 py-3 border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/25">
                Đang hiện {visibleMatches.length}/{matches.length} trận · Mới nhất lên trước
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/30">
                      <th className="px-6 py-4">Thời gian</th>
                      <th className="px-6 py-4">Thắng</th>
                      <th className="px-6 py-4">Tỷ số</th>
                      <th className="px-6 py-4">Thua</th>
                      <th className="px-6 py-4">Thiết bị gửi</th>
                      <th className="px-6 py-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visibleMatches.map(m => {
                      const isEditing = editingMatchId === m.id;
                      const matchDate = new Date(m.date);
                      // Adjust to local datetime string format for inputs: YYYY-MM-DDTHH:mm
                      const tzOffset = matchDate.getTimezoneOffset() * 60000;
                      const localISOTime = new Date(matchDate.getTime() - tzOffset).toISOString().slice(0, 16);

                      const formattedTime = matchDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + matchDate.toLocaleDateString('vi-VN');

                      if (isEditing) {
                        return (
                          <tr key={m.id} className="bg-white/[0.03]">
                            <td className="px-6 py-4">
                              <input
                                type="datetime-local"
                                value={editMatchData?.date || ''}
                                onChange={e => setEditMatchData({ ...editMatchData, date: e.target.value })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold"
                              />
                            </td>
                            <td className="px-6 py-4 space-y-1">
                              <select
                                value={editMatchData?.win_1 || ''}
                                onChange={e => setEditMatchData({ ...editMatchData, win_1: e.target.value })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold w-full"
                              >
                                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <select
                                value={editMatchData?.win_2 || ''}
                                onChange={e => setEditMatchData({ ...editMatchData, win_2: e.target.value })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold w-full"
                              >
                                <option value="">(Không có người 2)</option>
                                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                            <td className="px-6 py-4 flex items-center gap-1">
                              <input
                                type="number"
                                value={editMatchData?.win_score ?? ''}
                                onChange={e => setEditMatchData({ ...editMatchData, win_score: parseInt(e.target.value) })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold w-12 text-center"
                              />
                              <span className="text-white/20 font-bold">-</span>
                              <input
                                type="number"
                                value={editMatchData?.lose_score ?? ''}
                                onChange={e => setEditMatchData({ ...editMatchData, lose_score: parseInt(e.target.value) })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold w-12 text-center"
                              />
                            </td>
                            <td className="px-6 py-4 space-y-1">
                              <select
                                value={editMatchData?.lose_1 || ''}
                                onChange={e => setEditMatchData({ ...editMatchData, lose_1: e.target.value })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold w-full"
                              >
                                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <select
                                value={editMatchData?.lose_2 || ''}
                                onChange={e => setEditMatchData({ ...editMatchData, lose_2: e.target.value })}
                                className="bg-slate-950 text-white border border-white/10 rounded px-2 py-1 text-xs font-bold w-full"
                              >
                                <option value="">(Không có người 2)</option>
                                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-white/20">
                              {m.created_by || 'Chưa có dữ liệu'}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <button
                                onClick={() => onSaveMatch(m.id)}
                                className="px-3 py-1 bg-primary hover:bg-primary/95 text-black rounded-lg text-[10px] font-black uppercase tracking-wider"
                              >
                                Lưu
                              </button>
                              <button
                                onClick={() => setEditingMatchId(null)}
                                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                              >
                                Hủy
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={m.id} className="hover:bg-white/[0.02] transition-all">
                          <td className="px-6 py-4 text-xs font-bold text-white/40">{formattedTime}</td>
                          <td className="px-6 py-4 text-sm font-black text-primary max-w-[260px] line-clamp-2 break-words leading-snug">
                            {playerName(m.win_1)}
                            {m.win_2 ? ` / ${playerName(m.win_2)}` : ''}
                          </td>
                          <td className="px-6 py-4">
                            <span className="bg-white/5 px-2 py-1 rounded-lg font-black text-xs">
                              {m.win_score}-{m.lose_score}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-white/60 max-w-[260px] line-clamp-2 break-words leading-snug">
                            {playerName(m.lose_1)}
                            {m.lose_2 ? ` / ${playerName(m.lose_2)}` : ''}
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-blue-400/80 truncate max-w-[180px]">
                            {m.created_by || 'Chưa có dữ liệu'}
                          </td>
                          <td className="px-6 py-4 text-right space-x-1">
                            <button
                              onClick={() => {
                                setEditingMatchId(m.id);
                                setEditMatchData({
                                  win_1: m.win_1,
                                  win_2: m.win_2 || '',
                                  lose_1: m.lose_1,
                                  lose_2: m.lose_2 || '',
                                  win_score: m.win_score,
                                  lose_score: m.lose_score,
                                  date: localISOTime
                                });
                              }}
                              className="px-2.5 py-1.5 hover:bg-primary/20 text-primary rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => { if (confirm('Xóa trận này?')) deleteMatchAction(m.id).then(loadData) }}
                              className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-all inline-flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Thành viên' && (
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5">
                <h3 className="font-black text-sm uppercase tracking-widest">Danh sách Thành viên</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-6 gap-4">
                {players.map(p => {
                  const isEditing = editingPlayerId === p.id;
                  return (
                    <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center justify-between group">
                      <div className="flex-1 min-w-0 mr-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editPlayerName}
                              onChange={e => setEditPlayerName(e.target.value)}
                              className="bg-slate-950 text-white border border-white/10 rounded-xl px-3 py-1.5 text-sm font-black w-full"
                              autoFocus
                            />
                            <button
                              onClick={() => onSavePlayer(p.id)}
                              className="px-3 py-1.5 bg-primary hover:bg-primary/95 text-black rounded-lg text-[9px] font-black uppercase"
                            >
                              Lưu
                            </button>
                            <button
                              onClick={() => setEditingPlayerId(null)}
                              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-black uppercase"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/title">
                            <div>
                              <p className="text-lg font-black text-white group-hover:text-primary transition-colors">{p.name}</p>
                              <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{p.id}</p>
                            </div>
                            <button
                              onClick={() => {
                                setEditingPlayerId(p.id);
                                setEditPlayerName(p.name);
                              }}
                              className="text-[10px] font-black uppercase tracking-wider text-white/20 hover:text-primary transition-colors ml-2 shrink-0"
                            >
                              [Sửa]
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onTogglePlayer(p.id, p.active)}
                          className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            p.active ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-red-500/10 text-red-400 hover:bg-red-500/20")}
                        >
                          {p.active ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => { if (confirm('Xóa vĩnh viễn thành viên này?')) {
                          const fd = new FormData();
                          fd.append('id', p.id);
                          deletePlayerAction(fd).then(loadData);
                        }}} className="p-2 hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'Season' && (
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5">
                <h3 className="font-black text-sm uppercase tracking-widest">Quản lý Seasons</h3>
              </div>
              <div className="p-6 grid gap-4">
                {seasons.map(s => (
                  <div key={s.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-white">{s.name}</h4>
                      <p className="text-xs font-bold text-white/30">Bắt đầu: {new Date(s.start_date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.active ? (
                        <span className="bg-primary/20 text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase">Đang kích hoạt</span>
                      ) : (
                        <button className="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white/40">Kích hoạt</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}





