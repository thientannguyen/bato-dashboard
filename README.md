# Hồ thủy điện BA TO — Dashboard World Cup 2026

Dashboard React (Vite) tính "mực nước hồ" theo kết quả World Cup 2026.
Mực nước = (tổng bàn thắng cộng dồn ÷ số trận) × 100.

## Nguồn dữ liệu

Dữ liệu lấy từ [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
(`2026/worldcup.json`) — **miễn phí, không cần API key, hỗ trợ CORS** nên gọi
thẳng từ trình duyệt. Không dùng Anthropic/AI API.

Bấm nút **"Cập nhật kết quả"** để tải kết quả + lịch mới nhất; dữ liệu được lưu
vào `localStorage` (`bato:matches`, `bato:fixtures`) nên lần mở sau vẫn còn.

## Chạy

```bash
npm install
npm run dev      # mở http://localhost:5173
```

```bash
npm run build    # build production -> dist/
npm run preview  # xem thử bản build
```

## Cấu trúc

- `src/Dashboard.jsx` — toàn bộ giao diện (hồ đập, biểu đồ, BXH, lịch, bảng trận).
- `src/wc-data.js` — tải & chuẩn hoá dữ liệu openfootball sang shape nội bộ
  (dịch tên đội sang tiếng Việt, tách bảng/vòng, người ghi bàn, mốc giờ).

## Lưu ý

- **Man of the Match** không có trong nguồn openfootball nên ô MOTM để trống.
- Dữ liệu openfootball do cộng đồng cập nhật thủ công nên có thể trễ so với realtime.
- Giờ hiển thị theo múi giờ Vancouver (PT).
