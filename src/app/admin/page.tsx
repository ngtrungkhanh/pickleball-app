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
  RefreshCw
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
  togglePlayerActiveAction
} from '@/app/actions';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const adminTabs = ['Nhật ký & Hệ thống', 'Thành viên', 'Season', 'Trận đấu'];

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState(adminTabs[0]);
  
  const [logs, setLogs] = useState<any[]>([]);
  const [archives, setArchives] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isPending, startTransition] = useTransition();

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
      if (res.success) {
        setIsAuth(true);
        // loadData will be triggered by useEffect
      } else {
        setMsg({ type: 'error', text: res.error || 'Mật khẩu sai rồi sếp ơi!' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Lỗi kết nối server.' });
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
      setMsg({ type: 'error', text: 'Không thể tải dữ liệu từ server.' });
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
      if (res.success) {
        setMsg({ type: 'success', text: 'Đã đồng bộ lại toàn bộ số liệu thành công!' });
        loadData();
      } else {
        setMsg({ type: 'error', text: res.error || 'Lỗi rồi!' });
      }
    });
  };

  const onRestore = (id: number) => {
    startTransition(async () => {
      const res = await restoreFromArchive(id);
      if (res.success) {
        setMsg({ type: 'success', text: 'Đã khôi phục dữ liệu thành công!' });
        loadData();
      } else {
        setMsg({ type: 'error', text: res.error || 'Lỗi rồi!' });
      }
    });
  };

  const onTogglePlayer = async (pid: string, current: boolean) => {
    const res = await togglePlayerActiveAction(pid, !current);
    if (res.success) loadData();
  };

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
                  <input placeholder="Tìm theo tên..." className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/30">
                      <th className="px-6 py-4">Ngày</th>
                      <th className="px-6 py-4">Thắng</th>
                      <th className="px-6 py-4">Tỷ số</th>
                      <th className="px-6 py-4">Thua</th>
                      <th className="px-6 py-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {matches.map(m => (
                      <tr key={m.id} className="hover:bg-white/[0.02] transition-all">
                        <td className="px-6 py-4 text-xs font-bold text-white/40">{new Date(m.date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm font-black text-primary truncate max-w-[150px]">{m.win_1}{m.win_2 ? ` / ${m.win_2}` : ''}</td>
                        <td className="px-6 py-4"><span className="bg-white/5 px-2 py-1 rounded-lg font-black text-xs">{m.win_score}-{m.lose_score}</span></td>
                        <td className="px-6 py-4 text-sm font-bold text-white/60 truncate max-w-[150px]">{m.lose_1}{m.lose_2 ? ` / ${m.lose_2}` : ''}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => { if(confirm('Xóa trận này?')) deleteMatchAction(m.id).then(loadData) }} className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
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
                {players.map(p => (
                  <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center justify-between group">
                    <div>
                      <p className="text-lg font-black text-white group-hover:text-primary transition-colors">{p.name}</p>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{p.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => onTogglePlayer(p.id, p.active)}
                        className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", 
                        p.active ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-red-500/10 text-red-400 hover:bg-red-500/20")}
                      >
                        {p.active ? 'Active' : 'Inactive'}
                      </button>
                      <button onClick={() => { if(confirm('Xóa vĩnh viễn thành viên này?')) deletePlayerAction(new FormData()).then(loadData) }} className="p-2 hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
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
