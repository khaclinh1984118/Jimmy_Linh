# Jimmy AI Video Studio

Một MVP **AI Video Studio chạy thật** bằng **Google Veo 3.1 + Gemini API**, xây trên Next.js.

## Studio hiện có gì?

### Create
- Text-to-video bằng Veo 3.1
- Image-to-video: upload ảnh khởi đầu rồi animate bằng Veo
- Prompt Enhancer bằng Gemini
- Preset prompt: Cinematic, Drone, Product, Social
- Tỉ lệ 16:9 và 9:16
- Thời lượng 4 / 6 / 8 giây
- 720p / 1080p / 4K
- Audio sinh tự nhiên từ Veo
- Theo dõi long-running operation tự động mỗi 10 giây
- Preview video ngay trong studio
- Download MP4
- API key chỉ nằm ở server

### Library
- Lưu tối đa 30 generation gần nhất trong localStorage
- Lưu prompt, operation ID, trạng thái, tỉ lệ, thời lượng và độ phân giải
- Mở lại job cũ và refresh trạng thái từ Veo
- Xóa job khỏi thư viện local

> Library hiện là local-first MVP. Khi chuyển sang production nên thay bằng PostgreSQL/Supabase và object storage.

## Kiến trúc

```text
Browser
  |
  |-- POST /api/prompt/enhance
  |      -> Gemini text model
  |
  |-- POST /api/videos
  |      -> Veo 3.1 predictLongRunning
  |
  |-- GET /api/videos/status
  |      -> poll Google long-running operation
  |
  |-- GET /api/videos/content
         -> secure server-side proxy -> MP4
```

## Cấu trúc chính

```text
app/
├── api/
│   ├── prompt/
│   │   └── enhance/
│   │       └── route.ts
│   └── videos/
│       ├── content/
│       │   └── route.ts
│       ├── status/
│       │   └── route.ts
│       └── route.ts
├── globals.css
├── layout.tsx
└── page.tsx
lib/
└── veo.ts
```

## Cấu hình

Sao chép file môi trường:

```bash
cp .env.example .env.local
```

Điền API key:

```env
GEMINI_API_KEY=your_google_ai_key
VEO_MODEL=veo-3.1-generate-preview
PROMPT_MODEL=gemini-3.8-flash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Không commit `.env.local` hoặc API key thật lên GitHub.

## Chạy local

```bash
npm install
npm run dev
```

Mở:

```text
http://localhost:3000
```

## Image-to-video

Ảnh được đọc ở browser và gửi dưới dạng data URL đến server. MVP giới hạn:

- JPEG
- PNG
- WebP
- tối đa 4 MB

Server tách base64 và gửi ảnh dưới dạng `inlineData` vào input của Veo.

## Prompt Enhancer

Endpoint:

```text
POST /api/prompt/enhance
```

Gemini biến ý tưởng ngắn thành prompt điện ảnh tiếng Anh gồm chủ thể, hành động, môi trường, shot, camera, ánh sáng, style, pacing và audio cues.

## Ước tính chi phí

UI hiện hiển thị ước tính cho **Veo 3.1 Standard** dựa trên số giây và độ phân giải. Đây chỉ là ước tính giao diện; giá thực tế phải đối chiếu bảng giá Gemini API hiện hành.

Nếu muốn giảm chi phí, có thể đổi:

```env
VEO_MODEL=veo-3.1-fast-generate-preview
```

hoặc model Veo Lite tương thích nếu tài khoản có quyền truy cập.

## Bảo mật đã áp dụng

- Không gửi `GEMINI_API_KEY` xuống browser
- Download video đi qua server proxy
- Chỉ proxy URL HTTPS thuộc miền Google API/storage được whitelist
- Validate tỉ lệ, thời lượng, độ phân giải
- Validate MIME ảnh và giới hạn kích thước
- Prompt enhancer giới hạn độ dài input

## Hạn chế MVP

- Chưa có đăng nhập
- Chưa có database dùng chung nhiều thiết bị
- Video chưa được sao chép sang object storage lâu dài
- Chưa có credit/quota system
- Chưa có billing
- Chưa có reference images 3 ảnh, first/last-frame interpolation hoặc video extension trong UI
- Chưa có background worker riêng; polling diễn ra khi trang đang mở

## Roadmap production

1. Supabase/PostgreSQL cho users, projects và generations
2. Google Cloud Storage / R2 / S3 để lưu MP4 lâu dài
3. Authentication
4. Usage credits + rate limiting
5. Reference images tối đa 3 ảnh
6. First frame + last frame interpolation
7. Extend video
8. Model selector Standard / Fast / Lite
9. Webhook/background worker
10. Deployment Vercel + observability
