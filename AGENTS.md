# Hướng dẫn cho Coding Agent

## Giao tiếp

- Luôn giao tiếp và lập kế hoạch bằng tiếng Việt.
- Trình bày ngắn, trực tiếp, nêu rõ file đã đổi và cách đã kiểm tra.
- **Người dùng không tự chạy lệnh hay thao tác code.** Agent tự thao tác Git,
  kiểm tra và đưa thay đổi ứng dụng lên remote/Vercel theo nhánh đang làm việc khi cần nghiệm thu.
  Tác vụ chỉ đọc hoặc chỉ sửa tài liệu không cần deploy.
- Không dùng tài liệu Markdown như nhật ký chat hoặc nơi lưu prompt bàn giao.

## Đọc trước khi làm

1. Đọc `README.md` một lần trong chat; đọc lại phần liên quan khi file thay đổi.
2. Dùng `rg` định vị code và chỉ đọc mục tài liệu liên quan:
   - `docs/PRODUCT.md` khi đổi hành vi, luồng người dùng hoặc giao diện.
   - `docs/ARCHITECTURE.md` khi đổi database, server action, cache hoặc deploy.
   - Khi đổi ELO, radar, Network hoặc Hub insights, đọc hàm liên quan trong
     `src/lib/analysis-core.ts`, `src/lib/insights.ts` và audit script cần dùng.
3. Chỉ đọc `CHANGELOG.md` khi cần lịch sử thay đổi.
4. Không đọc toàn bộ repo, backup hay log dài khi đã đủ thông tin. Mở rộng phạm
   vi khi có dependency, lỗi kiểm tra hoặc bằng chứng cụ thể.

## Phạm vi và điều kiện hoàn thành

- Phân loại: chỉ đọc, tài liệu, UI nhỏ, logic hoặc thay đổi rủi ro cao.
- Tác vụ nhẹ chỉ cần một câu nêu cách làm; tác vụ nhiều bước dùng kế hoạch ngắn trong chat.
- Hoàn thành yêu cầu đã giao; không tự thêm refactor, audit toàn repo hoặc backlog.
- Chỉ dùng sub-agent khi người dùng yêu cầu; không tự tạo chat/automation mới.
- Tận dụng kết quả đã đọc/kiểm tra. Không chạy lại trên cùng trạng thái đã đạt,
  trừ khi có thay đổi mới hoặc nghi ngờ kết quả không còn hợp lệ.
- Khi đủ yêu cầu và kiểm tra phù hợp đã đạt, báo kết quả rồi kết thúc. Nếu bị
  chặn, nêu nguyên nhân và phần còn thiếu; không lặp một thao tác lỗi vô hạn.
- README hướng dẫn người dùng ở `docs/agent-workflow/README.md` không phải tài
  liệu bắt buộc đọc mỗi task. Không tự đổi model/cấu hình tài khoản.

Thứ tự nguồn sự thật:

1. Code, schema và test đang chạy.
2. Tài liệu chuyên sâu hiện hành.
3. `CHANGELOG.md` và lịch sử Git.

Nếu tài liệu mâu thuẫn với code, kiểm chứng hành vi rồi cập nhật tài liệu trong
cùng thay đổi.

## Quy trình Git và deploy

- Làm việc trực tiếp trên nhánh hiện tại (`main` hoặc `dev` theo trạng thái làm việc của người dùng).
- Nếu người dùng đang làm việc trên `main`, commit và push trực tiếp lên `main`.
- Nếu đang làm việc trên `dev`, commit và push lên `dev`.
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

- Ứng dụng mobile-first. Sửa UI nhỏ: mobile và desktop liên quan. Đổi layout
  chung/responsive: review mobile, Full HD, 2K, 4K theo thứ tự này.
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

Chọn kiểm tra theo ảnh hưởng thực tế; ít file đổi không đồng nghĩa ít rủi ro:

| Phạm vi | Kiểm tra cần chạy |
| --- | --- |
| Chỉ đọc, rà soát, đề xuất | Kiểm chứng nguồn liên quan; không test/build/deploy |
| Chỉ Markdown | Diff, liên kết nội bộ, UTF-8 không BOM; không test/build/deploy ứng dụng |
| Text/CSS/UI nhỏ, không đổi logic | ESLint file source đổi; TypeScript nếu đổi TS/TSX; review UI liên quan; xác nhận build Vercel thành công |
| Logic ứng dụng | Test liên quan, ESLint file đổi, TypeScript, build local |
| ELO/ranking, write/cache, schema, dependency/config build | Test hồi quy trong phạm vi ảnh hưởng (toàn suite nếu ảnh hưởng chung), ESLint, TypeScript, build local; audit chuyên biệt khi liên quan |

Nếu đổi ứng dụng, agent tự đưa lên remote theo nhánh đang làm việc và kiểm tra trạng thái deployment.
UI nhỏ có thể dùng build Vercel thay build local; nếu không xem được kết quả
thì chạy build local và báo giới hạn nghiệm thu.

Các lệnh dưới đây là lựa chọn theo bảng, không phải checklist cho mọi task:

```bash
npm run test -- <test-file>
npx eslint <changed-files>
npx tsc --noEmit
npm run build
```

- `npm run test` và `npm run build` đã có khóa tài nguyên dùng chung, giới hạn
  heap và số worker. Không gọi trực tiếp `vitest`, `next build` hoặc bỏ qua
  wrapper trong `scripts/run-resource-guard.mjs`.
- Giữ cấu hình bảo vệ tài nguyên hiện có; chi tiết ở `docs/ARCHITECTURE.md`.
- Những lệnh kiểm tra được chọn phải chạy **tuần tự**. Không chạy song song
  các lệnh kiểm tra nặng; đặc biệt không chạy test đồng thời với build.
- Test logic mặc định dùng môi trường Node. Chỉ file test component thật sự cần
  DOM mới được khai báo `// @vitest-environment jsdom` tại chính file đó.

- Hệ thống dùng Vitest để tự động hóa test. Khi sửa đổi logic cốt lõi (ELO, Ranking) hoặc thêm tính năng xử lý dữ liệu phức tạp (như xử lý text nhận diện giọng nói), BẮT BUỘC phải viết test vào thư mục `src/lib/__tests__/`.
- Repo có thể còn lint debt cũ; ưu tiên ESLint đúng các file đã sửa.
- Với lịch sử trận đấu, có thể dùng `npm run visual:test:history`.
- Khi đổi logic chọn/nội dung Hub insights, dùng
  `npm run audit:insights -- <backup.json> --seeds 1000`.
- Build local cần pooled Postgres URL nếu route được kiểm tra phải truy cập DB.

## Quy chuẩn tài liệu

- `README.md`: cách chạy, deploy và bản đồ repo.
- `AGENTS.md`: luật ổn định dành cho coding agent.
- `docs/PRODUCT.md`: hành vi người dùng và UI hiện hành.
- `docs/ARCHITECTURE.md`: kiến trúc, dữ liệu, cache và write flow.
- `docs/agent-workflow/README.md`: hướng dẫn người dùng giao việc và chọn model.
- `docs/ELO_MIGRATION_PLAN.md`: phương án tham khảo; không tự coi là task triển khai.
- `CHANGELOG.md`: các thay đổi đáng chú ý, không lưu snapshot commit/branch.

Không tạo file `PLAN.md`, `HANDOFF.md`, `CONTEXT.md` hoặc bản audit lâu dài nếu
nội dung chỉ phục vụ một phiên làm việc. Kế hoạch tạm thời để trong task/chat;
lịch sử chi tiết đã có Git. Không chép bảng rule, type hoặc template từ code sang
Markdown khi code có thể tự xuất hoặc audit chúng.
