import { analyse } from './insights';
import { buildCells, summarize } from './adherence';
import { applyAdjustment, logMeal, markReviewed, proposeAdjustment, ValidationError } from './commands';
import { createSeed, PRIMARY_CLIENT_ID } from './seed';
import { addDays, lastNDays, toDateKey } from './time';

// Fixed "now": a Saturday afternoon, so the window contains 5 workdays + 2 weekend days.
const NOW = new Date(2026, 10, 21, 15, 0);
const ID = PRIMARY_CLIENT_ID;

describe('adherence summary', () => {
  it('separates missing logs from skipped meals', () => {
    const db = createSeed(NOW);
    const window = lastNDays(addDays(toDateKey(NOW), -1), 7);
    const s = summarize(buildCells(db, ID, window, NOW));
    expect(s.due).toBe(28);
    expect(s.logged).toBe(27);
    expect(s.notLogged).toBe(1);
    // The unlogged dinner must not appear as a skip.
    expect(s.counts.skipped).toBe(4);
    expect(s.completeness).toBeCloseTo(27 / 28);
  });

  it('returns null alignment when nothing is logged instead of 0%', () => {
    const db = createSeed(NOW);
    db.logs = [];
    const s = summarize(buildCells(db, ID, [addDays(toDateKey(NOW), -1)], NOW));
    expect(s.alignment).toBeNull();
    expect(s.completeness).toBe(0);
  });

  it('does not count today’s future meals as due', () => {
    const db = createSeed(NOW);
    const cells = buildCells(db, ID, [toDateKey(NOW)], NOW);
    expect(cells.find((c) => c.slot === 'dinner')!.state).toBe('upcoming');
    expect(cells.find((c) => c.slot === 'breakfast')!.state).toBe('followed');
  });
});

describe('insights for Ananya', () => {
  const a = analyse(createSeed(NOW), ID, NOW);
  const ids = a.observations.map((o) => o.id);

  it('finds the scenario patterns from the brief', () => {
    expect(ids).toContain('breakfast-consistent');
    expect(ids).toContain('lunch-substituted');
    expect(ids).toContain('snack-skipped');
    expect(ids).toContain('dinner-timing');
    expect(ids).toContain('hunger');
    expect(a.interpretations.map((i) => i.id)).toContain('workday-i');
  });

  it('raises attention triggers', () => {
    const codes = a.triggers.map((t) => t.code);
    expect(codes).toContain('new_feedback');
    expect(codes).toContain('recurring_skip');
    expect(codes).not.toContain('logging_gap');
  });

  it('reports the logging gap as a data-quality note', () => {
    expect(a.dataQuality[0]).toMatch(/not counted as skipped/);
  });
});

describe('commands', () => {
  it('requires a substitute description', () => {
    const db = createSeed(NOW);
    expect(() => logMeal(db, { clientId: ID, date: toDateKey(NOW), slot: 'lunch', status: 'substituted' }, NOW)).toThrow(ValidationError);
  });

  it('applying an adjustment versions the plan without rewriting past logs', () => {
    const db = createSeed(NOW);
    proposeAdjustment(db, { clientId: ID, slot: 'snack', basedOn: 'x', change: { title: 'Portable protein snack' }, rationale: 'Workday time' }, NOW);
    applyAdjustment(db, db.adjustments[0].id, 'Try this', NOW);
    const todayCells = buildCells(db, ID, [toDateKey(NOW)], NOW);
    expect(todayCells.find((c) => c.slot === 'snack')!.planned.title).toBe('Portable protein snack');
    const yesterday = db.logs.find((l) => l.slot === 'snack' && l.date === addDays(toDateKey(NOW), -1));
    expect(yesterday?.plannedTitle ?? 'Protein-rich snack').toBe('Protein-rich snack');
    expect(db.messages.at(-1)!.adjustmentId).toBe(db.adjustments[0].id);
  });

  it('marking reviewed sinks priority until new data arrives', () => {
    const db = createSeed(NOW);
    const before = analyse(db, ID, NOW).priority;
    markReviewed(db, ID, NOW);
    const after = analyse(db, ID, NOW);
    expect(after.priority).toBeLessThan(before);
    expect(after.newSinceReview).toBe(false);
    const later = new Date(NOW.getTime() + 60_000);
    logMeal(db, { clientId: ID, date: toDateKey(NOW), slot: 'lunch', status: 'followed' }, later);
    expect(analyse(db, ID, later).newSinceReview).toBe(true);
  });
});
