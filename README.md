# Jimmy AI Video Generator

MVP **text-to-video chạy thật** bằng Google Veo 3.1 qua Gemini API.

## Luồng hoạt động

1. Người dùng nhập prompt và chọn tỉ lệ, thời lượng, độ phân giải.
2. `POST /api/videos` gửi long-running job tới Veo 3.1.
3. Frontend gọi `GET /api/videos/status` mỗi 10 giây.
4. Khi hoàn tất, app nhận URI video từ Gemini API.
5. `GET /api/videos/content` proxy video về trình duyệt để API key không bị lộ.
6. Người dùng xem preview hoặc tải MP4.

## Công nghệ

- Next.js 14
- React 18
- TypeScript
- Google Gemini API / Veo 3.1
- Không cần database cho MVP hiện tại

## Chuẩn bị Gemini API key

Tạo một Gemini API key có quyền sử dụng Veo 3.1, sau đó tạo file:

```bash
cp .env.example .env.local
```

Điền:

```env
GEMINI_API_KEY=your_key_here
VEO_MODEL=veo-3.1-generate-preview
```

Không commit `.env.local` hoặc API key thật lên GitHub.

## Chạy local

```bash
npm install
npm run dev
```

Mở:

```
http://localhost:3000
```

## Khả năng MVP

- Text-to-video thật
- Tỉ lệ 16:9 và 9:16
- 4 / 6 / 8 giây
- 720p
- 1080p khi thời lượng là 8 giây
- Audio do Veo sinh tự nhiên
- Polling trạng thái bất đồng bộ
- Preview video
- Tải MP4
- API key chỉ tồn tại ở server

## API nội bộ

### POST /api/videos

Ví dụ:

```json
{
  "prompt": "A cinematic sunrise over a Vietnamese school courtyard, slow drone push-in, students arriving, warm light and natural ambience.",
  "aspectRatio": "16:9",
  "duration": 8,
  "resolution": "720p"
}
```

### GET /api/videos/status?operation=...

Kiểm tra trạng thái long-running operation của Veo.

### GET /api/videos/content?uri=...

Proxy nội dung video từ Google. Endpoint chỉ cho phép URL HTTPS thuộc miền Google API/storage được whitelist.

## Lưu ý vận hành

- Veo là dịch vụ trả phí và cần tài khoản/API key đủ điều kiện.
- Thời gian render phụ thuộc tải hệ thống và có thể kéo dài vài phút.
- Video trên dịch vụ nguồn chỉ được lưu tạm thời; hãy tải xuống hoặc bổ sung object storage nếu muốn lưu lâu dài.
- Prompt tiếng Anh hiện cho độ ổn định tốt nhất.
- Video sinh bởi Veo chịu các bộ lọc an toàn của nhà cung cấp.

## Roadmap

- Upload ảnh → image-to-video
- Lưu lịch sử job vào PostgreSQL/Supabase
- Object storage cho video hoàn tất
- Authentication
- Quota / giới hạn chi phí
- Prompt enhancer
- Webhook hoặc background worker
- Deploy Vercel
