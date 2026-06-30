# Wedding Invitation

Static wedding invitation website for Huu Thang and Thu Trang.

## Live Website

Main page:

```text
https://tntweddinginvitation.netlify.app/
```

Invitation links:

```text
https://tntweddinginvitation.netlify.app/Wedding_invitation_Thang/
https://tntweddinginvitation.netlify.app/Wedding_invitation_Trang/
```

Legacy direct HTML links are also kept:

```text
https://tntweddinginvitation.netlify.app/Wedding_invitation_Th.html
https://tntweddinginvitation.netlify.app/Wedding_invitation_Tr.html
```

## Data base

```text
https://supabase.com/dashboard/project/fqafkaihbwgjqcabvisg
```

## Project Structure

```text
deploy/
  index.html
  Wedding_invitation_Th.html
  Wedding_invitation_Tr.html
  Wedding_invitation_Thang/index.html
  Wedding_invitation_Trang/index.html
  script-th.js
  script-tr.js
  styles.css
  assets/

Wedding_invitation_Th.html
Wedding_invitation_Tr.html
script-th.js
script-tr.js
styles.css
assets/
supabase-wishes.sql
netlify.toml
```

Netlify publishes the `deploy` folder. This is configured in:

```toml
[build]
  publish = "deploy"
```

## Two Invitation Versions

The project has two invitation versions:

- `script-th.js`: version for Thang.
- `script-tr.js`: version for Trang.

Each version has its own map configuration and RSVP source marker:

```js
invitationSide: "Th"
```

or:

```js
invitationSide: "Tr"
```

RSVP submissions are saved to the same Supabase table, with `invitation_side` used to know which invitation the guest submitted from.

## Editing Wedding Information

Edit the `wedding` object at the top of the relevant JS file:

```text
script-th.js
script-tr.js
deploy/script-th.js
deploy/script-tr.js
```

Important fields:

```js
dateISO: "2026-11-13T09:00:00+07:00",
ceremonyISO: "2026-11-13T09:00:00+07:00",
partyTime: "09:00",
day: "13",
month: "11",
year: "2026",
address: "...",
mapUrl: "...",
mapEmbedUrl: "...",
```

The countdown uses `dateISO`.

## Album Images

Album photos are configured in the `photos` array in each JS file.

For deployed nested routes, use root-relative asset paths:

```js
{ src: "/assets/couple-photo.png", alt: "Anh cuoi 1" }
```

Place images inside:

```text
deploy/assets/
assets/
```

## Supabase

Guestbook and RSVP use Supabase.

Run this SQL file in Supabase SQL Editor:

```text
supabase-wishes.sql
```

Tables:

- `wedding_wishes`
- `wedding_rsvps`

The RSVP table includes:

```text
invitation_side
```

Allowed values:

```text
Th
Tr
```

## Deploy

This site is deployed on Netlify from the `main` branch.

The publish directory is:

```text
deploy
```

After pushing to GitHub, Netlify should redeploy automatically.
