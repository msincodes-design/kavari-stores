# Kavari Stores — your checklist

Tick these off in order. If one fails, stop and tell me which one and what it
said. Everything here is free and needs no credit card.

---

## Step 1 — Install Git (once, about 3 minutes)

Git is the tool that sends your code to GitHub.

1. Go to **https://git-scm.com/download/win**
2. The download starts by itself. Run the installer.
3. Click **Next** through every screen — the defaults are correct. There are a
   lot of screens; just keep clicking Next.
4. When it finishes, **restart your computer** (or at least close every open
   terminal). Windows needs that to notice Git is installed.

To check it worked: press the **Windows key**, type `cmd`, open Command Prompt,
and type `git --version`. You should see something like `git version 2.4x.x`.

---

## Step 2 — Put the code on GitHub (about 5 minutes)

1. Create a free account at **https://github.com** if you do not have one.
2. Click the **+** at the top right → **New repository**.
3. Fill it in:
   - **Repository name:** `kavari-stores`
   - **Private** ← tick this. Your code stays yours.
   - Leave everything else unticked.
4. Click **Create repository**.
5. GitHub shows a page with some commands. Ignore them for now — you will run
   the commands below instead, which already include your details.

Open **Command Prompt** (Windows key → type `cmd` → Enter) and paste these one
line at a time. Replace `YOUR-NAME` with your GitHub username:

```
cd "C:\Users\alaus\.abacusai-bot\bot-home\kavari-stores"

git init

git add .

git commit -m "Kavari Stores"

git branch -M main

git remote add origin https://github.com/YOUR-NAME/kavari-stores.git

git push -u origin main
```

**When the last line runs, a window will pop up asking you to sign in to
GitHub.** Sign in with the account you just made. That is the part that has to
be you — it is your account, so I cannot do it for you.

If it instead asks for a **username and password** in the black window:
- Username: your GitHub username
- Password: **not** your GitHub password. You need a token. Go to GitHub →
  your picture → **Settings** → **Developer settings** (bottom left) →
  **Personal access tokens** → **Tokens (classic)** → **Generate new token
  (classic)**. Give it a name, tick the **repo** box, click **Generate**, and
  copy the long string it shows you. Paste that as the password.

After this, reload your GitHub repository page — your files should be there.

---

## Step 3 — Create the service on Koyeb (about 5 minutes)

1. Sign in to **https://app.koyeb.com**
2. Click **Create Service** (or **Create Web Service**).
3. Choose **GitHub** as the deployment source.
4. Koyeb will ask to connect to GitHub — approve it, and give it access to your
   `kavari-stores` repository.
5. Pick the repository. Koyeb will read the `Dockerfile` by itself — leave the
   builder set to **Dockerfile**.
6. **Instance type:** choose **Free** (it may be called "Free / Hobby").
7. **Ports:** make sure it shows **8080** (the Dockerfile already exposes it).
8. **Regions:** pick **Frankfurt** or the one closest to you.

Now the two important extras, before you click Deploy:

9. **Add a volume** (this is what keeps your products and orders when the
   service restarts):
   - Click **Add volume** / **Volumes**
   - **Mount path:** `/data`
   - **Size:** the smallest it offers (1 GB is plenty)

10. **Add an environment variable:**
    - Name: `DATA_DIR`
    - Value: `/data`

11. Click **Deploy**.

It will build for a minute or two. When it turns green, Koyeb gives you a URL
like `https://kavari-stores-yourname.koyeb.app`.

---

## Step 4 — Check it works

Open the URL. You should see the shop with your products.

- [ ] The shop loads and shows products
- [ ] Sign in at **your-url/login.html** with `dayoife28@gmail.com` / `12345`
- [ ] Add a test product in the portal → reload the shop → it appears
- [ ] Open the shop on your **phone using mobile data** (not wifi) — it loads

That last one proves it is really online for anyone, anywhere.

Then **restart the service** in Koyeb (there is a Restart button) and reload the
shop. Your test product should still be there — that confirms the volume is
mounted correctly.

---

## When it is live, tell me and I will:

1. Check it over properly and fix anything that misbehaves.
2. Move your product images into proper file storage — right now two of them are
   stored as raw image data, which will eat your free database space.
3. Set up automatic order emails if you want them.

---

## Your credentials (unchanged)

| | |
|---|---|
| Admin email | `dayoife28@gmail.com` |
| Password | `12345` |

A reminder worth repeating once you are live: a five-digit password on a public
address is easy to guess, and anyone who guesses it can change your prices and
delete products. Fine while testing. Say the word and I will change it to a long
passphrase — same email, nothing else changes.
