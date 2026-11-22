import { buildCells, summarize, summarizeBySlot, type Cell, type Summary } from './adherence';
import { REASON_LABEL, SLOT_LABEL } from './labels';
import { addDays, formatClock, lastNDays, minutesOf, toDateKey } from './time';
import type { CaseState, Database, DateKey, MealLog, MealSlot, Message, ReasonCode } from './types';
import { SLOTS } from './types';

/**
 * RULES-BASED INSIGHT ENGINE
 *
 * Output is split into three epistemic tiers so the UI can never blur them:
 *   observations    — counted directly from logs/messages. Always carry numbers.
 *   interpretations — plausible explanations. Always labelled as unconfirmed and
 *                     linked to the observations they rest on.
 *   considerations  — prompts for the practitioner's own judgement, phrased as
 *                     things to review/ask, never as clinical recommendations.
 *
 * Thresholds are deliberately simple and documented in README → "Attention triggers".
 */

export const WINDOW_DAYS = 7;
export const RECURRING_THRESHOLD = 3; // ≥3 occurrences in 7 days = a pattern, not a one-off
export const TIMING_DRIFT_MIN = 60;

export type Tone = 'positive' | 'neutral' | 'concern';

export interface Observation {
  id: string;
  tone: Tone;
  slot?: MealSlot;
  text: string;
}

export interface Interpretation {
  id: string;
  text: string;
  basedOn: string[]; // observation ids
}

export interface Consideration {
  id: string;
  slot?: MealSlot;
  text: string;
}

export type TriggerCode =
  | 'flagged'
  | 'new_feedback'
  | 'recurring_skip'
  | 'frequent_substitution'
  | 'logging_gap'
  | 'declining'
  | 'no_logs'
  | 'no_plan';

export interface Trigger {
  code: TriggerCode;
  label: string;
  severity: 'high' | 'medium' | 'low';
  slot?: MealSlot;
}

export interface Barrier {
  reason: ReasonCode;
  count: number;
  slots: Partial<Record<MealSlot, number>>;
}

export interface Analysis {
  window: DateKey[];
  cells: Cell[];
  summary: Summary;
  bySlot: Record<MealSlot, Summary>;
  observations: Observation[];
  interpretations: Interpretation[];
  considerations: Consideration[];
  dataQuality: string[];
  headline: string;
  barriers: Barrier[];
  comments: MealLog[];
  openFeedback: Message[];
  triggers: Trigger[];
  priority: number;
  newSinceReview: boolean;
  lastActivityAt: string | null;
}

const isDeviation = (l: MealLog) => l.status !== 'followed';
const TIME_REASONS: ReasonCode[] = ['no_time', 'at_work', 'prep_effort'];

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function topCounts(values: string[], n = 3): [string, number][] {
  const m = new Map<string, number>();
  values.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Analysis window = the last 7 *complete* days (today is still in progress). */
export function analysisWindow(now: Date): DateKey[] {
  return lastNDays(addDays(toDateKey(now), -1), WINDOW_DAYS);
}

export function analyse(db: Database, clientId: string, now: Date): Analysis {
  const window = analysisWindow(now);
  const cells = buildCells(db, clientId, window, now);
  const summary = summarize(cells);
  const bySlot = summarizeBySlot(cells);
  const logs = cells.flatMap((c) => (c.log ? [c.log] : []));

  const observations: Observation[] = [];
  const interpretations: Interpretation[] = [];
  const considerations: Consideration[] = [];
  const dataQuality: string[] = [];
  const triggers: Trigger[] = [];

  const workdayConcentrated: MealSlot[] = [];
  const timeBarrierSlots: MealSlot[] = [];
  const consistent: MealSlot[] = [];
  const concernPhrases: string[] = [];

  for (const slot of SLOTS) {
    const s = bySlot[slot];
    const slotCells = cells.filter((c) => c.slot === slot);
    const slotLogs = slotCells.flatMap((c) => (c.log ? [c.log] : []));
    const label = SLOT_LABEL[slot];
    const lower = label.toLowerCase();
    if (s.logged < 3) continue; // not enough data to call a pattern

    const deviations = slotLogs.filter(isDeviation);
    const workdayDev = deviations.filter((l) => slotCells.find((c) => c.log === l)?.workday);
    const weekendFollowed = slotCells.filter((c) => !c.workday && c.log?.status === 'followed').length;

    if (s.counts.followed / s.logged >= 0.8 && s.logged >= 4) {
      consistent.push(slot);
      observations.push({
        id: `${slot}-consistent`,
        tone: 'positive',
        slot,
        text: `${label} followed as planned on ${s.counts.followed} of ${s.logged} logged days.`,
      });
    }

    if (s.counts.skipped >= RECURRING_THRESHOLD) {
      const wd = slotLogs.filter((l) => l.status === 'skipped' && slotCells.find((c) => c.log === l)?.workday).length;
      observations.push({
        id: `${slot}-skipped`,
        tone: 'concern',
        slot,
        text: `${label} skipped on ${s.counts.skipped} of ${s.logged} logged days${wd ? ` — ${wd === s.counts.skipped ? 'all' : wd} on workdays` : ''}.`,
      });
      concernPhrases.push(`${lower} skipped ${s.counts.skipped}×`);
      triggers.push({ code: 'recurring_skip', label: `${label} often skipped`, severity: 'high', slot });
    }

    if (s.counts.substituted >= RECURRING_THRESHOLD) {
      const subs = topCounts(slotLogs.filter((l) => l.status === 'substituted' && l.substitute).map((l) => l.substitute!.toLowerCase()), 2);
      observations.push({
        id: `${slot}-substituted`,
        tone: 'concern',
        slot,
        text: `${label} substituted on ${s.counts.substituted} of ${s.logged} logged days${subs.length ? ` (most often: ${joinList(subs.map(([v, n]) => `${v}${n > 1 ? ` ×${n}` : ''}`))})` : ''}.`,
      });
      concernPhrases.push(`${lower} substituted ${s.counts.substituted}×`);
      triggers.push({ code: 'frequent_substitution', label: `${label} often substituted`, severity: 'medium', slot });
    }

    if (deviations.length >= RECURRING_THRESHOLD && workdayDev.length / deviations.length >= 0.8 && weekendFollowed > 0) {
      workdayConcentrated.push(slot);
      observations.push({
        id: `${slot}-workday`,
        tone: 'neutral',
        slot,
        text: `${workdayDev.length} of ${deviations.length} ${lower} deviations were on workdays; it was followed on ${weekendFollowed} weekend day${weekendFollowed > 1 ? 's' : ''}.`,
      });
    }

    const reasons = deviations.flatMap((l) => l.reasons);
    const timeReasons = reasons.filter((r) => TIME_REASONS.includes(r)).length;
    if (deviations.length >= RECURRING_THRESHOLD && reasons.length) {
      const top = topCounts(reasons.map((r) => REASON_LABEL[r as ReasonCode]), 2);
      observations.push({
        id: `${slot}-reasons`,
        tone: 'neutral',
        slot,
        text: `Reasons the client gave for ${lower} changes: ${joinList(top.map(([r, n]) => `“${r}” (${n})`))}.`,
      });
      if (timeReasons / reasons.length >= 0.5) timeBarrierSlots.push(slot);
    }

    // Timing drift: only meaningful where the client logged an actual time.
    const timed = slotLogs.filter((l) => l.actualTime && l.status !== 'skipped');
    if (timed.length >= 3) {
      const planned = minutesOf(slotCells[0].planned.time);
      const drifts = timed.map((l) => minutesOf(l.actualTime!) - planned);
      const late = drifts.filter((d) => Math.abs(d) >= TIMING_DRIFT_MIN).length;
      if (late >= RECURRING_THRESHOLD) {
        const times = timed.map((l) => minutesOf(l.actualTime!));
        const min = formatClock(timed[times.indexOf(Math.min(...times))].actualTime!);
        const max = formatClock(timed[times.indexOf(Math.max(...times))].actualTime!);
        observations.push({
          id: `${slot}-timing`,
          tone: 'concern',
          slot,
          text: `${label} eaten between ${min} and ${max} (planned ${formatClock(slotCells[0].planned.time)}); ${late} of ${timed.length} timed logs were ${TIMING_DRIFT_MIN}+ min off plan.`,
        });
        concernPhrases.push(`${lower} timing varies`);
        considerations.push({
          id: `${slot}-timing-c`,
          slot,
          text: `Discuss whether ${formatClock(slotCells[0].planned.time)} is a realistic ${lower} time on workdays, or whether a range would work better.`,
        });
      }
    }
  }

  // Hunger co-occurrence (observed together — explicitly not causal).
  const hungryDays = [...new Set(logs.filter((l) => l.hunger !== undefined && l.hunger <= 2).map((l) => l.date))];
  if (hungryDays.length >= 2) {
    const withSnackMissed = hungryDays.filter((d) => {
      const snack = cells.find((c) => c.date === d && c.slot === 'snack');
      return snack?.log && snack.log.status !== 'followed' && snack.log.status !== 'partial';
    });
    observations.push({
      id: 'hunger',
      tone: 'concern',
      text: `Client rated themselves hungry or very hungry on ${hungryDays.length} days${withSnackMissed.length ? `; on ${withSnackMissed.length === hungryDays.length ? 'all' : withSnackMissed.length} of them the afternoon snack was skipped or replaced` : ''}.`,
    });
    if (withSnackMissed.length >= 2) {
      interpretations.push({
        id: 'hunger-i',
        text: 'Missing the afternoon snack may be contributing to later hunger. These occurred on the same days; the data does not establish cause.',
        basedOn: ['hunger', 'snack-skipped'],
      });
    }
  }

  // Client feedback.
  const clientMessages = db.messages.filter((m) => m.clientId === clientId && m.author === 'client' && m.kind === 'feedback');
  const openFeedback = clientMessages.filter((m) => m.status !== 'resolved');
  for (const m of openFeedback.slice(0, 2)) {
    observations.push({
      id: `fb-${m.id}`,
      tone: 'neutral',
      slot: m.slot,
      text: `Client wrote${m.slot ? ` about ${SLOT_LABEL[m.slot].toLowerCase()}` : ''}: “${m.body}”`,
    });
  }
  if (clientMessages.some((m) => m.status === 'new')) {
    triggers.push({ code: 'new_feedback', label: 'New client feedback', severity: 'high' });
  }

  // Interpretations built from the tiers above.
  if (workdayConcentrated.length) {
    interpretations.push({
      id: 'workday-i',
      text: `Changes to ${joinList(workdayConcentrated.map((s) => SLOT_LABEL[s].toLowerCase()))} cluster on workdays, which suggests a schedule or setting constraint rather than the food itself.`,
      basedOn: workdayConcentrated.map((s) => `${s}-workday`),
    });
  }
  if (timeBarrierSlots.length) {
    interpretations.push({
      id: 'time-i',
      text: `Time available during the working day appears to be the main barrier for ${joinList(timeBarrierSlots.map((s) => SLOT_LABEL[s].toLowerCase()))}. This is client-reported and has not been discussed yet.`,
      basedOn: timeBarrierSlots.map((s) => `${s}-reasons`),
    });
  }

  // Considerations.
  for (const slot of timeBarrierSlots) {
    const meal = cells.find((c) => c.slot === slot)?.planned;
    if (slot === 'snack' || slot === 'breakfast') {
      considerations.unshift({
        id: `${slot}-portable`,
        slot,
        text: `Review portability and preparation of the ${SLOT_LABEL[slot].toLowerCase()} (currently ~${meal?.prepMinutes ?? '?'} min prep). Ready-to-eat options may fit better on workdays.`,
      });
    } else {
      const subs = topCounts(cells.filter((c) => c.slot === slot && c.log?.substitute).map((c) => c.log!.substitute!.toLowerCase()), 2);
      considerations.unshift({
        id: `${slot}-workplace`,
        slot,
        text: `Consider ${SLOT_LABEL[slot].toLowerCase()} options that work at the office${subs.length ? `, or guidance for choosing well from what the client already picks (${joinList(subs.map(([v]) => v))})` : ''}.`,
      });
    }
  }
  for (const slot of consistent) {
    considerations.push({ id: `${slot}-keep`, slot, text: `${SLOT_LABEL[slot]} is working well. Probably best left as it is for now.` });
  }

  // Data quality & logging gaps (missing ≠ skipped).
  const daysWithNoLogs = window.filter((d) => cells.some((c) => c.date === d) && !cells.some((c) => c.date === d && c.log));
  if (summary.notLogged > 0) {
    const bySlotGaps = SLOTS.filter((s) => bySlot[s].notLogged > 0).map((s) => `${SLOT_LABEL[s].toLowerCase()} ${bySlot[s].notLogged}`);
    dataQuality.push(
      `${summary.notLogged} of ${summary.due} planned meals have no log (${joinList(bySlotGaps)}). These are treated as unknown and are not counted as skipped.`,
    );
  }
  if (daysWithNoLogs.length) dataQuality.push(`${daysWithNoLogs.length} day${daysWithNoLogs.length > 1 ? 's' : ''} with nothing logged.`);
  if (summary.due > 0 && summary.logged === 0) {
    triggers.push({ code: 'no_logs', label: 'No logs this week', severity: 'medium' });
  } else if (summary.completeness !== null && summary.completeness < 0.6) {
    triggers.push({ code: 'logging_gap', label: `Logging gap (${Math.round(summary.completeness * 100)}% logged)`, severity: 'medium' });
    considerations.push({ id: 'gap-c', text: 'Ask about logging before drawing conclusions. Low logging may reflect app friction or a difficult week, not non-adherence.' });
  }

  // Change over the week: compare first 3 vs last 4 days (alignment of logged meals).
  const early = summarize(cells.filter((c) => window.indexOf(c.date) < 3));
  const late = summarize(cells.filter((c) => window.indexOf(c.date) >= 3));
  if (early.alignment !== null && late.alignment !== null && early.logged >= 4 && late.logged >= 4) {
    const delta = late.alignment - early.alignment;
    if (Math.abs(delta) >= 0.2) {
      observations.push({
        id: 'trend',
        tone: delta > 0 ? 'positive' : 'concern',
        text: `Plan alignment ${delta > 0 ? 'rose' : 'fell'} from ${Math.round(early.alignment * 100)}% (first 3 days) to ${Math.round(late.alignment * 100)}% (last 4 days).`,
      });
      if (delta < 0) triggers.push({ code: 'declining', label: 'Alignment declining', severity: 'high' });
    }
  }

  // Case state.
  const cs: CaseState | undefined = db.caseStates.find((c) => c.clientId === clientId);
  if (cs?.flag) triggers.unshift({ code: 'flagged', label: `Flagged: ${cs.flag.reason}`, severity: 'high' });

  const clientEvents = [
    ...db.logs.filter((l) => l.clientId === clientId).map((l) => l.updatedAt),
    ...clientMessages.map((m) => m.createdAt),
  ].sort();
  const lastActivityAt = clientEvents[clientEvents.length - 1] ?? null;
  const newSinceReview = !cs?.lastReviewedAt || (lastActivityAt !== null && lastActivityAt > cs.lastReviewedAt);

  // A client with no plan has nothing to follow: always worth the practitioner's attention.
  const hasPlan = db.plans.some((p) => p.clientId === clientId);
  if (!hasPlan) triggers.push({ code: 'no_plan', label: 'Plan not shared yet', severity: 'high' });

  const sevWeight = { high: 30, medium: 12, low: 4 } as const;
  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  triggers.sort((x, y) => sevRank[x.severity] - sevRank[y.severity]);
  let priority = triggers.reduce((sum, t) => sum + sevWeight[t.severity], 0);
  if (!newSinceReview && !cs?.flag) priority = Math.round(priority * 0.2); // reviewed and nothing new → sink
  if (!hasPlan) priority = Math.max(priority, sevWeight.high);

  // Headline: one short paragraph assembled only from observed facts + clearly marked prompts.
  const parts: string[] = [];
  if (!hasPlan) {
    parts.push('No meal plan has been shared yet. The client can sign in, but has nothing to follow until you share one.');
  } else if (summary.logged === 0) {
    parts.push(summary.due ? 'No meals logged in the last 7 days, so there is nothing to assess yet.' : 'The programme started today. There is nothing to assess yet.');
  } else {
    if (consistent.length) parts.push(`${joinList(consistent.map((s) => SLOT_LABEL[s]))} adherence is consistent.`);
    if (concernPhrases.length) {
      const where = workdayConcentrated.length ? ', mostly on workdays' : '';
      parts.push(`Recurring issues${where}: ${joinList(concernPhrases)}.`);
    }
    if (timeBarrierSlots.length) parts.push('The client reports limited time to eat or prepare food during the working day.');
    if (!concernPhrases.length && !consistent.length) parts.push('No strong pattern in the last 7 days.');
    if (considerations[0] && concernPhrases.length) parts.push(`Worth reviewing: ${considerations[0].text.charAt(0).toLowerCase()}${considerations[0].text.slice(1)}`);
  }

  const barrierMap = new Map<ReasonCode, Barrier>();
  for (const l of logs) {
    for (const r of l.reasons) {
      const b = barrierMap.get(r) ?? { reason: r, count: 0, slots: {} };
      b.count++;
      b.slots[l.slot] = (b.slots[l.slot] ?? 0) + 1;
      barrierMap.set(r, b);
    }
  }

  return {
    window,
    cells,
    summary,
    bySlot,
    observations,
    interpretations,
    considerations,
    dataQuality,
    headline: parts.join(' '),
    barriers: [...barrierMap.values()].sort((a, b) => b.count - a.count),
    comments: logs.filter((l) => l.comment).sort((a, b) => (a.date < b.date ? 1 : -1)),
    openFeedback,
    triggers,
    priority,
    newSinceReview,
    lastActivityAt,
  };
}
