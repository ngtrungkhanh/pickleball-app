import { LoaderCircle } from 'lucide-react';

export default function LocLoading() {
  return (
    <div className="min-h-dvh bg-slate-950 text-white flex items-center justify-center" role="status">
      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" />
        Đang mở tính điểm…
      </div>
    </div>
  );
}
