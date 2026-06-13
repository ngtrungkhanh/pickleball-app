# Hướng dẫn cho Coding Agent

## Giao tiếp

- Luôn giao tiếp và lập kế hoạch bằng tiếng Việt.
- Trình bày ngắn, trực tiếp, nêu rõ file đã đổi và cách đã kiểm tra.
- **Người dùng không tự chạy lệnh hay thao tác code trên máy cá nhân.** Agent phải tự thao tác Git, tự chạy test và deploy. Người dùng chỉ nghiệm thu UI/UX trên web preview (Vercel) hoặc production.
- Không dùng tài liệu Markdown như nhật ký chat hoặc nơi lưu prompt bàn giao.

## Đọc trước khi làm

1. Đọc `README.md`.
2. Đọc file chuyên sâu đúng với phạm vi công việc:
   - `docs/PRODUCT.md` khi đổi hành vi, luồng người dùng hoặc giao diện.
   - `docs/ARCHITECTURE.md` khi đổi database, server action, cache hoặc deploy.
   - Khi đổi ELO, radar, Network hoặc Hub insights, đọc trực tiếp
     `src/lib/analysis-core.ts`, `src/lib/insights.ts` và audit script liên quan.
3. Chỉ đọc `CHANGELOG.md` khi cần lịch sử thay đổi.
4. Dùng `rg` và đọc code liên quan trước khi tin vào mô tả trong tài liệu.

Thứ tự nguồn sự thật:

1. Code, schema và test đang chạy.
2. Tài liệu chuyên sâu hiện hành.
3. `CHANGELOG.md` và lịch sử Git.

Nếu tài liệu mâu thuẫn với code, kiểm chứng hành vi rồi cập nhật tài liệu trong
cùng thay đổi.

## Quy trình Git và deploy

- `main` là production.
- `dev` là nhánh làm việc chung và tạo Vercel Preview.
- Không commit trực tiếp lên `main`.
- Không tự merge `dev` vào `main`; chỉ release khi người dùng xác nhận.
- Trước khi pull, switch branch hoặc merge, kiểm tra working tree và không làm
  mất thay đổi chưa commit của người dùng.
- Production và Preview dùng database riêng. Merge code không merge dữ liệu.
- Chỉ nhánh Preview `dev` được bật `ALLOW_PREVIEW_WRITES=true`.

## Quy tắc an toàn

- Không commit `.env.local`, secret hoặc credential.
- Không chạy migration/drop/alter hay helper import có tính phá hủy trên
  production nếu chưa được người dùng phê duyệt rõ ràng.
- Không xóa cứng dữ liệu người dùng khi vẫn có thể soft-delete/restore.
- Giữ Preview write guard.
- File source, config và Markdown phải là UTF-8 không BOM.

## Bất biến sản phẩm

- Ứng dụng mobile-first. Thứ tự review UI: mobile, Full HD, 2K, 4K.
- Postgres là nguồn dữ liệu chuẩn; IndexedDB chỉ là cache có thể thay thế.
- Dashboard là điểm đồng bộ manifest chính; Analysis ưu tiên cache local.
- Không thêm polling nền nếu chưa có lý do rõ ràng.
- Trận mới phải dùng `config.active_season`, có `matches.id` và `matches.date`.
- Form ghi điểm cần đủ 4 vị trí người chơi.
- Guest được ghi trong lịch sử nhưng không tính ranking/analytics.
- Giữ optimistic save, pending retry và duplicate confirmation của ghi điểm.
- Analysis là read-only trừ khi người dùng đổi định hướng sản phẩm.
- `legacy/` chỉ để tham khảo, không phải nguồn sự thật.

## Kiểm tra

Chọn mức kiểm tra theo phạm vi thay đổi:

```bash
npm run test
npx eslint <changed-files>
npx tsc --noEmit
npm run build
```

- Hệ thống dùng Vitest để tự động hóa test. Khi sửa đổi logic cốt lõi (ELO, Ranking) hoặc thêm tính năng xử lý dữ liệu phức tạp (như xử lý text nhận diện giọng nói), BẮT BUỘC phải viết test vào thư mục `src/lib/__tests__/`.
- Repo có thể còn lint debt cũ; ưu tiên ESLint đúng các file đã sửa.
- Với lịch sử trận đấu, có thể dùng `npm run visual:test:history`.
- Với Hub insights, dùng
  `npm run audit:insights -- <backup.json> --seeds 1000`.
- Build local cần pooled Postgres URL nếu route được kiểm tra phải truy cập DB.

## Quy chuẩn tài liệu

- `README.md`: cách chạy, deploy và bản đồ repo.
- `AGENTS.md`: luật ổn định dành cho coding agent.
- `docs/PRODUCT.md`: hành vi người dùng và UI hiện hành.
- `docs/ARCHITECTURE.md`: kiến trúc, dữ liệu, cache và write flow.
- `CHANGELOG.md`: các thay đổi đáng chú ý, không lưu snapshot commit/branch.

Không tạo file `PLAN.md`, `HANDOFF.md`, `CONTEXT.md` hoặc bản audit lâu dài nếu
nội dung chỉ phục vụ một phiên làm việc. Kế hoạch tạm thời để trong task/chat;
lịch sử chi tiết đã có Git. Không chép bảng rule, type hoặc template từ code sang
Markdown khi code có thể tự xuất hoặc audit chúng.
