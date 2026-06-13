import { FastAddShell } from './FastAddShell';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Nhập điểm siêu tốc - Pickleball',
  manifest: '/manifest.json',
};

export default function FastAddPage() {
  return (
    <div className="min-h-screen bg-[#0d1421] text-slate-200">
      <div className="max-w-md md:max-w-5xl mx-auto p-4 pt-10">
        <h2 className="text-2xl font-bold mb-6 text-center text-primary">Nhập điểm siêu tốc</h2>
        <FastAddShell previewWritesBlocked={shouldBlockPreviewWrites()} />
      </div>
    </div>
  );
}
