import { analyse } from './insights';
import { buildCells, summarize } from './adherence';
import { addClient, publishPlan, applyAdjustment, logMeal, markReviewed, proposeAdjustment, ValidationError } from './commands';
import { createSeed, GENERIC_MEALS, PRIMARY_CLIENT_ID } from './seed';
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

describe('adding a client and sharing their plan', () => {
  const input = { id: 'c_new', name: '  Asha   Verma ', email: ' Asha.Verma@Mail.Example ', age: 31, occupation: 'Nurse', goal: 'More energy on night shifts', programmeWeeks: 6 };

  it('adds the client with no plan and flags it for the practitioner', () => {
    const db = addClient(createSeed(NOW), input, NOW);
    const c = db.clients.find((x) => x.id === 'c_new')!;
    expect(c.name).toBe('Asha Verma');
    expect(c.email).toBe('asha.verma@mail.example');
    expect(c.programmeStart).toBe(toDateKey(NOW));
    expect(db.plans.filter((p) => p.clientId === 'c_new')).toHaveLength(0);
    const a = analyse(db, 'c_new', NOW);
    expect(a.summary.due).toBe(0);
    expect(a.triggers.map((t) => t.code)).toEqual(['no_plan']);
    expect(a.priority).toBeGreaterThanOrEqual(20);
  });

  it('rejects missing fields and duplicates', () => {
    const db = createSeed(NOW);
    expect(() => addClient(db, { ...input, name: 'A' }, NOW)).toThrow(ValidationError);
    expect(() => addClient(db, { ...input, email: 'not-an-email' }, NOW)).toThrow(/valid email/);
    expect(() => addClient(db, { ...input, age: 7 }, NOW)).toThrow(ValidationError);
    expect(() => addClient(db, { ...input, goal: ' ' }, NOW)).toThrow(ValidationError);
    expect(() => addClient(db, { ...input, name: 'ananya rao' }, NOW)).toThrow(/already in your caseload/);
    expect(() => addClient(db, { ...input, email: 'ananya.rao@mail.example' }, NOW)).toThrow(/already belongs to Ananya Rao/);
  });

  it('shares v1, then a new version that only marks the meals that changed', () => {
    let db = addClient(createSeed(NOW), input, NOW);
    db = publishPlan(db, { clientId: 'c_new', meals: GENERIC_MEALS }, NOW);
    let plans = db.plans.filter((p) => p.clientId === 'c_new');
    expect(plans.map((p) => p.version)).toEqual([1]);
    expect(analyse(db, 'c_new', NOW).triggers.map((t) => t.code)).not.toContain('no_plan');
    expect(db.messages.at(-1)!.planVersion).toBe(1);

    const edited = GENERIC_MEALS.map((m) => (m.slot === 'snack' ? { ...m, title: 'Roasted chana pouch', prepMinutes: 0 } : m));
    db = publishPlan(db, { clientId: 'c_new', meals: edited }, NOW);
    plans = db.plans.filter((p) => p.clientId === 'c_new').sort((x, y) => x.version - y.version);
    expect(plans[1].version).toBe(2);
    expect(plans[1].changedSlots).toEqual(['snack']);
    expect(() => publishPlan(db, { clientId: 'c_new', meals: edited }, NOW)).toThrow(/Nothing has changed/);
  });

  it('refuses a plan with a missing name or out-of-order times', () => {
    const db = addClient(createSeed(NOW), input, NOW);
    const noName = GENERIC_MEALS.map((m) => (m.slot === 'lunch' ? { ...m, title: ' ' } : m));
    expect(() => publishPlan(db, { clientId: 'c_new', meals: noName }, NOW)).toThrow(/lunch a name/);
    const badOrder = GENERIC_MEALS.map((m) => (m.slot === 'dinner' ? { ...m, time: '07:00' } : m));
    expect(() => publishPlan(db, { clientId: 'c_new', meals: badOrder }, NOW)).toThrow(/in order/);
  });
});
