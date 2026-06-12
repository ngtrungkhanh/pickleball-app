# Pickleball Ranking Dashboard

Dashboard nội bộ để ghi điểm pickleball đôi, xếp hạng, lịch sử, tiền phạt,
season, Hall of Fame và phân tích ELO.

- Production: <https://conchimnon.vercel.app/>
- Preview nhánh `dev`:
  <https://pickleball-app-git-dev-ngtrungkhanhs-projects.vercel.app/>

Stack chính: Next.js App Router, React, Tailwind CSS, Vercel Postgres, Vercel
Blob và Vercel Hosting.

## Bắt đầu

```bash
npm install
npm run dev
```

Mở <http://localhost:3000/>.

Các lệnh thường dùng:

```bash
npx eslint <changed-files>
npx tsc --noEmit
npm run build
npm run visual:test:history
npm run audit:insights -- pickleball_backup_2026-06-08.json --seeds 1000
```

`npm run lint` có thể báo lint debt cũ của toàn repo; với thay đổi nhỏ, ưu tiên
ESLint đúng các file đã sửa.

## Tài liệu

- `AGENTS.md`: luật làm việc dành cho coding agent.
- `docs/PRODUCT.md`: hành vi sản phẩm và quy tắc UI.
- `docs/ARCHITECTURE.md`: database, cache, server action và deploy.
- `CHANGELOG.md`: các mốc thay đổi đáng chú ý.

Chỉ đọc tài liệu chuyên sâu liên quan tới task. Code và test đang chạy vẫn là
nguồn sự thật cao nhất.

## Route chính

- `/`: Dashboard, leaderboard, ghi điểm và lịch sử.
- `/analysis`: trung tâm phân tích read-only.
- `/admin`: quản trị dữ liệu, backup/restore và import.
- `/api/setup`, `/api/migrate`, `/api/restore`: route vận hành dữ liệu có rủi ro,
  không dùng như tính năng thông thường.

## Cấu trúc repo

- `src/app`: route, API route và server actions.
- `src/components`: Dashboard, Settings, Admin và Analysis UI.
- `src/lib`: thống kê, analysis core, insights, cache và database helpers.
- `scripts`: audit/visual test và công cụ hỗ trợ.
- `public`: static assets.
- `legacy`: Apps Script cũ, chỉ để tham khảo.
- `docs`: tài liệu hiện hành, không lưu prompt bàn giao.

## Branch và deploy

- `main` là production.
- `dev` là nhánh làm việc chung và tạo Vercel Preview.
- Preview và Production dùng database riêng.
- Chỉ merge `dev` vào `main` sau khi người dùng xác nhận release.
- Không commit secret hoặc `.env.local`.

UI phải được review theo thứ tự mobile, Full HD, 2K rồi 4K.
