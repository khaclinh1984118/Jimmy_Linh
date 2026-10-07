# Jimmy AI Video Studio

Production-oriented AI video workspace built with **Next.js + Supabase + Gemini/Veo**.

## What is included

### Authentication
- Supabase email/password sign-up and sign-in
- Cookie-based SSR sessions through `@supabase/ssr`
- Email confirmation callback at `/auth/confirm`
- Middleware protection for Studio routes

### Projects and persistent library
- Multiple user projects
- Persistent generation records in Postgres
- Private Supabase Storage bucket for source images and completed MP4 files
- Signed URLs for private playback
- Generation history survives browser/device changes

### Credits and quota
- New accounts start with 1000 credits
- Default monthly quota: 5000 credits
- 100 credits represent approximately USD 1 of provider cost
- Credits are reserved atomically before submitting a job
- Failed generations automatically refund reserved credits
- Credit ledger records reservations/refunds
- Monthly usage is reset lazily when the next reservation occurs in a new month

### Video models
The UI currently exposes:
- Veo 3.1 Standard
- Veo 3.1 Fast
- Veo 3.1 Lite

The model IDs live in `lib/models.ts` and can also be overridden with environment variables.

> Important: Google currently lists the Veo 3.1 preview model family for shutdown on **22 October 2026**. The app deliberately isolates model IDs so migration to the recommended replacement does not require rewriting the Studio UI.

### Advanced generation
- Text-to-video
- Image-to-video
- First-frame + last-frame interpolation
- Up to 3 reference images
- Video extension (+7 seconds per extension where supported)
- 16:9 and 9:16
- 720p / 1080p / 4K depending on model
- Native audio
- Gemini 3.8 Flash prompt enhancer

## Architecture

```text
Browser
  |
  |-- Supabase Auth (cookie session)
  |
  |-- signed asset upload
  |      -> private Supabase Storage
  |
  |-- POST /api/videos
  |      -> validate capabilities
  |      -> create generation row
  |      -> reserve credits/quota
  |      -> load private input assets
  |      -> submit long-running video job
  |
  |-- GET /api/videos/status?generationId=...
  |      -> poll provider operation
  |      -> refund on provider failure
  |      -> download completed provider MP4
  |      -> persist MP4 to Supabase Storage
  |      -> return signed playback URL
  |
  |-- POST /api/videos/extend
  |      -> validate source provider reference
  |      -> reserve credits
  |      -> extend by 7 seconds
  |
  |-- GET/POST /api/studio
         -> profile, projects, quota and persistent library
```

## 1. Create a Supabase project

Create a Supabase project and copy:
- Project URL
- Publishable key

Then run:

```sql
supabase/migrations/001_video_studio.sql
```

The migration creates:
- `profiles`
- `projects`
- `generations`
- `credit_ledger`
- RLS policies
- credit reservation/refund RPCs
- private `video-assets` storage bucket

## 2. Configure Supabase email confirmation

For SSR email confirmation, set your Supabase Site URL to your application URL.

In **Authentication -> Email Templates -> Confirm signup**, change the confirmation link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

For local development, use:

```text
http://localhost:3000
```

as the Site URL.

## 3. Configure environment variables

Copy:

```bash
cp .env.example .env.local
```

Then fill:

```env
GEMINI_API_KEY=...

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

SUPABASE_VIDEO_BUCKET=video-assets

PROMPT_MODEL=gemini-3.8-flash

VEO_STANDARD_MODEL=veo-3.1-generate-preview
VEO_FAST_MODEL=veo-3.1-fast-generate-preview
VEO_LITE_MODEL=veo-3.1-lite-generate-preview

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never commit `.env.local`.

## 4. Install and run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Create an account, confirm the email if email confirmation is enabled, then sign in.

## Current credit calculation

The Studio reserves credits based on the current model-rate table in `lib/models.ts`.

Current mapping:
- Standard: 40 credits/sec at 720p or 1080p; 60 credits/sec at 4K
- Fast: 10 credits/sec at 720p; 12 credits/sec at 1080p; 30 credits/sec at 4K
- Lite: 5 credits/sec at 720p; 8 credits/sec at 1080p; no 4K

The table should be reviewed whenever provider pricing changes.

## Advanced capability rules

### Reference images
- Up to 3
- Standard/Fast only in this Studio configuration
- 8-second generation
- Reference mode is kept separate from first/last-frame mode

### First + last frame
- Last frame requires a first frame
- Studio forces 8 seconds for interpolation
- Inputs are uploaded directly to private Supabase Storage before generation

### Extend Video
- Standard/Fast only
- Adds 7 seconds per request
- Uses 720p
- Requires a Veo-generated provider video reference
- Provider reference must still be valid; Google documents a roughly 2-day provider retention window for extension references

## Security

- Provider API key never reaches the browser
- Supabase data uses Row Level Security
- Users can only read/write projects, generations and objects they own
- Storage paths are namespaced by user UUID
- Playback uses short-lived signed URLs
- Credits are reserved inside a Postgres function under a row lock
- Failed jobs use an idempotent refund function
- Input MIME types and sizes are validated server-side

## Important production note

The current status workflow is request-driven: the browser polls the status endpoint. For a fully unattended production system, add a scheduled/background worker that periodically reconciles queued/processing generations even after the user closes the browser.

## Recommended next production upgrades

- Background reconciliation worker / queue
- Stripe billing and credit top-ups
- Admin dashboard
- Team workspaces and shared projects
- Webhook/event audit log
- Abuse/rate limiting
- Storage lifecycle rules
- Automatic migration from Veo 3.1 preview IDs to the next production video model
- Automated CI build and integration tests


Deployment status: Vercel project linked to GitHub and production environment configured with Supabase.
