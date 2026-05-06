# Font Issue Root Cause (Admin Page)

## Kết luận ngắn

Lỗi "font" thực chất là **lỗi encoding text** (mojibake), không phải lỗi `font-family` trong CSS.

File bị ảnh hưởng chính:

- `src/app/admin/page.tsx`

## Bằng chứng

- Nhiều chuỗi tiếng Việt trong file đã biến dạng kiểu:
  - `Nháº­t kÃ½` thay vì `Nhật ký`
  - `Quáº£n lÃ½` thay vì `Quản lý`
  - `Máº­t kháº©u` thay vì `Mật khẩu`
- Các file khác vẫn hiển thị tiếng Việt bình thường, nên không phải do global CSS/font.

## Nguyên nhân kỹ thuật

Trong quá trình chỉnh sửa nhanh bằng PowerShell, file đã bị đọc/ghi với encoding không đồng nhất (UTF-8 <-> codepage Windows), làm text tiếng Việt bị decode sai rồi ghi ngược lại.

Tóm tắt chuỗi lỗi:

1. Nội dung UTF-8 bị đọc như codepage khác.
2. Chuỗi sai đó được ghi lại thành UTF-8.
3. Kết quả hiển thị thành ký tự lỗi như `Ã`, `Â`, `áº`.

## Vì sao nhìn như lỗi font

UI vẫn dùng đúng font, nhưng dữ liệu text đã sai byte/encoding nên nhìn giống "font hỏng".  
Đây là **data corruption ở source text**, không phải rendering bug của browser.

## Cách tránh lặp lại

- Hạn chế replace hàng loạt tiếng Việt bằng shell trên Windows nếu không kiểm soát encoding.
- Nếu buộc dùng script, luôn đọc/ghi explicit UTF-8 end-to-end.
- Ưu tiên sửa bằng editor/patch giữ nguyên UTF-8 của file.

## Trạng thái hiện tại

- Đã xác định nguyên nhân gốc.
- Chưa sửa toàn bộ chuỗi tiếng Việt bị lỗi trong `src/app/admin/page.tsx` (đúng theo yêu cầu: tìm nguyên nhân và ghi vào file `.md`).
