# Hosted access: setup on Windows (devsam.my)

This guide makes Agent Town reachable at **https://agents.devsam.my** for you and the people you invite. The design is in [hosting.md](hosting.md). Run every command in **PowerShell** on the PC that runs Agent Town.

You only do steps 1–6 once. After that, going online is step 7.

> Cloudflare renames menu items from time to time. If a name below doesn't match, look for the closest one; the idea stays the same.

## 1. Put devsam.my on Cloudflare (free)
1. Sign in at dash.cloudflare.com and choose **Add a domain**, enter `devsam.my`, and pick the **Free** plan.
2. Cloudflare shows two nameservers. At the company you bought `devsam.my` from, replace the domain's nameservers with those two.
3. Wait until Cloudflare marks the domain as **Active**. This usually takes minutes, sometimes a few hours.

## 2. Turn on Zero Trust and create the login
1. In the Cloudflare dashboard open **Zero Trust**. Pick a team name, e.g. `devsam`; your login domain becomes `devsam.cloudflareaccess.com`. Choose the **Free** plan, which covers up to 50 users. Cloudflare may ask for a payment method even on the free plan.
2. Go to **Access → Applications → Add an application → Self-hosted**:
   - Name: `Agent Town`
   - Domain: `agents.devsam.my`
   - Session duration: e.g. 24 hours
3. Add a **policy**:
   - Action **Allow**
   - Include **Emails**: your email, plus anyone you'll invite (you can add them later)
4. Login method: **One-time PIN** is on by default (an emailed code). You can add Google later.
5. Save, then open the application's settings and copy the **Application Audience (AUD) Tag**. You'll need it in step 5.

## 3. Install cloudflared
```powershell
winget install --id Cloudflare.cloudflared
```
Close and reopen PowerShell, then check it works:
```powershell
cloudflared --version
```

## 4. Create the tunnel
```powershell
cloudflared tunnel login
```
```powershell
cloudflared tunnel create agent-town
```
```powershell
cloudflared tunnel route dns agent-town agents.devsam.my
```
- `login` opens a browser; pick `devsam.my`.
- `create` prints a **tunnel id** (a long id like `6ff42ae2-…`) and saves its credentials in `%USERPROFILE%\.cloudflared\`. Never commit that file.
- `route dns` points `agents.devsam.my` at the tunnel.

## 5. Tell Agent Town about it
In the Agent Town folder, run this with your own values:
```powershell
npm run hosted -- --init --owner you@example.com --team devsam --aud PASTE_AUD_TAG --host agents.devsam.my
```
This saves `data\hosting.json`, which is git-ignored and holds no secrets. **`--owner` must be the email you sign in with**; that person has full rights.

## 6. Write the tunnel config
```powershell
npm run hosted -- --cloudflared YOUR_TUNNEL_ID
```
Save what it prints as `%USERPROFILE%\.cloudflared\config.yml`. The config sends `/api/*` to the tunnel-only port (127.0.0.1:4318, which checks every login) and everything else to the web app (127.0.0.1:3000). The local port 4317 and OpenCode are never in it.

## 7. Go online
Use two PowerShell windows.

In the first, build and start Agent Town in hosted mode:
```powershell
npm run hosted
```
In the second, connect the tunnel:
```powershell
cloudflared tunnel run agent-town
```
- Open **https://agents.devsam.my** on your phone. Cloudflare asks for your email and sends a code. After that, Agent Town opens and shows your email at the bottom of the sidebar.
- On the PC itself you can still use http://127.0.0.1:3000 as before.
- Use `npm run hosted -- --no-build` to start again without rebuilding.

**To go offline:** press Ctrl+C in both windows. Nothing is reachable while either one is stopped.

## 8. Invite people
1. Agent Town → **People** → enter their email, pick **Viewer** or **Operator**, and set an operator's daily budget.
2. Cloudflare Zero Trust → your Agent Town application → policy → add the same email.

Both are needed: Cloudflare decides who can sign in, and Agent Town decides what they can do. Someone who can sign in but isn't on the People page sees "ask the owner to invite you".

## 9. Outside agents reporting from other devices (optional)
Bots on this PC report straight to `http://127.0.0.1:4317` with only their bot token. A bot somewhere else (another computer, a cloud VM) reports through the tunnel, and Cloudflare needs to let it in without an email login:
1. Zero Trust → **Access → Service credentials → Service Tokens** → **Create service token**, e.g. `agent-town-bots`. Copy the **Client ID** and **Client Secret**; the secret is shown once.
2. Zero Trust → **Access → Applications → Add an application → Self-hosted**:
   - Name: `Agent Town reports`
   - Domain: `agents.devsam.my`, path `api/report`
   - Policy: action **Service Auth**, include **Service Token** `agent-town-bots`
3. On the bot's machine set:
   - `AGENT_TOWN_URL=https://agents.devsam.my`
   - `AGENT_TOWN_BOT_TOKEN`: from the team page → Outside agents
   - `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`
4. Run `node scripts/agent-town-report.mjs coding "Short task summary"`. Copy that script to the bot's machine; it needs Node 22+.

Agent Town checks both the Cloudflare service token and the bot token. A service token alone can't use anything else in Agent Town.

## Good to know
- **Stay awake:** the PC must be on and awake while you want access. Check Windows sleep settings.
- **Run as a service (optional):** cloudflared can run as a Windows service (`cloudflared service install`). The service may look for its config in a different folder than your user profile, so get it working in a terminal first and then follow Cloudflare's guide for the service.
- **Never route other ports:** don't add the local API port (4317) or OpenCode (4096) to the tunnel config.
- **Lost access:** if a phone or laptop is lost, remove that person in both Cloudflare and People. Cloudflare can also revoke active sessions (Zero Trust → Users).
