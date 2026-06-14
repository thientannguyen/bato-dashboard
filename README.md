# 🌊 Hồ thủy điện BA TO — Dashboard World Cup 2026

Dashboard React (Vite) biến kết quả **World Cup 2026** thành "mực nước" của hồ thủy điện BA TO.

> **Mực nước (m) = (tổng bàn thắng cộng dồn ÷ số trận) × 100**
> Càng nhiều bàn thắng, hồ càng đầy. 💧

**🔗 Live demo:** https://bato-dashboard.vercel.app

---

## ✨ Tính năng

- **Đập thủy điện động** — 2 lớp sóng chuyển động, bọt khí nổi lên, **màu nước đổi theo mức** (thấp → hổ phách, vừa → xanh dương, gần tràn → xanh ngọc).
- **Biểu đồ diễn biến mực nước** qua từng ngày (Recharts).
- **Bộ sưu tập chữ số mực nước** — gom đủ số tận cùng 0–9, kèm số lần mỗi chữ số đã xuất hiện (×N).
- **Sân vận động + quốc gia** — bảng tra 16 sân World Cup 2026, kèm **cờ quốc gia** cho mọi đội.
- **Đếm ngược trận tiếp theo** — đồng hồ ngày/giờ/phút/giây cập nhật mỗi giây.
- **Vua phá lưới** — Top 10 cầu thủ ghi bàn, tổng hợp từ dữ liệu các trận đã đá.
- **Bảng xếp hạng** vòng bảng (tự tính: thắng 3đ, hòa 1đ) + **lịch sử trận** bấm để xem người ghi bàn, điểm 2 đội và địa điểm.
- **Hiệu ứng** — xuất hiện dần khi tải, count-up số, hover nổi khối, đếm ngược kiểu lật số, pháo giấy khi gom đủ 0–9. Tôn trọng `prefers-reduced-motion`.

## 📊 Nguồn dữ liệu

Lấy từ [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) (`2026/worldcup.json`) — **miễn phí, không cần API key, hỗ trợ CORS** nên gọi thẳng từ trình duyệt. Không dùng AI/LLM API.

App **tự tải dữ liệu mới khi mở**; cũng có nút **"Cập nhật kết quả"** để làm mới thủ công. Dữ liệu lưu vào `localStorage` (`bato:matches`, `bato:fixtures`).

## 🚀 Chạy local

```bash
npm install
npm run dev      # http://localhost:3009

npm run build    # build production -> dist/
npm run preview  # xem thử bản build
```

## 🗂️ Cấu trúc

- `src/Dashboard.jsx` — toàn bộ giao diện + hiệu ứng (đập nước, biểu đồ, đếm ngược, BXH, vua phá lưới, lịch sử trận).
- `src/wc-data.js` — tải & chuẩn hoá dữ liệu openfootball: dịch tên đội sang tiếng Việt, cờ quốc gia, bảng tra 16 sân → sân + quốc gia, tách bảng/vòng, người ghi bàn, mốc giờ.

## ⚠️ Lưu ý

- **Man of the Match** không có trong nguồn openfootball nên không hiển thị.
- Dữ liệu openfootball do cộng đồng cập nhật thủ công nên có thể trễ so với realtime.
- Giờ hiển thị theo múi giờ **Vancouver (PT)**.
- Tên sân & quốc gia là bảng tra tĩnh (16 sân cố định của WC 2026), không cần API.
