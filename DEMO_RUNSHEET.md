# Yume — 2-minute demo runsheet

Everything needed to record one clean take: what it costs, what to check
first, what to click, and exactly what to type.

---

## 1. What it costs

Rate pulled live from `GET https://api.reactor.inc/pricing`:

| | |
|---|---|
| `visko-orbis-stable` | **$0.0097 / second** = **$0.582 / minute** |
| **A 2-minute take** | **≈ $1.16** |
| 30-second rehearsal | ≈ $0.29 |
| Max one session can cost | **$2.91** (token caps sessions at 300s) |
| $250 of credit | ≈ **429 minutes** ≈ **214 full 2-minute takes** |

**You have a very comfortable budget.** Even 20 messy takes is under $25.

### Three things that actually burn credits

1. **Idle time bills at full rate.** Reactor meters every wall-clock second
   the GPU is held "even if you are idle and not sending commands." Sitting on
   a connected world while you adjust OBS costs the same as playing it.
2. **Billing granularity is ambiguous.** The docs say billing is per
   session-*minute*; the pricing API quotes a per-*second* rate. Assume short
   aborted takes round up to a full minute (~$0.58 each). Check the dashboard
   after take one to confirm which it is.
3. **The session hard-stops at 300 seconds.** A 2-minute take is fine, but if
   you fumble and run past 5:00 the world dies mid-shot. Watch the on-screen
   session meter — it turns amber at 4:00.

### Habits that keep the bill near zero

- Click **Leave** the moment a take ends. Don't leave a world connected.
- Don't background the tab with a live world in it.
- Rehearse the *typing* with the world disconnected — only connect when
  you're actually rolling.

---

## 2. Preflight (run this before every session)

```bash
node scripts/preflight-reactor.mjs
```

Zero cost — minting a token holds no GPU. It validates your Reactor key and
model grant, checks Groq + Fish keys, pulls the live rate, and prints the
budget table. **Don't start recording until it says `Ready to record.`**

Then:

```bash
npm run dev
```

**Browser setup:** Chrome, clean profile, no extensions, bookmarks bar hidden,
notifications off, other tabs closed. Sound on. **Zoom at 100%.**

---

## 3. The take (2:00)

Timings for Orbis steering and narration are *estimates* — they've not been
measured against a live key yet. **Do one throwaway rehearsal take (~$0.29) to
calibrate**, then record.

### 0:00–0:15 — Landing

Start scrolled to the top. Let the hero video play for a beat.

> "This is Yume. Learning Japanese from a textbook is boring — so instead,
> you get dropped into a living world, and the only way to change it is to
> speak Japanese to it."

Scroll down just far enough to reveal the four world cards.

### 0:15–0:30 — Enter the world

Click **こうえん / The Park**. While it connects:

> "This is a real, live AI-generated video world — not a pre-rendered clip.
> It's running right now, and it reacts to what I say."

The narrator speaks as soon as the world starts.

### 0:30–0:50 — The learning layer (**this is the part judges haven't seen before**)

The Japanese narration is on screen. Do all three, slowly and deliberately:

1. **Hover** `公園` → tooltip shows *こうえん · park*
2. **Hover** a particle like `に` → *location marker*
3. **Double-click** `猫` → it saves, underline turns gold

> "The world narrates itself in Japanese, at my level. Every word is
> hoverable for its reading and meaning — and if I double-click one, it's
> saved to my vocabulary."

Click **Show English** to reveal the translation, then hide it again.

### 0:50–1:10 — Answer at level 1, world reacts

Make sure the level picker is on **ひとこと (single word)**.

Type: `ねこ`

> "At the easiest level, a single word is a full answer."

**Wait for the video to visibly change** — a cat appears. Do not talk over
this; let it land.

> "That's the whole mechanic. My Japanese was understood, so the live world
> steered to match it."

### 1:10–1:30 — Level up

Click **ぶん (full sentence)** on the level picker.

> "As I improve, I raise the level — and both what the narrator says to me
> and what counts as a correct answer get harder."

Type: `いぬが ねこの となりに います。`

A dog appears next to the cat. Note aloud that the cat is *still there* —
the scene is cumulative, not a fresh clip each time.

### 1:30–1:45 — Prove the failure case (**don't skip this**)

Type deliberate nonsense: `あああ`

> "And if what I say doesn't actually mean anything — the world doesn't
> move. The video itself is the feedback."

The world stays still. This is the single most convincing shot in the video,
because it proves the loop is genuinely gated on comprehension.

Then type: `あめが ふります。`

Rain starts falling — the most visually dramatic change in the scenario.

### 1:45–2:00 — Vocabulary + close

Open **My words** in the HUD. The word you saved is there.

> "Everything I looked up while playing is saved to review later. Yume means
> dream — you learn the language by living in a world you actually want to
> be in."

Click **Leave** — *on camera* is fine, it shows the session ending cleanly.

---

## 4. Copy-paste answers

Keep this open in a second window. Park scenario, in order:

| Step | Type this | What happens |
|---|---|---|
| 1 | `ねこ` (level 1) or `こうえんに ねこが います。` | A cat appears in the grass |
| 2 | `いぬが ねこの となりに います。` | A dog appears beside the cat |
| 3 | `てんきは きれいです。` | Golden light through the blossoms |
| 4 | `あめが ふります。` | Rain starts, animals shelter under a tree |
| — | `あああ` | **Nothing** — the failure shot |

---

## 5. If something goes wrong

| Problem | Do this |
|---|---|
| World won't connect | Stop. Re-run preflight. Don't burn takes on a bad key. |
| Answer graded wrong | Groq is non-deterministic. Retype it — don't fight it on camera. |
| No narration audio | Fish Audio may have hiccuped. The text still renders; hit the replay speaker icon. |
| Narration missing entirely | Groq failed. The game still plays — carry on and re-record later. |
| Meter hits amber (4:00) | Wrap the take now or you'll lose the world at 5:00. |
| Steering looks slow | Cut the dead air in the edit — never imply pre-rendered output is live. |

---

## 6. After the take

- [ ] Click **Leave** — confirm the session actually ended
- [ ] Check the Reactor dashboard; confirm spend matches expectation **and
      whether billing rounded to the minute**
- [ ] Watch the recording back with sound
- [ ] Confirm no API key is visible in any frame (DevTools, `.env`, terminal)
- [ ] Keep the raw file — re-recording costs credits, re-editing doesn't
