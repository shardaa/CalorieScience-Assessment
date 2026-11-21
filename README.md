# CalorieScience Companion: Client Adherence & Practitioner Intelligence

A working prototype of the feedback loop between a client following a meal plan (**Companion App**, mobile) and their nutrition practitioner (**CalorieScience dashboard**, desktop). Both sides share one live data store, so anything the client logs shows up on the practitioner side, and anything the practitioner changes shows up in the client's app.

> **Try the loop in 60 seconds** (split view at `/`):
> 1. Dashboard → Ananya → under *Observed in logs*, click **Act on this** next to "Afternoon snack skipped on 4 of 7 logged days".
> 2. **Start from a suggested adjustment** → **Record proposed adjustment** → **Apply to plan & notify**.
> 3. Ananya's phone now shows a *Your plan was updated* card, the snack card reads **Portable protein snack · Updated by Neha**, and Messages has a badge.
> 4. On the phone, tap **Something changed** on Lunch → *Had something else* → "Ordered in" → Save. The practitioner's activity feed and grid update straight away.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain logic tests (vitest)
npm run build      # static build in dist/ (deployable to Netlify/Vercel/GitHub Pages)
```

Routes (hash-based, so the static build works on any host):

| Route | What |
|---|---|
| `/#/` | **Split demo**: Ananya's phone + the practitioner dashboard side by side. On narrow screens a toggle switches between them. |
| `/#/client` | Client Companion App only (open on a phone) |
| `/#/practitioner` | Practitioner dashboard only (starts at the caseload) |

Open `/#/client` and `/#/practitioner` in two tabs and they sync live via `BroadcastChannel`.

**Demo controls** (bottom-right "Demo" button): simulate offline (every request fails, so you can see the error and retry states), change network latency (to see loading skeletons), reset the scenario, or load an **80-client caseload** to test the roster at scale.

---

## Architecture

```
src/
  domain/            Pure TypeScript, no React. This is the logic under test.
    types.ts         Data model
    adherence.ts     Planned-vs-actual cells, due logic, adherence summary
    insights.ts      Rules engine: observations / interpretations / considerations / triggers
    commands.ts      State transitions (logMeal, sendFeedback, applyAdjustment, …)
    seed.ts          Scenario data relative to today + generated caseload
    adherence.test.ts
  data/
    backend.ts       Simulated API: localStorage persistence, latency, failure, cross-tab sync
    hooks.tsx        useDb (useSyncExternalStore), useLoad, useMutation, toasts
  client/            Companion App: Today, LogSheet, My week, Messages
  practitioner/      Roster, ClientDetail, InsightPanel, WeeklyPattern, FeedbackPanel, ActionsPanel
  ui/kit.tsx         Status icons/pills, skeletons, empty/error states
```

- **Commands are pure functions** `(db, input, now) → db`. The mock backend runs them against a `structuredClone` and only commits if they succeed, which gives the same atomicity a server transaction would. In production the same functions (or their validation) would live behind API endpoints.
- **Reads are synchronous snapshots** (`useSyncExternalStore`). Each screen's first load goes through `backend.fetch()`, which applies the simulated latency and can fail, so the skeleton, error and retry states are real code paths rather than mock-ups.
- **Analysis is derived, never stored.** `analyse()` recomputes from raw logs. That is cheap here (under 5 ms for 80 clients). In production it would run on write and be stored as a per-client summary row for the roster.

## Technology choices

| Choice | Why |
|---|---|
| React 18 + TypeScript + Vite | Fast to build in. Strict types keep the data model honest. |
| No UI framework, plain CSS with custom properties and **container queries** | The practitioner dashboard has to adapt to the *pane* it sits in (split view vs full screen), not just the viewport. |
| No router library | Three routes. A 10-line hash router is enough. |
| `lucide-react` icons | Status is always shown as **icon + label**, never colour alone. |
| Vitest | Tests the domain layer without a DOM. |
| No LLM at runtime | See "Insight engine". Rules give traceable, testable output. |

## Data model

```
Client ─┬─< MealPlan (versioned, effectiveFrom)  ──< PlannedMeal (slot, time, title, description, examples, prepMinutes)
        ├─< MealLog  (date, slot, status, substitute?, reasons[], hunger?, prepDifficulty?, actualTime?, comment?,
        │             planVersion + plannedTitle  ← snapshot of what was planned when logged)
        ├─< Message  (author client|practitioner, kind feedback|recommendation|reply, slot?, topic?,
        │             status new|acknowledged|resolved, seenByClientAt?, inReplyTo?, adjustmentId?)
        ├─< PlanAdjustment (slot, change, rationale, basedOn, status proposed|applied|discarded, appliedPlanVersion?)
        ├─< PractitionerNote (private)
        ├── CaseState (flag?, lastReviewedAt)
        └─< ActivityEvent (audit trail for both actors)
```

Key integrity rules:

1. **Planned and actual are separate records.** A `MealLog` never edits the plan, and the plan never edits a log.
2. **Plans are versioned, not edited in place.** Applying an adjustment creates version *n+1*, effective from today. Past logs keep their `planVersion` and `plannedTitle`, so history isn't rewritten ("she skipped the *old* snack" stays true).
3. **"Not logged" is not a status.** It is *derived* from a due meal having no log. Nothing ever writes `skipped` on the client's behalf.
4. One log per (client, date, slot). Editing a log keeps its id, `loggedAt` and plan snapshot, and updates `updatedAt`.

## Adherence calculation

Two numbers, always shown separately and always with their denominator:

| Metric | Formula | Question it answers |
|---|---|---|
| **Logging completeness** | logged ÷ due | How much do we actually know? |
| **Plan alignment** | Σ weight ÷ logged | Of what we know, how close was it to the plan? |

Weights: **followed 1 · partial 0.5 · substituted 0.5 · skipped 0**.

- *Substituted gets 0.5* because we don't know whether the substitute was nutritionally equivalent. "Ordered biryani" and "Greek yoghurt instead of chana" are both substitutions. Half credit avoids both over- and under-claiming, and the practitioner always sees the raw breakdown next to the number.
- **Missing logs are excluded from alignment.** Counting them as 0 would punish the client for not opening the app and would mix up two different problems (non-adherence vs disengagement).
- If nothing is logged, alignment is `—` (null), **not 0%**.
- A meal is **due** only once its planned time plus a 90-minute grace period has passed. Meals later today are "upcoming" and never count against anyone.
- The practitioner window is the **last 7 complete days**. Today is shown as a separate, faded column and kept out of the metrics, because a half-finished day would always look bad.
- **The client never sees a percentage.** They see "3 of 4 logged" and which meals went to plan or were tricky.

## Insight engine (rules-based)

`domain/insights.ts` produces four separately rendered tiers, so the UI can never blur fact and inference:

| Tier | Rule of thumb | UI treatment |
|---|---|---|
| **Observed in logs** | Counted directly. Always carries "N of M". | Plain text, coloured left border by tone |
| **Possible explanations** | Built only from observations, linked by id | Dashed amber box, italic, **"not confirmed"** badge |
| **Worth considering** | Phrased as things to review or ask, never as clinical advice | With a "Draft change" button |
| **Data quality** | Logging gaps and their size | Grey note: "treated as unknown, not counted as skipped" |

Thresholds: a pattern needs **≥3 occurrences in 7 days** and **≥3 logged days** for that meal. Timing drift = **≥60 min** from plan. "Workday concentration" = ≥80% of deviations on Mon–Fri *and* the meal was followed at least once on a weekend. Hunger/snack is reported as **co-occurrence** ("on the same days; the data does not establish cause").

### Attention triggers (roster triage)

| Trigger | Condition | Severity |
|---|---|---|
| Flagged | Practitioner flagged manually | high |
| New client feedback | Any client message with status `new` | high |
| Meal often skipped | ≥3 skips of one meal in 7 days | high |
| Alignment declining | Last-4-days alignment ≥20 pts below first-3-days (≥4 logs each side) | high |
| Meal often substituted | ≥3 substitutions of one meal | medium |
| Logging gap | Completeness < 60% | medium |
| No logs this week | Meals due but none logged | medium |

Priority = sum of severities (high 30, medium 12). **If the practitioner has reviewed the client and nothing new has arrived since, priority drops to 20%**, so reviewed clients sink and anything new floats them back up. "Needs attention" = priority ≥ 20.

## AI tools used

- **Claude Code (Claude Opus 5.5)** was the main pair-programmer: scaffolding, the first drafts of the domain modules, components and CSS, and the first drafts of this documentation.
- No AI at runtime. The insight engine is deterministic rules. See `REFLECTION.md` for how a constrained LLM layer could be added safely.

## Assumptions

- One practitioner and one active plan per client. Four fixed meal slots (matching the brief).
- Workdays are Mon–Fri. A real product would let the client set their own work pattern.
- The seed is **generated relative to today**, so "the last 7 days" always exists. It reseeds automatically on a new calendar day (and on schema changes).
- Ananya's week is hand-scripted from the brief: breakfast consistent; lunch substituted 3× on workdays plus 1 partial; snack skipped 4× on workdays and substituted once; dinner 60–135 min late on 4 days; hungry evenings on the snack-skip days; **one unlogged dinner** to show the gap handling; and her quoted feedback.
- The practitioner is **Neha Kulkarni, RD** (fictional). Other clients are generated from behaviour profiles (on-track, logging-gap, declining, social-dinner, mixed) plus one brand-new client (Divya) to show empty states.

## What is mocked / simulated

| Simulated | Production approach |
|---|---|
| Backend + DB (`data/backend.ts`, localStorage) | Postgres (e.g. Supabase) with the same tables. Commands become API endpoints with server-side validation and row-level security per practitioner. |
| Latency and failures | Real network. Mutations would add an offline queue on mobile (log now, sync later). |
| Real-time sync (`BroadcastChannel`) | Websocket/SSE subscriptions for the dashboard, plus **push notifications** to the client for practitioner messages and plan updates. |
| Auth | Not built (per brief). The routes stand in for "logged in as client" and "logged in as practitioner". |
| Insight computation on read | Computed on log write and cached as a per-client summary, so the roster is one indexed query at 100+ clients. |
| Meal content | Static text per slot. No nutrition database (per brief). |

## Known limitations

- localStorage only: data is per browser. "Reset scenario data" restores the brief's state.
- Logging is for **today** only on the client. Back-filling yesterday is supported by the data model and commands but has no UI yet.
- No message threading beyond a single reply level, and no attachments.
- Trigger thresholds are untuned guesses. With real data they would be calibrated (and probably made per-practitioner).
- The 80-client caseload is randomly generated, so ~40% of it meets triggers. That is noisier than a real practice and is there to test layout and performance, not triage quality.
- Accessibility: keyboard and labelled controls throughout, but no screen-reader audit has been done.
