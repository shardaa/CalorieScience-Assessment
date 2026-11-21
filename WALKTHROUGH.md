# Walkthrough script (≈4 min)

Before recording: open `/#/`, click **Demo → Reset scenario data**, and use a window at least 1300 px wide.

**0:00–0:20 · Framing**
"A meal plan is only the start of the intervention. This prototype closes the loop: the client reports what actually happened, the practitioner sees the patterns without reading every entry, and their response lands back in the client's app. Left: Ananya's Companion App. Right: her practitioner's CalorieScience dashboard. One shared data store."

**0:20–1:15 · Client**
- Today screen: date, week 2 of 4, meals in time order, *Up next* highlighted. "No score here, on purpose."
- Tap **Had it** on one meal: one tap.
- Tap **Something changed** on lunch → *Had something else* → "Ordered in" → reason "At work" → Save. "Two taps plus an optional word. Everything else is optional."
- Point at the honesty microcopy and the neutral wording. A skipped meal doesn't turn red for the client.
- **My week**: check-ins, not compliance. "Off-plan logs are framed as the most useful ones."

**1:15–2:45 · Practitioner**
- Back to the **Caseload** (click *Caseload*): "Who needs you this week", with *why* each client surfaced and a 4×7 micro-heatmap. Mention reviewed clients sinking and the 80-client demo.
- Open Ananya. Read the **headline**.
- Three tiers: *Observed* (always with counts), *Possible explanations* ("not confirmed"), *Worth considering*. "The system never claims why. It says what, how often, and what she told us."
- Heatmap: weekend shading makes the workday pattern obvious; late dinner times are printed in the cells; the **hatched Wednesday dinner is missing data, not a skip**. Click it to show "Unknown whether eaten". Click a skipped snack to show her reasons and comment.
- KPIs: two numbers, both with denominators. Explain why they're never blended.
- Feedback panel: her quoted message, with reasons aggregated by meal.

**2:45–3:40 · Action → client outcome**
- Click **Act on this** next to the snack observation → *Start from a suggested adjustment* → *Record proposed adjustment*. "Propose and apply are separate. You can park a change for the next session."
- **Apply to plan & notify**. Switch eyes to the phone: plan-update card, *Portable protein snack · Updated by Neha*, Messages badge. Tap **Got it** → the practitioner sees "Client: Read your message".
- Mention: plan v2 starts today; last week's logs still point at v1, so history isn't rewritten.
- **Mark week reviewed** → back on the roster, Ananya sinks until she logs again.

**3:40–4:00 · Engineering and close**
- Demo controls: toggle **offline**, try an action → error toast with Retry, error state with Try again.
- "Pure domain layer with tests, simulated backend with real loading and error paths. The README covers what's mocked and how I'd build it for production. The next thing I'd build is tracking whether the adjustment actually changed adherence."
