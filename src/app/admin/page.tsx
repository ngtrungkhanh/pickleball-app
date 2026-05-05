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
  verifyAdminAction 
} from '@/app/actions';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isPending, startTransition] = useTransition();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    checkPass(pass);
  };

  const checkPass = async (input: string) => {
    setLoading(true);
    const res = await verifyAdminAction(input);
    if (res.success) {
      setIsAuth(true);
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Mật khẩu sai rồi sếp ơi!' });
    }
    setLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    const [l, a] = await Promise.all([getAuditLogs(), getArchives()]);
    setLogs(l);
    setArchives(a);
    setLoading(false);
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
      <div className="max-w-6xl mx-auto space-y-8">
        
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
            <button 
              onClick={loadData}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Làm mới
            </button>
            <button 
              onClick={onRebuild}
              className="px-6 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all"
            >
              <RotateCcw className="w-4 h-4" /> Đồng bộ số liệu
            </button>
          </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Logs Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-sm uppercase tracking-widest">Nhật ký hoạt động</h3>
                </div>
                <span className="text-[10px] font-bold text-white/20 uppercase bg-white/5 px-2 py-1 rounded-md">100 bản ghi mới nhất</span>
              </div>
              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="p-12 text-center text-white/10 italic text-sm">Chưa có nhật ký nào được ghi lại...</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="p-5 hover:bg-white/[0.02] transition-all flex items-start gap-4">
                      <div className="mt-1">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          log.action_type.includes('ADD') ? "bg-green-500/10 text-green-400" : 
                          log.action_type.includes('DELETE') ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"
                        )}>
                          {log.action_type.includes('ADD') ? <CheckCircle2 className="w-4 h-4" /> : 
                           log.action_type.includes('DELETE') ? <Trash2 className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{log.action_type}</span>
                          <span className="text-[10px] font-bold text-white/15 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> {new Date(log.created_at).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white/80 leading-relaxed">{log.details}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Area: Archives */}
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-400" />
                <h3 className="font-black text-sm uppercase tracking-widest">Thùng rác</h3>
              </div>
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {archives.length === 0 ? (
                  <div className="p-12 text-center text-white/10 italic text-xs">Thùng rác trống</div>
                ) : (
                  archives.map((item) => (
                    <div key={item.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3 group">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{item.type}</span>
                        <span className="text-[9px] font-bold text-white/10">{new Date(item.deleted_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                          <User className="w-5 h-5 text-white/30" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white/80 truncate">{item.name}</p>
                          <p className="text-[10px] font-bold text-white/20 italic">ID: {item.original_id}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => onRestore(item.id)}
                        disabled={isPending}
                        className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-primary/20 hover:text-primary transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Khôi phục
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Stats Sidebar */}
            <div className="bg-primary/5 border border-primary/10 rounded-3xl p-6 space-y-4">
              <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Hệ thống</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/30 font-bold">Database</span>
                  <span className="text-primary font-black">CONNECTED</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/30 font-bold">ISR Cache</span>
                  <span className="text-primary font-black">ACTIVE</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/30 font-bold">Logs</span>
                  <span className="text-primary font-black">{logs.length} entries</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
