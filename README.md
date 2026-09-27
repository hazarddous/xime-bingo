# XIME Bingo — Production deployment update.

## What this version does
- Shared database for every student/device
- 25 customizable tasks
- Name / roll number / section
- Server timestamp for every completion
- Duplicate-completion protection
- Admin email/password login
- Admin-only participant/completion reads via Row Level Security
- Live admin refresh through Supabase Realtime
- Search/filter
- CSV export
- Responsive mobile UI

## 1. Create Supabase project
Create a project at https://supabase.com.

Open SQL Editor and run `supabase/schema.sql`.

## 2. Create the admin account
In Supabase:
Authentication -> Users -> Add user

Create an email/password account for the event admin.

Copy that user's UUID.

Back in SQL Editor:
insert into public.admins(user_id) values ('YOUR-UUID-HERE');

Do NOT put a Supabase secret/service key into the website.

## 3. Get your browser keys
In Supabase, open the project's Connect panel / API settings and copy:
- Project URL
- Publishable key

Paste them into `config.js`.

The publishable key is designed for browser use; the database's Row Level Security policies control access.

## 4. Customize the Bingo board
Edit the 25 rows in `supabase/schema.sql`, then run the updated INSERT/UPSERT section in Supabase SQL Editor.

## 5. Test locally
You can use any static server. For example:
python -m http.server 8080

Then open http://localhost:8080

Opening index.html directly may work, but a local server is more reliable.

## 6. Deploy to Vercel
Vercel now supports Vercel Drop: you can drag the project folder/zip into Vercel and publish a static site without Git or CLI.

Alternative:
- Push this folder to GitHub
- Import it into Vercel
- No build command
- Output directory: `.`
- Deploy

## 7. Share
Vercel gives you a live URL such as:
https://xime-bingo-xxxx.vercel.app

Share that with students.

## Security model
Students can:
- read the public task list
- create a participant
- submit a completion for an existing participant UUID

Students cannot:
- read the participant table
- read the completion table
- access the admin dashboard data

Admins can read the full dashboard after Supabase Auth login and membership in `public.admins`.

For an event with a large number of students, consider adding a one-time event code / QR-based participant registration to reduce fake registrations.


## If registration says "new row violates row-level security policy"
Run `supabase/fix-rls.sql` in Supabase SQL Editor. This patch also adds explicit Data API grants, which are needed on newer Supabase projects. The patched `app.js` no longer uses `.insert(...).select()` for public registration, so it does not require an anonymous SELECT policy on `participants`.
