import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('transition-all duration-300', className)}
    >
      {/* Thân & Đầu chim non bo tròn cách điệu tối giản */}
      <path
        d="M30 65C30 45 45 30 60 30C75 30 85 42 85 55C85 70 70 82 50 82C38 82 30 75 30 65Z"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mắt tròn dễ thương */}
      <circle cx="58" cy="48" r="4.5" fill="currentColor" />
      {/* Mỏ chim nhỏ bé */}
      <path d="M85 50L95 54L84 58" fill="currentColor" />
      {/* Cánh nhỏ vẩy nhẹ */}
      <path
        d="M38 62C32 60 26 64 28 70C30 74 36 74 41 68"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Hai chân đậu vững chãi */}
      <path
        d="M48 82V90M48 90H43M48 90H53"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M62 82V90M62 90H57M62 90H67"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
