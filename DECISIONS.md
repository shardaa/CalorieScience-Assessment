# Product decisions (Part D)

### What should the client see first?
**Today's meals, in time order, with the next one highlighted** ("Up next"), and above them only two things: any unread message from the practitioner, and a check-in card ("2 of 4 meals" with a ring). No score, no streak, no calorie numbers. The next meal gets a large card of its own with a one-tap **Had it**. The client's question on opening the app is "what am I eating next?", not "how am I doing?".

### What should the practitioner see first?
**A triaged caseload**, not a client. "Who needs you this week" is pre-filtered to *Needs attention* and sorted by trigger severity, with each row saying *why* it surfaced ("Afternoon snack often skipped", "New client feedback"). Opening a client leads with a **one-paragraph summary** of what appears to be happening. The heatmap, feedback and actions come after it.

### What is surfaced vs hidden?
| Surfaced immediately | One interaction away |
|---|---|
| Client: next meal, quick-log buttons, practitioner tips inline on the relevant meal | Alternative meal options, log details (hunger, prep, comment) |
| Practitioner: why-surfaced chips, headline summary, top 6 observations, 7×4 heatmap | Full observation list, per-cell log detail (click), older messages, plan history |

### How is adherence calculated?
Two separate metrics, *logging completeness* and *plan alignment*, each with its denominator. Partial and substituted meals get half credit. See the README for the formula. The **grid plus breakdown bar is the primary visual**. The percentage is supporting context, never shown alone.

### How is incomplete logging treated? Non-adherence vs missing data
They are treated as different things and shown differently:
- **Skipped** = the client told us they didn't eat. Coral cell with ✕. Counts as 0 in alignment.
- **Not logged** = we don't know. Grey hatched cell with "?". **Excluded** from alignment, counted in completeness, called out in a data-quality note ("treated as unknown, not counted as skipped").
- Low completeness raises its own trigger ("Logging gap") and its own consideration: *ask about logging before drawing conclusions*. Disengagement is a different conversation from "the snack isn't working".

### What triggers practitioner attention?
New client feedback, manual flags, a meal skipped ≥3× in 7 days, declining alignment (high); frequent substitution and logging gaps (medium). **Marking a client reviewed drops their priority until new data arrives**, which keeps "Needs attention" a to-do list rather than a permanent wall of red.

### How does the experience encourage honesty rather than guilt?
- **Client-facing wording is neutral and first-person**: "Had it as planned / Had some of it / Had something else / Didn't eat", not "Compliant / Non-compliant".
- **The logged state looks the same for every outcome.** A skipped meal doesn't turn red on the client's screen. Red/amber is only used on the practitioner side, where it is information rather than judgement.
- Microcopy at the moment of logging: *"There are no wrong answers. An honest log helps Neha more than a perfect one."*
- "My week" counts **check-ins**, not success, and explicitly values off-plan logs: *"including 9 that didn't go to plan. Those are often the most useful for Neha."*
- Logging a deviation offers a path to explain it: *"Is this happening a lot? Tell Neha"*. A hard day becomes a conversation, not a mark against the client.
- The practitioner's welcome message (seeded) sets the same expectation from day one.

### Fast logging ("a few seconds")
- **One tap** for the common case: "Had it" on the meal card.
- **Two taps** for a deviation: "Something changed" → status → Save. Everything else (substitute, reasons, hunger, prep, time, comment) is optional and shown only when relevant. Substitution requires only a word, with quick chips ("Office cafeteria", "Ordered in").

### How does this scale to 50–100 clients?
- The roster is the product: triage chips, sort by priority, filters with counts, search.
- A **4×7 micro-heatmap per row** lets the practitioner see the shape of a week without opening the client. The pattern reads at a glance at this size.
- Review state sinks handled clients. The "Load 80-client caseload" demo control tests this.
- In production, per-client analysis would be computed on write and stored, and the roster would be paginated server-side.

### Distinguishing observed information from assumptions
The insight engine returns separate typed arrays, and the UI renders each in a visually distinct container. Interpretations carry a "not confirmed" badge and list the observation ids they rest on. Considerations are phrased as prompts ("Review…", "Discuss whether…", "Ask about…"), never as prescriptions. A footer states that the summary describes patterns and makes no clinical judgement.

### Practitioner actions and their visible effect
| Action | Effect on the client app | Effect on the practitioner workflow |
|---|---|---|
| **Message client** (optionally about a meal) | Card on Today + tip inline on that meal + Messages badge | Shows "read" / "not read yet" |
| **Reply to feedback** | Threaded under their message | Feedback moves new → acknowledged |
| **Propose → Apply plan change** | Meal card changes, "Updated by Neha" badge, plan-update card | New plan version. Rationale and evidence stored with it. Proposals can be discarded. |
| **Flag for follow-up** | – | Flag chip, top of triage |
| **Mark week reviewed** | – | Feedback marked seen, client sinks in roster until new data |
| **Private note** | – | Stored on the client record |
| **Add client** (caseload header) | They can sign in with their email straight away and see "Your plan isn't ready yet" | Name, email, age, goal, programme length. No plan yet, so they surface in *Needs attention* as "Plan not shared yet". Duplicate names or emails are refused. |
| **Create / edit whole plan** (Meal plan tab) | "Your meal plan is ready" (or "updated") card, and the meals on Today and Plan | Four meals on one screen: time, meal, what to eat, alternatives, prep. Sharing creates v1, or a new version that marks only the meals that changed. |

"Propose" and "Apply" are separate steps on purpose: a practitioner can record a change they want to discuss in the next session without pushing it to the client yet.
