import { clockNow, isWorkday, minutesOf, toDateKey } from './time';
import type { Database, DateKey, LogStatus, MealLog, MealPlan, MealSlot, PlannedMeal } from './types';
import { SLOTS } from './types';

/**
 * ADHERENCE MODEL
 *
 * We report two numbers and never blend them:
 *
 *  - Logging completeness = logged meals / due meals.
 *    "How much do we actually know?"
 *
 *  - Plan alignment = weighted score / logged meals.
 *    "Of what we know, how closely did it match the plan?"
 *    Weights: followed 1, partial 0.5, substituted 0.5, skipped 0.
 *    A substitution gets half credit because we don't know its nutritional
 *    equivalence — the practitioner always sees the raw breakdown alongside.
 *
 * Missing logs are excluded from alignment (they are unknown, not failures).
 * A meal is only "due" once its planned time + grace period has passed, so the
 * client is never shown as behind for a meal they haven't reached yet.
 */
export const STATUS_WEIGHT: Record<LogStatus, number> = {
  followed: 1,
  partial: 0.5,
  substituted: 0.5,
  skipped: 0,
};

export const DUE_GRACE_MINUTES = 90;

export type CellState = LogStatus | 'not_logged' | 'upcoming';

export interface Cell {
  date: DateKey;
  slot: MealSlot;
  planned: PlannedMeal;
  planVersion: number;
  log?: MealLog;
  due: boolean;
  state: CellState;
  workday: boolean;
}

export function planForDate(db: Database, clientId: string, date: DateKey): MealPlan | undefined {
  return db.plans
    .filter((p) => p.clientId === clientId && p.effectiveFrom <= date)
    .sort((a, b) => b.version - a.version)[0];
}

export function currentPlan(db: Database, clientId: string, now: Date): MealPlan | undefined {
  return planForDate(db, clientId, toDateKey(now));
}

export function findLog(db: Database, clientId: string, date: DateKey, slot: MealSlot): MealLog | undefined {
  return db.logs.find((l) => l.clientId === clientId && l.date === date && l.slot === slot);
}

export function isDue(date: DateKey, planned: PlannedMeal, now: Date): boolean {
  const today = toDateKey(now);
  if (date < today) return true;
  if (date > today) return false;
  return minutesOf(clockNow(now)) >= minutesOf(planned.time) + DUE_GRACE_MINUTES;
}

export function buildCells(db: Database, clientId: string, dates: DateKey[], now: Date): Cell[] {
  const cells: Cell[] = [];
  for (const date of dates) {
    const plan = planForDate(db, clientId, date);
    if (!plan) continue; // before programme start
    for (const slot of SLOTS) {
      const planned = plan.meals.find((m) => m.slot === slot);
      if (!planned) continue;
      const log = findLog(db, clientId, date, slot);
      const due = isDue(date, planned, now);
      const state: CellState = log ? log.status : due ? 'not_logged' : 'upcoming';
      cells.push({ date, slot, planned, planVersion: plan.version, log, due, state, workday: isWorkday(date) });
    }
  }
  return cells;
}

export interface Summary {
  /** Meals whose time has passed (+grace) or which were logged early. */
  due: number;
  logged: number;
  notLogged: number;
  counts: Record<LogStatus, number>;
  /** 0..1, or null when nothing is logged (we refuse to invent a number). */
  alignment: number | null;
  /** 0..1, or null when nothing is due. */
  completeness: number | null;
}

export function summarize(cells: Cell[]): Summary {
  const counts: Record<LogStatus, number> = { followed: 0, partial: 0, substituted: 0, skipped: 0 };
  let due = 0;
  let logged = 0;
  let score = 0;
  for (const c of cells) {
    // A meal logged ahead of its time still counts as known.
    if (c.due || c.log) due++;
    if (c.log) {
      logged++;
      counts[c.log.status]++;
      score += STATUS_WEIGHT[c.log.status];
    }
  }
  return {
    due,
    logged,
    notLogged: due - logged,
    counts,
    alignment: logged ? score / logged : null,
    completeness: due ? logged / due : null,
  };
}

export function summarizeBySlot(cells: Cell[]): Record<MealSlot, Summary> {
  return Object.fromEntries(SLOTS.map((s) => [s, summarize(cells.filter((c) => c.slot === s))])) as Record<
    MealSlot,
    Summary
  >;
}

export const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
