# Technical reflection

> **Draft. Personalise before submitting.** Sections marked ✏️ need your own first-hand account. Reviewers will ask about them in the walkthrough.

### What was the most difficult decision?
**How to score a substitution, and whether to blend missing data into a single number.**
A single "adherence %" is what a dashboard usually shows, but it hides the two things a practitioner most needs to tell apart: *"she isn't following the plan"* vs *"she isn't telling us"*. I split it into **logging completeness** and **plan alignment**, excluded unlogged meals from alignment, and gave substitutions half credit because we can't know their nutritional equivalence. The cost is that the practitioner sees two numbers instead of one. To make that easy to read, neither number is ever shown without its denominator, and the heatmap is the primary visual.

A close second: **the boundary between observation and interpretation in the insight engine.** It would have been easy to write "Ananya skips her snack because of work". The data supports "skipped on 4 of 7 days, all workdays; the client cited 'no time' 4×". The rest is labelled as a possible explanation.

### What did I deliberately leave out?
- **An LLM at runtime.** Rules are traceable, testable and can't hallucinate a clinical claim. An LLM would add fluency, not insight, at this data size.
- **Auth, a nutrition database, a meal-plan editor** (per the brief).
- **Back-filling past days on the client.** The data model and command support it; the UI does not.
- **Push notifications, a real backend, a full messaging system.** Simulated, as documented.
- **Streaks and gamification.** Streaks punish honest gaps and push people towards over-reporting.

### What would I change before production?
1. A real backend with row-level security, server-side validation of the same commands, and an audit log (the `ActivityEvent` model is already there).
2. An offline-first client (queue logs locally, sync later). The "offline" toggle shows why this matters at lunchtime in an office basement.
3. Precompute per-client analyses on write and paginate the roster.
4. Calibrate trigger thresholds on real data, and let practitioners tune them.
5. Configurable work pattern per client (shift workers break "Mon–Fri = workday").
6. Accessibility audit (screen reader, colour-blind check of the heatmap palette) and i18n.
7. Clinical review of every piece of system-generated wording.

### What would I build next?
1. **Adjustment outcome tracking**: after a plan change, compare the before and after alignment of that meal ("snack alignment 14% → 71% since v2"). This closes the loop and shows whether the intervention worked.
2. **An LLM-drafted message to the client**, constrained to the observed facts and the practitioner's chosen adjustment, always edited and sent by the practitioner.
3. **Client-side "check-in nudges"** at sensible times, suppressed during reported meeting hours.
4. **Session prep view**: a one-page summary for the next consultation, built from notes, flags and adjustments.

### Where did AI accelerate development?
✏️ *Describe your own experience. Suggested starting point:* Claude Code drafted most of the boilerplate (component scaffolding, CSS, seed generator, first versions of the docs) and the first pass of the rules engine from my description of the tiers. That freed my time for the parts that needed judgement: the adherence model, wording on the client side, and checking the insight output against the scenario.

### Which parts did I personally validate or debug?
✏️ *Replace with what you actually checked.* Things that were verified while building this prototype, which you should re-check yourself so you can speak to them:
- **Domain tests** (`npm test`, 9 tests): missing ≠ skipped; null alignment when nothing is logged; today's future meals not counted as due; scenario patterns detected; trigger set; plan versioning doesn't rewrite past logs; review state sinks priority until new data.
- **Insight wording** was read against the brief. The headline was rewritten so "mostly on workdays" qualifies all the issues rather than only the last one.
- **End-to-end loop in the browser**: "Act on this" → suggested adjustment → apply → client card and updated meal → client logs a substitution → it appears in the practitioner activity feed.
- **Bugs found and fixed during browser testing**: substitute validation only fired after the simulated round-trip (now instant on the client, with the same server-side rule kept); in single-column layout the client feedback appeared below the fold (panels now interleave via CSS `order`); the floating demo button covered the client's Messages tab on phones; "didn't go to plan" undercounted by leaving out partial meals; "Alignment declining" wasn't severe enough to surface in *Needs attention*.
