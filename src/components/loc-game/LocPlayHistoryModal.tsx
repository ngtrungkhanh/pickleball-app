'use client';

import React from 'react';
import { RoundPlayRecord } from '@/lib/loc-game/network-types';
import { LocCard } from './LocCard';
import { X, History } from 'lucide-react';

interface LocPlayHistoryModalProps {
  records: RoundPlayRecord[];
  onClose: () => void;
  isPaused?: boolean;
}

export const LocPlayHistoryModal: React.FC<LocPlayHistoryModalProps> = ({
  records,
  onClose,
  isPaused = false,
}) => {
  // Sắp xếp theo phương dọc: Lượt mới nhất ở trên, lá nào đánh trước ở dưới.
  // Khi người dùng cuộn/kéo lên trên sẽ tới lá đầu tiên được đánh.
  const displayRecords = [...records].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90cqh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-black text-sm sm:text-base text-white">
                Lịch Sử Đánh Bài Ván Này
              </h3>
              <p className="text-[11px] text-slate-400">
                {records.length > 0
                  ? `Tổng cộng ${records.length} lượt đánh (Lá đánh trước ở dưới cùng)`
                  : 'Chưa có lượt đánh nào'}
              </p>
              {isPaused && <p className="text-[11px] text-amber-300">Ván đang tạm dừng, đóng lịch sử để tiếp tục.</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* NỘI DUNG LỊCH SỬ NƯỚC ĐI */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 select-none">
          {displayRecords.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Chưa có ai đánh lá bài nào trong ván này.
            </div>
          ) : (
            displayRecords.map((record, index) => (
              <React.Fragment key={record.id}>
                <div className="flex items-center justify-between gap-3 py-1">
                  {/* BÊN TRÁI: TÊN NGƯỜI ĐÁNH & THÔNG TIN LƯỢT */}
                  <div className="flex flex-col min-w-0 max-w-[130px] sm:max-w-[170px]">
                    <span className="font-extrabold text-xs sm:text-sm text-amber-300 truncate">
                      {record.playerName}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                      Lượt #{record.turnIndex}
                    </span>
                  </div>

                  {/* BÊN PHẢI: CÁC LÁ BÀI ĐÃ ĐÁNH */}
                  <div className="flex items-center justify-end -space-x-5 sm:-space-x-6 overflow-visible py-1">
                    {record.cards.map((card, cardIdx) => (
                      <div
                        key={card.id}
                        style={{ zIndex: 10 + cardIdx }}
                        className="transition-transform hover:scale-105"
                      >
                        <LocCard card={card} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* DẤU NGANG PHÂN CÁCH CÁC LƯỢT ĐÁNH */}
                {index < displayRecords.length - 1 && (
                  <hr className="border-slate-800/80 my-1" />
                )}
              </React.Fragment>
            ))
          )}
        </div>

        {/* FOOTER ĐÓNG */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
