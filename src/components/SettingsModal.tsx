'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
  EyeOff,
} from 'lucide-react';
import {
  addPlayerAction,
  createSeasonAction,
  deleteChampionImageAction,
  deletePlayerAction,
  deleteSeasonAction,
  endSeasonAction,
  setActiveSeasonAction,
  updatePlayerAction,
  uploadChampionImageAction,
  updatePlayerSeasonSettingsAction,
  updateSeasonFineAction,
} from '@/app/actions';
import { cn } from '@/lib/utils';
import { type AppCachePart, type StoredPlayerSeasonSetting } from '@/lib/db';
import { GUEST_NAME, isGuestId } from '@/lib/guest';
import { buildHallOfFameEntries, type HallOfFameEntry } from '@/lib/hall-of-fame';
import { getGlobalSelectedSeason, setGlobalSelectedSeason, isGlobalSeasonSet } from '@/lib/season-state';

type Player = { id: string; name: string; active?: boolean; pay_fine?: boolean; hidden?: boolean; deleted_at?: unknown };
type Match = { id?: string; date?: string; season?: string; deleted_at?: unknown; [key: string]: unknown };
type Season = {
  id: string;
  name: string;
  active?: boolean;
  start_date?: string;
  champion_image_url?: string | null;
  champion_image_path?: string | null;
  champion_image_updated_at?: string | null;
  lose_money?: number;
};
type ActionResult = { error?: string; success?: boolean; url?: string };
type Feedback = { target: string; type: 'saving' | 'success' | 'error'; text: string } | null;

type Props = {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onUnlock: (password: string) => boolean;
  onLock: () => void;
  players: Player[];
  matches: Match[];
  seasons: Season[];
  config: Record<string, string>;
  playerSeasonSettings?: StoredPlayerSeasonSetting[];
  onDataChanged?: (parts?: AppCachePart[]) => void;
};

const tabs = [
  { id: 'access', label: 'Quyền', Icon: Lock },
  { id: 'players', label: 'Thành viên', Icon: Users },
  { id: 'seasons', label: 'Season', Icon: Trophy },
  { id: 'hall', label: 'Vinh danh', Icon: ImageIcon },
  { id: 'money', label: 'Tiền phạt', Icon: Banknote },
] as const;

function InlineFeedback({ feedback, target }: { feedback: Feedback; target: string }) {
  if (!feedback || feedback.target !== target) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-black',
        feedback.type === 'error' ? 'text-red-400' : 'text-primary',
      )}
    >
      {feedback.type === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      {feedback.text}
    </span>
  );
}

function HallImagePreview({ entry }: { entry: HallOfFameEntry }) {
  return (
    <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl border border-amber-200/25 bg-slate-950/75 sm:w-24">
      {entry.imageUrl ? (
        <div
          role="img"
          aria-label={`Ảnh vinh danh ${entry.playerName}`}
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url("${entry.imageUrl}")` }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.22),transparent_45%),linear-gradient(145deg,rgba(251,191,36,0.10),rgba(15,23,42,0.75))]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-100/35 bg-amber-200/10 text-xl font-black text-amber-100">
            {entry.playerName.trim().charAt(0).toUpperCase() || 'C'}
          </div>
        </div>
      )}
    </div>
  );
}

function actionError(res: { success?: boolean } | { error?: string } | undefined) {
  return res && 'error' in res ? res.error : undefined;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image'));
    };
    image.src = url;
  });
}

async function resizeChampionImage(file: File) {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    throw new Error('Chỉ hỗ trợ JPG, PNG hoặc WebP.');
  }

  const image = await loadImage(file);
  const targetWidth = 900;
  const targetHeight = 1200;
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể xử lý ảnh trên trình duyệt này.');
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

  const qualities = [0.86, 0.76, 0.66, 0.56];
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= 1.5 * 1024 * 1024) {
      return new File([blob], 'champion.webp', { type: 'image/webp' });
    }
  }

  throw new Error('Ảnh sau xử lý vẫn lớn hơn 1.5MB.');
}

export function SettingsModal({ open, onClose, canEdit, onUnlock, onLock, players, matches, seasons, config, playerSeasonSettings = [], onDataChanged }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>(canEdit ? 'players' : 'access');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);
  const [deleteSeasonTarget, setDeleteSeasonTarget] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const isPending = isSaving || isRefreshing;

  const [selectedConfigSeason, setSelectedConfigSeason] = useState<string>(
    getGlobalSelectedSeason(config.active_season || '') || config.active_season || ''
  );

  const activeSeasonVal = config.active_season || '';

  useEffect(() => {
    if (!isGlobalSeasonSet() && activeSeasonVal) {
      const id = window.setTimeout(() => setSelectedConfigSeason(activeSeasonVal), 0);
      return () => window.clearTimeout(id);
    }
  }, [activeSeasonVal]);

  const handleConfigSeasonChange = (season: string) => {
    setSelectedConfigSeason(season);
    setGlobalSelectedSeason(season);
  };

  const getPlayerSetting = (playerId: string, seasonName: string) => {
    const setting = playerSeasonSettings?.find(s => s.player_id === playerId && s.season === seasonName);
    if (setting) {
      return {
        active: setting.active !== false,
        pay_fine: setting.pay_fine !== false,
        hidden: setting.hidden === true
      };
    }
    const p = players.find(x => x.id === playerId);
    return {
      active: p?.active !== false,
      pay_fine: p?.pay_fine !== false,
      hidden: p?.hidden === true
    };
  };

  const hallEntries = useMemo(
    () => buildHallOfFameEntries(
      players,
      matches,
      seasons,
      config.active_season || 'Season 1',
      Number(config.lose_money || 5000),
      playerSeasonSettings || [],
    ),
    [players, matches, seasons, config.active_season, config.lose_money, playerSeasonSettings],
  );

  // Reset tab when modal opens
  useEffect(() => {
    if (!open) return;

    const resetId = window.setTimeout(() => {
      setTab(canEdit ? 'players' : 'access');
      setFeedback(null);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [open, canEdit]);

  if (!open) return null;

  const submit = async (action: (fd: FormData) => Promise<ActionResult>, formData: FormData, target: string, successText = 'Đã lưu', changedParts?: AppCachePart[]) => {
    if (isPending) return;
    setFeedback({ target, type: 'saving', text: 'Đang lưu...' });
    setIsSaving(true);
    try {
      const res = await action(formData);
      const error = actionError(res);
      if (error) {
        setFeedback({ target, type: 'error', text: error });
        setIsSaving(false);
        return;
      }

      setFeedback({ target, type: 'success', text: successText });
      startTransition(() => {
        onDataChanged?.(changedParts);
        router.refresh();
        setIsSaving(false);
      });
    } catch {
      setIsSaving(false);
    }
  };

  const submitDirect = async (action: () => Promise<ActionResult>, target: string, successText = 'Đã lưu', changedParts?: AppCachePart[]) => {
    if (isPending) return;
    setFeedback({ target, type: 'saving', text: 'Đang lưu...' });
    setIsSaving(true);
    try {
      const res = await action();
      const error = actionError(res);
      if (error) {
        setFeedback({ target, type: 'error', text: error });
        setIsSaving(false);
        return;
      }
      setFeedback({ target, type: 'success', text: successText });
      startTransition(() => {
        onDataChanged?.(changedParts);
        router.refresh();
        setIsSaving(false);
      });
    } catch {
      setIsSaving(false);
    }
  };

  const uploadChampionImage = async (entry: HallOfFameEntry, file: File | null) => {
    if (!file || isPending) return;
    const target = `hall-${entry.season}`;
    setFeedback({ target, type: 'saving', text: 'Đang xử lý ảnh...' });
    setIsSaving(true);
    try {
      const resized = await resizeChampionImage(file);
      const fd = new FormData();
      fd.append('seasonName', entry.season);
      fd.append('file', resized);
      const res = await uploadChampionImageAction(fd);
      const error = actionError(res);
      if (error) {
        setFeedback({ target, type: 'error', text: error });
        setIsSaving(false);
        return;
      }
      setFeedback({ target, type: 'success', text: 'Đã tải ảnh' });
      startTransition(() => {
        onDataChanged?.(['seasons']);
        router.refresh();
        setIsSaving(false);
      });
    } catch (error) {
      setFeedback({
        target,
        type: 'error',
        text: error instanceof Error ? error.message : 'Không xử lý được ảnh.',
      });
      setIsSaving(false);
    }
  };

  const deleteChampionImage = async (entry: HallOfFameEntry) => {
    if (isPending) return;
    const target = `hall-${entry.season}`;
    setFeedback({ target, type: 'saving', text: 'Đang xóa ảnh...' });
    setIsSaving(true);
    try {
      const fd = new FormData();
      fd.append('seasonName', entry.season);
      const res = await deleteChampionImageAction(fd);
      const error = actionError(res);
      if (error) {
        setFeedback({ target, type: 'error', text: error });
        setIsSaving(false);
        return;
      }
      setFeedback({ target, type: 'success', text: 'Đã xóa ảnh' });
      startTransition(() => {
        onDataChanged?.(['seasons']);
        router.refresh();
        setIsSaving(false);
      });
    } catch {
      setIsSaving(false);
    }
  };

  const visibleTabs = canEdit 
    ? [...tabs.filter(t => t.id !== 'access'), tabs.find(t => t.id === 'access')!]
    : tabs.filter(t => t.id === 'access');
  const activeTab = tab;

  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div 
        className="relative w-full sm:max-w-4xl h-[92vh] sm:h-[640px] sm:rounded-3xl rounded-t-[2.5rem] border border-slate-500/25 bg-[#142034] shadow-[0_28px_90px_rgba(0,0,0,0.42)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 duration-300"
      >
        <div className="flex items-center justify-between px-6 py-3.5 sm:py-5 border-b border-slate-500/25 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Cài đặt</h2>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-300/70 uppercase tracking-widest mt-0.5">
              {canEdit ? 'Đang có quyền chỉnh sửa' : 'Nhập mật khẩu để mở khóa'}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center text-slate-300/80 transition-all active:scale-90">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col sm:grid sm:grid-cols-[220px_1fr]">
          {/* Menu - Grid on Mobile, Sidebar on Desktop */}
          <div className="shrink-0 p-2 sm:p-4 border-b border-slate-500/25 bg-white/[0.035] sm:bg-white/[0.05]">
            <div className="grid grid-cols-2 sm:flex sm:flex-col gap-1 sm:gap-2">
              {visibleTabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-4 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all',
                    activeTab === id 
                      ? 'bg-primary text-black shadow-lg shadow-primary/20 sm:scale-105' 
                      : 'text-slate-300/70 hover:text-white hover:bg-white/[0.08]',
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5 sm:w-4 h-4", activeTab === id ? "opacity-100" : "opacity-40")} />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Season Selector for Configuration */}
            {canEdit && (activeTab === 'players' || activeTab === 'money') && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-500/20 pb-4 shrink-0">
                <div className="text-xs font-black text-slate-300 uppercase tracking-widest">
                  Mùa giải đang cấu hình
                </div>
                <select
                  value={selectedConfigSeason}
                  onChange={(e) => handleConfigSeasonChange(e.target.value)}
                  className="rounded-xl bg-[#0f1a2c] border border-slate-500/25 px-4 py-2 text-xs font-bold text-white outline-none focus:border-primary/50 transition-all min-w-44"
                >
                  {seasons.map(s => (
                    <option key={s.id} value={s.name}>{s.name} {s.active ? '(Đang diễn ra)' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === 'access' && (
              <div className="rounded-2xl border border-slate-500/25 bg-white/[0.055] p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center border",
                    canEdit ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/[0.07] border-slate-400/20 text-slate-300/65"
                  )}>
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-black text-white text-lg tracking-tight">{canEdit ? 'Quyền chỉnh sửa đang mở' : 'Mở quyền chỉnh sửa'}</div>
                    <p className="text-xs font-bold text-slate-300/65 uppercase tracking-widest">Xác thực để thay đổi dữ liệu</p>
                  </div>
                </div>

                {!canEdit ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="flex-1 rounded-2xl bg-[#0f1a2c] border border-slate-500/25 px-5 py-4 text-white outline-none focus:border-primary/60 focus:bg-[#111f34] transition-all"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const ok = onUnlock(password);
                          if (ok) {
                            setPassword('');
                            onClose();
                          } else {
                            setFeedback({ target: 'access', type: 'error', text: 'Sai pass' });
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const ok = onUnlock(password);
                        if (ok) {
                          setPassword('');
                          onClose();
                        } else {
                          setFeedback({ target: 'access', type: 'error', text: 'Sai pass' });
                        }
                      }}
                      className="rounded-2xl bg-primary px-8 py-4 text-xs font-black text-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                      Mở khóa
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        onLock();
                        setFeedback({ target: 'access', type: 'success', text: 'Đã khóa quyền chỉnh sửa' });
                      }}
                      className="rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] px-8 py-4 text-xs font-black text-slate-200/85 uppercase tracking-widest transition-all active:scale-95"
                    >
                      Khóa lại
                    </button>
                  </div>
                )}
                <div className="mt-3">
                  <InlineFeedback feedback={feedback} target="access" />
                </div>
              </div>
            )}

            {canEdit && activeTab === 'players' && (
              <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-300/65 uppercase tracking-[0.2em] px-1">Thêm thành viên</div>
                    <form action={(fd) => submit(addPlayerAction, fd, 'add-player', 'Đã thêm', ['players'])} className="flex gap-2">
                      <input name="name" placeholder="Tên thành viên..." className="flex-1 rounded-xl bg-[#0f1a2c] border border-slate-500/25 px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all" />
                      <button disabled={isPending} className="rounded-xl bg-primary px-5 py-2.5 text-[10px] font-black text-black uppercase tracking-widest active:scale-95 transition-all">Thêm</button>
                    </form>
                    <InlineFeedback feedback={feedback} target="add-player" />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-300/65 uppercase tracking-[0.2em] px-1">Danh sách thành viên</div>
                    <div className="grid grid-cols-1 gap-1" key={selectedConfigSeason}>
                      {[...players]
                        .map(p => {
                          const s = getPlayerSetting(p.id, selectedConfigSeason);
                          return {
                            ...p,
                            active: s.active,
                            pay_fine: s.pay_fine,
                            hidden: s.hidden
                          };
                        })
                        .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1))
                        .map(p => (
                          <div key={p.id} className={cn(
                            "group flex items-center gap-2 rounded-xl border p-1.5 transition-all",
                            p.active !== false 
                              ? "bg-white/[0.045] border-slate-500/20 hover:bg-white/[0.07]"
                              : "bg-black/20 border-slate-500/12 opacity-55"
                          )}>
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <input 
                                defaultValue={isGuestId(p.id) ? GUEST_NAME : p.name}
                                disabled={isGuestId(p.id)}
                                onBlur={(e) => {
                                  if (!isGuestId(p.id) && e.target.value.trim() !== p.name) {
                                    const fd = new FormData();
                                    fd.append('id', p.id);
                                    fd.append('name', e.target.value.trim());
                                    fd.append('active', String(p.active !== false));
                                    fd.append('pay_fine', String(p.pay_fine !== false));
                                    fd.append('hidden', String(p.hidden === true));
                                    submit(updatePlayerAction, fd, `player-${p.id}`, 'Đã lưu', ['players', 'playerSeasonSettings']);
                                  }
                                }}
                                className="flex-1 bg-transparent px-2 py-0.5 text-sm font-bold text-white outline-none focus:text-primary transition-colors min-w-0 disabled:text-primary disabled:cursor-not-allowed" 
                              />
                              <InlineFeedback feedback={feedback} target={`player-${p.id}`} />
                            </div>
                            
                            <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/[0.08] rounded-lg transition-colors shrink-0">
                              <input 
                                type="checkbox" 
                                defaultChecked={p.active !== false} 
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  submitDirect(
                                      () => updatePlayerSeasonSettingsAction(p.id, selectedConfigSeason, isChecked, p.pay_fine !== false, p.hidden === true),
                                      `player-${p.id}`,
                                      'Đã lưu',
                                      ['playerSeasonSettings']
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-0 focus:ring-offset-0" 
                              />
                              <span className="text-[9px] font-black text-slate-300/65 uppercase tracking-widest hidden sm:inline">{isGuestId(p.id) ? 'Dropdown' : 'Active'}</span>
                            </label>

                            {!isGuestId(p.id) && (
                              <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/[0.08] rounded-lg transition-colors shrink-0" title="Phạt tiền">
                                <input 
                                  type="checkbox" 
                                  defaultChecked={p.pay_fine !== false} 
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    submitDirect(
                                      () => updatePlayerSeasonSettingsAction(p.id, selectedConfigSeason, p.active !== false, isChecked, p.hidden === true),
                                      `player-${p.id}`,
                                      'Đã lưu',
                                      ['playerSeasonSettings']
                                    );
                                  }}
                                  className="w-3.5 h-3.5 rounded border-amber-500/20 bg-white/5 text-amber-500 focus:ring-0 focus:ring-offset-0" 
                                />
                                <Banknote className="w-3.5 h-3.5 text-amber-500 hidden sm:inline" />
                              </label>
                            )}

                            {!isGuestId(p.id) && (
                              <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/[0.08] rounded-lg transition-colors shrink-0" title="Ẩn khỏi BXH">
                                <input 
                                  type="checkbox" 
                                  defaultChecked={p.hidden === true} 
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    submitDirect(
                                      () => updatePlayerSeasonSettingsAction(p.id, selectedConfigSeason, p.active !== false, p.pay_fine !== false, isChecked),
                                      `player-${p.id}`,
                                      'Đã lưu',
                                      ['playerSeasonSettings']
                                    );
                                  }}
                                  className="w-3.5 h-3.5 rounded border-slate-500/20 bg-white/5 text-slate-400 focus:ring-0 focus:ring-offset-0" 
                                />
                                <EyeOff className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
                              </label>
                            )}

                            {!isGuestId(p.id) && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(p)}
                                className="w-7 h-7 rounded-lg border border-red-500/10 bg-red-500/5 text-red-400/20 hover:text-red-400 hover:bg-red-500/15 flex items-center justify-center transition-all shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
            )}

            {canEdit && activeTab === 'seasons' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-slate-300/70 uppercase tracking-[0.2em] px-1">Tạo Season mới</div>
                    <form action={(fd) => submit(createSeasonAction, fd, 'create-season', 'Đã tạo', ['seasons', 'config'])} className="flex gap-2">
                      <input name="name" placeholder="Tên Season..." className="flex-1 rounded-2xl bg-[#0f1a2c] border border-slate-500/25 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all" />
                      <button disabled={isPending} className="rounded-2xl bg-primary px-4 py-3 text-[10px] font-black text-black uppercase tracking-widest shadow-lg shadow-primary/10 active:scale-95 transition-all">Tạo</button>
                    </form>
                    <InlineFeedback feedback={feedback} target="create-season" />
                  </div>

                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-slate-300/70 uppercase tracking-[0.2em] px-1">Kết thúc nhanh</div>
                    <button 
                      onClick={() => submit(endSeasonAction, new FormData(), 'end-season', 'Đã bắt đầu Season mới', ['seasons', 'config'])}
                      disabled={isPending}
                      className="w-full rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-slate-500/25 px-5 py-3 text-[10px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Trophy className="w-4 h-4 text-primary" />
                      Kết thúc & Sang Season mới
                    </button>
                    <InlineFeedback feedback={feedback} target="end-season" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[10px] font-black text-slate-300/65 uppercase tracking-[0.2em] px-1">Danh sách Season</div>
                  <div className="grid grid-cols-1 gap-2">
                    {seasons.map(s => (
                      <div key={s.id || s.name} className={cn(
                        "group flex items-center justify-between gap-4 rounded-2xl border p-3 transition-all",
                        s.active 
                          ? "bg-primary/5 border-primary/20" 
                          : "bg-white/[0.045] border-slate-500/20 hover:bg-white/[0.07]"
                      )}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-black text-white text-base tracking-tight truncate">{s.name}</span>
                          {s.active && <span className="px-2 py-0.5 rounded-full bg-primary text-[8px] font-black text-black uppercase tracking-widest">Active</span>}
                          <InlineFeedback feedback={feedback} target={`season-${s.name}`} />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!s.active && (
                            <form action={(fd) => submit(setActiveSeasonAction, fd, `season-${s.name}`, 'Đã kích hoạt', ['seasons', 'config'])}>
                              <input type="hidden" name="name" value={s.name} />
                              <button disabled={isPending} className="rounded-lg bg-white/[0.07] hover:bg-white/[0.12] px-3 py-1.5 text-[9px] font-black text-slate-300/80 hover:text-white uppercase tracking-widest transition-all">
                                Kích hoạt
                              </button>
                            </form>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteSeasonTarget(s.name)}
                            className="w-8 h-8 rounded-lg border border-red-500/10 bg-red-500/5 text-red-400/20 hover:text-red-400 hover:bg-red-500/15 flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {canEdit && activeTab === 'hall' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200/25 bg-amber-200/10 text-amber-100">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-white">Ảnh vinh danh champion</h3>
                      <p className="mt-1 text-xs font-bold leading-relaxed text-slate-300/65">
                        Ảnh được gắn theo Season đã kết thúc, không gắn vào hồ sơ người chơi. Hệ thống sẽ crop về tỉ lệ 3:4 và lưu dưới dạng WebP.
                      </p>
                    </div>
                  </div>
                </div>

                {hallEntries.length === 0 ? (
                  <div className="rounded-2xl border border-slate-500/20 bg-white/[0.045] p-6 text-sm font-bold text-slate-300/60">
                    Chưa có Season đã kết thúc có champion để tải ảnh.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {hallEntries.map((entry) => {
                      const target = `hall-${entry.season}`;
                      return (
                        <div key={entry.season} className="rounded-2xl border border-slate-500/20 bg-white/[0.045] p-3 sm:p-4">
                          <div className="flex gap-3 sm:gap-4">
                            <HallImagePreview entry={entry} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">{entry.season}</div>
                                  <div className="mt-1 truncate text-base font-black text-white">{entry.playerName}</div>
                                  <div className="mt-1 text-xs font-bold text-slate-300/55">
                                    {Math.round(entry.winRate)}% · {entry.wins}W-{entry.losses}L · {entry.total} trận
                                  </div>
                                </div>
                                <InlineFeedback feedback={feedback} target={target} />
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <label className={cn(
                                  "inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black transition-all active:scale-95",
                                  isPending && "pointer-events-none opacity-60",
                                )}>
                                  <Upload className="h-3.5 w-3.5" />
                                  Tải ảnh
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    disabled={isPending}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0] || null;
                                      uploadChampionImage(entry, file);
                                      event.target.value = '';
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={isPending || !entry.imageUrl}
                                  onClick={() => deleteChampionImage(entry)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-300 transition-all hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-35 active:scale-95"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Xóa ảnh
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {canEdit && activeTab === 'money' && (() => {
              const selectedSeasonInfo = seasons.find(s => s.name === selectedConfigSeason);
              const currentSeasonLoseMoney = selectedSeasonInfo?.lose_money !== undefined ? selectedSeasonInfo.lose_money : Number(config.lose_money || 5000);

              const handleSaveSeasonFine = (e: React.FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const amount = Number(fd.get('lose_money') || 5000);
                const seasonId = selectedSeasonInfo?.id || selectedConfigSeason;
                
                submitDirect(
                  () => updateSeasonFineAction(seasonId, amount),
                  'fine',
                  'Đã lưu',
                  ['seasons', 'config']
                );
              };

              return (
                <div className="space-y-4">
                  <div className="text-[10px] font-black text-slate-300/70 uppercase tracking-[0.2em] px-1">Cấu hình tài chính</div>
                  <form onSubmit={handleSaveSeasonFine} className="space-y-5 rounded-2xl border border-slate-500/25 bg-white/[0.055] p-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-300/75 uppercase tracking-widest">Mức phạt mỗi lượt thua ({selectedConfigSeason})</label>
                      <div className="relative">
                        <input key={selectedConfigSeason} name="lose_money" type="number" defaultValue={currentSeasonLoseMoney} className="w-full rounded-2xl bg-[#0f1a2c] border border-slate-500/25 px-5 py-4 text-white font-black text-xl outline-none focus:border-primary/50 transition-all pl-12" />
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300/65 font-black text-lg">₫</div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <InlineFeedback feedback={feedback} target="fine" />
                      <button disabled={isPending} className="rounded-2xl bg-primary px-10 py-4 text-xs font-black text-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all">Lưu cấu hình</button>
                    </div>
                  </form>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Delete Player Modal */}
        {deleteTarget && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-md p-6">
            <div className="w-full max-w-sm rounded-[2.5rem] border border-red-500/20 bg-[#142034] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                   <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Xóa thành viên & Trận?</h3>
                  <p className="mt-2 text-sm font-bold text-slate-300/70 leading-relaxed">
                    Hành động này sẽ xóa **{deleteTarget.name}** và **toàn bộ lịch sử trận** liên quan. Dữ liệu sẽ được lưu vào kho lưu trữ (Archive).
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] px-4 py-4 text-xs font-black text-slate-300/75 uppercase tracking-widest transition-all">Hủy</button>
                  <button
                    onClick={() => {
                      if (isPending) return;
                      const fd = new FormData();
                      fd.append('id', deleteTarget.id);
                      setFeedback({ target: 'delete-player', type: 'saving', text: 'Đang xóa...' });
                      setIsSaving(true);
                      (async () => {
                        try {
                          const res = await deletePlayerAction(fd);
                          const error = actionError(res);
                          if (error) {
                            setFeedback({ target: 'delete-player', type: 'error', text: error });
                            setIsSaving(false);
                            return;
                          }
                          setFeedback({ target: 'delete-player', type: 'success', text: 'Đã xóa' });
                          onDataChanged?.(['players', 'matches', 'playerSeasonSettings']);
                          setDeleteTarget(null);
                          startTransition(() => {
                            router.refresh();
                            setIsSaving(false);
                          });
                        } catch {
                          setIsSaving(false);
                        }
                      })();
                    }}
                    className="flex-1 rounded-2xl bg-red-500 hover:bg-red-600 px-4 py-4 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                  >
                    Xóa sạch
                  </button>
                </div>
                <InlineFeedback feedback={feedback} target="delete-player" />
              </div>
            </div>
          </div>
        )}

        {/* Delete Season Modal */}
        {deleteSeasonTarget && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-md p-6">
            <div className="w-full max-w-sm rounded-[2.5rem] border border-red-500/20 bg-[#142034] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                   <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Xóa Season & Trận?</h3>
                  <p className="mt-2 text-sm font-bold text-slate-300/70 leading-relaxed">
                    Xóa **{deleteSeasonTarget}** và toàn bộ trận đấu trong season này. Dữ liệu sẽ được backup vào Archive.
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setDeleteSeasonTarget(null)} className="flex-1 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] px-4 py-4 text-xs font-black text-slate-300/75 uppercase tracking-widest transition-all">Hủy</button>
                  <button
                    onClick={() => {
                      if (isPending) return;
                      const fd = new FormData();
                      fd.append('name', deleteSeasonTarget);
                      setFeedback({ target: 'delete-season', type: 'saving', text: 'Đang xóa...' });
                      setIsSaving(true);
                      (async () => {
                        try {
                          const res = await deleteSeasonAction(fd);
                          const error = actionError(res);
                          if (error) {
                            setFeedback({ target: 'delete-season', type: 'error', text: error });
                            setIsSaving(false);
                            return;
                          }
                          setFeedback({ target: 'delete-season', type: 'success', text: 'Đã xóa' });
                          onDataChanged?.(['seasons', 'matches', 'config', 'playerSeasonSettings']);
                          setDeleteSeasonTarget(null);
                          startTransition(() => {
                            router.refresh();
                            setIsSaving(false);
                          });
                        } catch {
                          setIsSaving(false);
                        }
                      })();
                    }}
                    className="flex-1 rounded-2xl bg-red-500 hover:bg-red-600 px-4 py-4 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                  >
                    Xóa sạch
                  </button>
                </div>
                <InlineFeedback feedback={feedback} target="delete-season" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
