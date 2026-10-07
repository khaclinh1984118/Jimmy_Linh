# Jimmy AI Video Generator

Bộ khung MVP cho một ứng dụng **AI Video Generator** đơn giản.

## Tính năng hiện có

- Giao diện nhập prompt bằng tiếng Việt.
- Chọn tỉ lệ 16:9, 9:16 hoặc 1:1.
- Chọn thời lượng 5, 8 hoặc 10 giây.
- API `POST /api/videos` kiểm tra dữ liệu đầu vào và tạo mock video job.
- Cấu trúc sẵn sàng để tích hợp một video provider thật.

## Công nghệ

- Next.js 14
- React 18
- TypeScript
- App Router

## Chạy local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Mở http://localhost:3000.

## API

### POST /api/videos

Body mẫu:

```json
{
  "prompt": "Một thành phố tương lai dưới mưa",
  "aspectRatio": "16:9",
  "duration": 8
}
```

Hiện API trả về mock job. Không có video thật được tạo ở phiên bản starter này.

## Roadmap đề xuất

1. Tích hợp provider tạo video thật.
2. Lưu trạng thái job vào database.
3. Polling/webhook để cập nhật tiến trình render.
4. Trang lịch sử video.
5. Upload ảnh tham chiếu.
6. Authentication và quota người dùng.
7. Lưu video vào object storage.
8. Deploy lên Vercel.

## Cấu hình môi trường

Xem `.env.example`. Tuyệt đối không commit API key thật lên GitHub.
