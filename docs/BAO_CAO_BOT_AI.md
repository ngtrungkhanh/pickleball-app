# BÁO CÁO KỸ THUẬT & ĐẶC TẢ KIẾN TRÚC BOT AI ĐÁNH SÂM LỐC

> **Dự án:** Ứng dụng Game Đánh Lốc (Sâm Lốc) nội bộ  
> **Trạng thái:** **ĐÃ THỐNG NHẤT HOÀN TOÀN GIỮA AGENT VÀ GPT (READY FOR IMPLEMENTATION)**  
> **Mục tiêu:** Cung cấp đặc tả kỹ thuật chuẩn xác, không dư thừa, làm căn cứ triển khai code và kiểm chứng.

---

## 1. TỔNG QUAN VẤN ĐỀ CẦN GIẢI QUYẾT

Hệ thống Bot AI cũ sử dụng **Rule-based (`if-else` lắt léo)** bộc lộ nhiều nước đi ngớ ngẩn:
1. **Đánh thẳng sảnh to / đôi to đi đầu:** Khi làm chủ vòng, bot luôn chọn sảnh dài nhất hoặc đôi đầu tiên bất kể bài còn nhiều rác nhỏ lẻ ($3, 5, 8$). Sau khi làng bỏ lượt, bot cạn kiệt bài to để cướp cái và bị chết cóng.
2. **Chém Heo (2) bừa bãi:** Bàn vừa mở màn đánh con $3$ rác, bot vác ngay Heo ra đè, vừa lãng phí vừa dễ bị Tứ quý chặt.
3. **Mù nước đi do phân rã tĩnh:** Generator phụ thuộc vào 1 cách chia của `partitionHand`, không biết xé 1 lá từ Sáp/Tứ quý ra để đè bài cứu ván.
4. **Bỏ lỡ chiến thắng vì sợ thối Heo 2:** Gán điểm `-15000` cho nước về đích có Heo khiến bot chọn `PASS` (điểm $0$) chịu thua thay vì về nhất.
5. **Xung đột luật chặn người 1 lá:** Phạt `-600` điểm khi đánh lá đơn lúc tay có bộ, kể cả khi bàn đang đánh Single bắt buộc phải đè bằng lá đơn.
6. **Bị ép PASS khi cầm `[Đôi A, 2]`:** Phạt `-12000` khi để lại Heo khiến bot không dám đánh Đôi A đè Đôi K của đối thủ.

---

## 2. KẾT LUẬN THỐNG NHẤT SAU REVIEW (CONSENSUS SPECIFICATION)

| # | Vấn đề | Cơ chế lỗi trong code hiện tại | Quy chuẩn kỹ thuật đã chốt |
|---|---|---|---|
| **A** | **Nước về đích có Heo 2** | Nhánh `handAfter.length === 0` trả về `-15000` nếu lá cuối có Heo 2 $\rightarrow$ Bot chọn `PASS` bỏ lỡ cơ hội về nhất. | **Chính sách ưu tiên Về Đích (Terminal Win):** Gán điểm **$+9700$** (khấu trừ nhẹ so với về sạch $+10000$), đảm bảo $+9700 \gg \text{mọi nước non-terminal}$ và $\gg 0$ (`PASS`). |
| **B** | **Độ đầy đủ của Generator** | Phụ thuộc vào `partitionHand` tĩnh nên bỏ sót các nước xé sáp, xé đôi, xé sảnh. | **Bỏ tham số partition khỏi Generator:** Quét trực tiếp `botHand` theo `canBeat()` để sinh mọi nước đi hợp lệ (kể cả xé bài). Bàn trống sinh mọi lá đơn từ mọi rank có trong tay. |
| **C** | **Xung đột phạt `-600` khi người sau 1 lá** | Evaluator phạt `-600` nếu đánh Single lúc tay có bộ, kể cả khi bàn đang đánh Single bắt buộc phải đè bằng lá đơn. | **Chỉ phạt đánh Single khi bot làm chủ vòng (bàn trống)** mà trên tay có bộ. Khi bàn đang đánh Single thì việc đánh Single đè bàn là hợp lệ, không phạt. |
| **D** | **Sảnh A–2–3** | Tắt A–2–3 làm mất nước về đích khi tay còn `[A, 2, 3]`. Nhưng A–2–3 có $\text{highestRank} = 3$ nhỏ nhất, không thể đè sảnh khác. | **Chỉ sinh sảnh A–2–3 khi bàn trống** (mở vòng hoặc về đích). Tuyệt đối không sinh A–2–3 khi bàn đang có sảnh 3 lá khác theo đúng luật `analyzer.ts`. |
| **E** | **Đánh giá phá bộ & Phạt để lại Heo** | Dùng `description.includes()` để điều khiển logic và phạt `-12000` cứng nhắc khi để lại Heo. | **So sánh trực tiếp cấu trúc tay trước vs sau:** Tính $\Delta \text{Quads}, \Delta \text{Triples}, \Delta \text{Pairs}, \Delta \text{Straights}$. Chuyển phạt để lại Heo thành chi phí rủi ro có giới hạn (giảm khi cần đè đối thủ). |

---

## 3. ĐẶC TẢ KỸ THUẬT CHI TIẾT (TECHNICAL SPECIFICATION)

### 3.1. Hợp đồng Candidate Generator (`candidate-generator.ts`)
*Chữ ký hàm:* `generateCandidateMoves(botHand: Card[], tableCombo: CardCombo | null): CandidateMove[]`

1. **Khi bàn trống (`tableCombo === null` hoặc `INVALID`):**
   - Sinh lá đơn từ **mọi rank đang có trong tay** (kể cả rank nằm trong đôi, sáp, tứ quý, sảnh).
   - Sinh mọi Đôi, Sáp, Tứ quý khả dĩ.
   - Sinh mọi đoạn Sảnh hợp lệ từ 3 lá trở lên (bao gồm cả trường hợp đặc biệt A–2–3).
   - *Ràng buộc:* Tuyệt đối không sinh nước `PASS`.
2. **Khi bàn có bài (`tableCombo !== null`):**
   - Luôn sinh nước `PASS`.
   - Sinh mọi ứng viên thỏa mãn `canBeat(candidateCombo, tableCombo)`:
     - Bàn là SINGLE: mọi lá đơn lớn hơn; Tứ quý chặt Heo 2.
     - Bàn là PAIR: mọi đôi lớn hơn (kể cả trích từ Sáp, Tứ quý). Luật Đôi 2 không bị chặn giữ nguyên.
     - Bàn là TRIPLE: mọi sáp lớn hơn (kể cả trích từ Tứ quý).
     - Bàn là QUAD: mọi tứ quý lớn hơn.
     - Bàn là STRAIGHT: mọi sảnh cùng độ dài lớn hơn theo `analyzer.ts` (không sinh A–2–3 vì A–2–3 không đè được sảnh nào).
3. **Lọc hợp lệ cuối cùng:**
   - Combo khác `INVALID`, các lá thuộc tay bot, không trùng `card.id`. Khử trùng lặp nước đi cùng loại bài.

---

### 3.2. Hợp đồng Hàm Đánh Giá Tiện Ích (`utility-evaluator.ts`)

1. **Chính sách Về Đích (Terminal Policy):**
   - Nếu `handAfter.length === 0`:
     - Không có Heo: $\text{Score} = +10000$.
     - Có Heo (Heo đơn, Đôi Heo, Sảnh A–2–3): $\text{Score} = +9700$.
     - Reason: "Về nhất ván đấu (chấp nhận khoản phạt theo chế độ hiện tại)".
2. **Kiểm soát Nướng bài to đầu ván (Control vs Fodder):**
   - Định nghĩa $\text{ControlCost}$: Heo 2 ($60$), Tứ quý ($70$), Sảnh to K/A ($45$), Đôi to K/A ($35$), Đôi vừa J/Q ($15$).
   - Đếm số rác yếu ($\text{rank} \le 10$) còn lại trong $H'$: $\text{FodderCount}$.
   - Khi $\text{ControlCost} > 0$ và $\text{FodderCount} \ge 2$:
     $$\text{Penalty} = \text{ControlCost} \times \text{FodderCount} \times 2.5$$
     *(Giúp bot tự động đánh rác nhỏ hoặc đôi nhỏ thăm dò trước khi bài còn nhiều rác).*
3. **Chặn người sau còn 1 lá (`isNextPlayerSingle`):**
   - Nếu bàn trống: Ưu tiên đánh Bộ ($+600$). Nếu đánh Single lúc tay có bộ $\rightarrow$ Phạt $-600$.
   - Nếu bàn đang đánh Single: **Không phạt $-600$**.
     - Nếu đánh lá Single lớn nhất trong bài: Thưởng $+350$.
     - Nếu đánh lá Single nhỏ hơn mà tay có lá lớn hơn: Phạt $-10000$ (tránh đền làng).
4. **Chi phí phá bộ dựa trên cấu trúc tay trước vs sau:**
   - Evaluator so sánh số lượng bộ giữa `partitionHand(botHand)` và `partitionHand(handAfter)`:
     - Mất Sáp thành Đôi: Phạt nhẹ ($-15$).
     - Mất Đôi thành Rác: Phạt vừa ($-30$).
     - Xé Tứ quý: Phạt nặng ($-80$).
   - *Giảm trừ khẩn cấp:* Khi đối thủ còn $\le 3$ lá hoặc người sau còn 1 lá, chi phí phá bộ được giảm $70\%$.
5. **Rủi ro để lại Heo:**
   - Thay vì gán cứng $-12000$, tính toán chi phí rủi ro có giới hạn (khoảng $-200$ đến $-400$), và triệt tiêu khi cần đè đối thủ sắp về hoặc giành quyền làm chủ vòng.

---

## 4. MA TRẬN HÀNH VI QUYẾT ĐỊNH (BEHAVIORAL MATRIX)

| Tình huống bài của Bot | Bài trên bàn | Hành động mong muốn | Mục tiêu chiến thuật |
|---|---|:---:|---|
| Còn đúng 1 Heo 2 | Bàn đánh A | **PLAY Heo 2** | Về nhất ván đấu, không bỏ lỡ chiến thắng |
| Còn đúng `[A, 2, 3]` | Bàn trống | **PLAY Sảnh A–2–3** | Về nhất ván đấu ngay lập tức |
| Cầm `[3, A, A, A]`, người sau báo 1 lá | Bàn đánh 9 | **PLAY 1 lá A** | Xé sáp lấy 1 lá A chặn chốt, cứu ván tránh đền làng |
| Cầm Sảnh to `10-J-Q-K-A` và rác `3, 5, 8` | Bàn trống | **PLAY Rác 3** | Thăm dò, giữ sảnh to bảo vệ các rác còn lại |
| Cầm Đôi K và rác `3, 5, 7` | Bàn trống | **PLAY Rác 3** | Thăm dò, không ném Đôi K cướp cái đi sớm |
| Cầm `[Đôi 4, Đôi 5, Rác 7, Heo 2]` | Bàn đánh 8 (đầu ván) | **PASS** | Giữ Heo an toàn, không chém Heo vào rác 8 |
| Cầm `[Sảnh 3-4-5-6-7, Heo 2]` | Bàn đánh 8 | **PLAY Heo 2** | Cướp cái dứt điểm: nước sau xả sảnh 5 cây về nhất |
| Cầm `[Đôi 4, Heo 2]` | Bàn trống | **PLAY Heo 2** | Cướp cái trước để về bằng Đôi 4, triệt tiêu thối 2 |
| Cầm `[Đôi A, Heo 2]` | Bàn đánh Đôi K | **PLAY Đôi A** | Đè đôi K giành cái, không bị phạt cứng để lại Heo |

---

## 5. KẾ HOẠCH KIỂM CHỨNG & DANH MỤC CÔNG VIỆC

### 5.1. Các test hồi quy bắt buộc trong `loc-bot-ai.test.ts`
1. **Ca về đích có Heo:** Bot chỉ còn 1 con 2, bàn đánh A $\rightarrow$ `action === 'PLAY'`, `cards = [Heo 2]`.
2. **Ca sảnh A–2–3 về đích:** Bot chỉ còn `[A, 2, 3]`, bàn trống $\rightarrow$ `action === 'PLAY'`, `combo.type === 'STRAIGHT'`.
3. **Ca sảnh A–2–3 không đè sảnh khác:** Bàn đánh sảnh 3–4–5 $\rightarrow$ Bot không sinh hoặc không chọn A–2–3 để đè.
4. **Ca xé sáp cứu ván:** Bot cầm `[3, A, A, A]`, người sau báo 1 lá, bàn đánh 9 $\rightarrow$ gọi `decideMove` assert `action === 'PLAY'`, `cards = [A]`.
5. **Ca cầm `[Đôi A, Heo 2]` đè Đôi K:** Bàn đánh Đôi K $\rightarrow$ Bot chọn `PLAY Đôi A` đè bài, không bị ép `PASS`.
6. **Kiểm chứng tính đầy đủ (Oracle Test):** Duyệt tập con $2^{10} - 1$ đối chiếu với Generator để đảm bảo không mất lớp nước đi hợp lệ.

### 5.2. Danh mục triển khai tuần tự
- [ ] Bỏ tham số `partition` khỏi `candidate-generator.ts`, sinh ứng viên trực tiếp từ `botHand` theo luật `canBeat`.
- [ ] Cập nhật `utility-evaluator.ts`: Terminal Win $+9700$, sửa điều kiện phạt `-600`, tính chi phí phá bộ từ cấu trúc trước/sau, gỡ phạt cứng để lại Heo.
- [ ] Bổ sung các test hồi quy trên vào `src/lib/__tests__/loc-bot-ai.test.ts`.
- [ ] Chạy kiểm tra tuần tự: `npm run test -- src/lib/__tests__/loc`, `npx eslint`, `npx tsc --noEmit`.
