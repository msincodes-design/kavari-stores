# Going live on Vercel — step by step

Two free services, no credit card for either. Budget about 45 minutes, most of
which is clicking through sign-ups.

| Service | What it does | Cost |
|---|---|---|
| **Neon** | The Postgres database that holds your products and orders | Free, no card |
| **Vercel** | Runs the website and the API | Free, no card |

---

## Part 1 — Create the database (about 5 minutes)

1. Go to **https://neon.com** and click **Sign up**. Signing in with Google or
   GitHub is fine.
2. When it asks you to create a project:
   - **Name:** `kavari-stores`
   - **Region:** pick the one closest to you — for Nigeria that is usually
     **Europe (Frankfurt)** or **AWS eu-central-1**. Closer region = faster shop.
   - **Postgres version:** leave the default.
3. Click **Create project**.
4. On the project page, find the **Connection string** panel. You want the one
   that looks like:

   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

   Use the **pooled** connection if it offers a choice (the hostname contains
   `-pooler`). If there is no choice, the default is fine.

5. **Copy that whole string and paste it somewhere safe for a moment** — a note
   on your phone is fine. It is the key to your database. Treat it like a
   password: anyone with it can read and change your shop.

   > If you lose it, you can always come back to the same panel and copy it
   > again — so it is not the end of the world.

---

## Part 2 — Give the database its tables (about 5 minutes)

The app needs to know what the tables look like before it can use them.

1. In Neon, open the **SQL Editor** (left-hand menu).
2. Open the file **`database/schema.sql`** in this project, copy **all** of it,
   and paste it into the SQL Editor.
3. Press **Run**.
4. It should say something like `Success. No rows returned`. That is correct —
   it created empty tables.
5. Now open **`database/seed.sql`**, copy all of it, paste it into the SQL
   Editor, and press **Run** again.

   This loads your 22 products so the shop is not empty when it goes live.

   > Note: this seed is the catalogue from your laptop at the time this was
   > written. Any products you add later on your laptop will not be here — see
   > "Moving your current data" at the bottom.

---

## Part 3 — Put the code on GitHub (about 5 minutes)

1. Create a free account at **https://github.com** if you do not have one.
2. Click **New repository**:
   - **Name:** `kavari-stores`
   - **Private** (important — this keeps your code to yourself)
   - Do **not** tick "Add a README".
3. Click **Create repository**. GitHub shows you a page of commands.
4. On your computer, open a terminal in this project folder and run these
   (replace `YOUR-NAME` with your GitHub username):

```bash
git init
git add .
git commit -m "Kavari Stores"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/kavari-stores.git
git push -u origin main
```

The first push will ask you to sign in to GitHub. If it asks for a password,
it wants a **Personal Access Token**, not your account password — GitHub's
**Settings → Developer settings → Personal access tokens → Tokens (classic)**
can make one with "repo" scope.

---

## Part 4 — Deploy to Vercel (about 5 minutes)

1. Go to **https://vercel.com** and click **Sign up → Continue with GitHub**.
2. Click **Add New… → Project**.
3. Find `kavari-stores` in the list and click **Import**.
4. Vercel will detect the settings by itself. **Do not change them.**
5. **Before clicking Deploy**, open **Environment Variables** and add one:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the long `postgresql://…` string from Part 1 |

6. Click **Deploy**. Wait about a minute.
7. You get a URL like `https://kavari-stores.vercel.app`. That is your shop,
   live, for anyone in the world.

Staff sign-in is the same address with `/login.html` on the end:
`https://kavari-stores.vercel.app/login.html`

**Your credentials are unchanged:** `dayoife28@gmail.com` / `12345`.

---

## Part 5 — Check it actually works

Do these in order. If one fails, tell me which one and what it said.

- [ ] The shop loads and shows your products
- [ ] Sign in at `/login.html` with your email and password
- [ ] Add a product in the portal, then reload the shop — it appears
- [ ] Place a test order — WhatsApp opens with the order filled in
- [ ] The order shows under **Orders** in the portal
- [ ] Stock went down by the amount ordered
- [ ] Open the shop on your **phone** (mobile data, not wifi) — it loads

That last one is the real test: if it loads on your phone away from home, the
whole world can reach it.

---

## Moving your current data across

The seed file has the catalogue as it is today. If you have since added products
on your laptop that you want online too:

1. In the portal, go to **Settings → Download full backup**. You get a JSON file.
2. Send me that file (or paste its contents) and I will turn it into a
   `seed.sql` you can paste into Neon's SQL Editor.

---

## What changed under the bonnet

Nothing you will notice, but worth knowing:

- **The JSON file is gone.** Products, orders and stock movements now live in
  Postgres, which is what makes this work on Vercel at all.
- **Sign-in is a signed token, not a stored session.** Vercel starts and stops
  the app constantly; a token signed with your `SESSION_SECRET` keeps you signed
  in across those restarts.
- **The old server still works locally.** `start-server.cmd` continues to run
  the laptop version if you want to keep testing offline. It is a separate copy
  of the data, so changes made locally will not appear online.

---

## Honest limitations of the free setup

- **Neon free tier sleeps after inactivity.** The first visit after a quiet spell
  can take a few seconds to wake up. Normal, and it gets faster with traffic.
- **The password is still `12345`.** Fine while you are testing. When real
  customers start ordering, change it — that is a one-line edit and a redeploy.
- **No automatic order emails yet.** WhatsApp works; the email step opens the
  customer's mail app. Sending it automatically needs an email provider key
  (Resend and Brevo both have free tiers) — a small job when you want it.
- **Free tiers change.** These are the terms as of today; if a host alters its
  limits, the app itself is unaffected.
