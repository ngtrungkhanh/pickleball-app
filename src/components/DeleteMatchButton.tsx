'use client';
import { Trash2 } from 'lucide-react';
import { deleteMatchAction } from '@/app/actions';
import { useTransition, useState } from 'react';
import { cn } from '@/lib/utils';

export function DeleteMatchButton({ matchId }: { matchId: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-red-500/80 uppercase tracking-widest">Xóa?</span>
        <button
          onClick={() => {
            setConfirmed(false);
            startTransition(async () => { await deleteMatchAction(matchId); });
          }}
          className="px-3 py-1 rounded-lg bg-red-500 text-white font-black text-[10px] uppercase tracking-widest active:scale-90"
        >
          Xác nhận
        </button>
        <button
          onClick={() => setConfirmed(false)}
          className="px-3 py-1 rounded-lg bg-white/5 text-white/40 font-black text-[10px] uppercase tracking-widest active:scale-90"
        >
          Hủy
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirmed(true)}
      disabled={isPending}
      className={cn("text-white/15 hover:text-red-400 transition-all p-1.5 hover:bg-red-500/10 rounded-lg active:scale-90", isPending && "opacity-40")}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
