import { planForDate } from './adherence';
import { SLOT_LABEL, STATUS_LABEL } from './labels';
import { toDateKey } from './time';
import type {
  ActivityEvent,
  CaseState,
  Database,
  DateKey,
  FeedbackStatus,
  FeedbackTopic,
  MealLog,
  MealSlot,
  Message,
  PlanAdjustment,
  PlannedMeal,
} from './types';
import { SLOTS } from './types';

/**
 * Commands are pure (db, input, now) → db transitions. The mock API runs them;
 * in production each would be a server endpoint with the same validation.
 * Every command appends an ActivityEvent so both sides have an audit trail.
 */

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class ValidationError extends Error {}

function event(db: Database, e: Omit<ActivityEvent, 'id'>) {
  db.activity.unshift({ id: newId('evt'), ...e });
}

function caseState(db: Database, clientId: string): CaseState {
  let cs = db.caseStates.find((c) => c.clientId === clientId);
  if (!cs) {
    cs = { clientId, flag: null, lastReviewedAt: null };
    db.caseStates.push(cs);
  }
  return cs;
}

export type LogInput = Pick<MealLog, 'clientId' | 'date' | 'slot' | 'status'> &
  Partial<Pick<MealLog, 'substitute' | 'reasons' | 'hunger' | 'prepDifficulty' | 'actualTime' | 'comment'>>;

export function logMeal(db: Database, input: LogInput, now: Date): Database {
  const today = toDateKey(now);
  if (input.date > today) throw new ValidationError("You can't log a meal for a future day.");
  const plan = planForDate(db, input.clientId, input.date);
  const planned = plan?.meals.find((m) => m.slot === input.slot);
  if (!plan || !planned) throw new ValidationError('No planned meal found for that day.');
  if (input.status === 'substituted' && !input.substitute?.trim()) {
    throw new ValidationError('Tell us roughly what you had instead. Even a word or two helps.');
  }
  const ts = now.toISOString();
  const clean: MealLog = {
    id: newId('log'),
    clientId: input.clientId,
    date: input.date,
    slot: input.slot,
    planVersion: plan.version,
    plannedTitle: planned.title,
    status: input.status,
    substitute: input.status === 'substituted' ? input.substitute?.trim() : undefined,
    reasons: input.status === 'followed' ? [] : input.reasons ?? [],
    hunger: input.hunger,
    prepDifficulty: input.prepDifficulty,
    actualTime: input.status === 'skipped' ? undefined : input.actualTime,
    comment: input.comment?.trim() || undefined,
    loggedAt: ts,
    updatedAt: ts,
  };
  const existing = db.logs.findIndex((l) => l.clientId === input.clientId && l.date === input.date && l.slot === input.slot);
  if (existing >= 0) {
    // Edits keep the original id/loggedAt (and plan snapshot) so history stays traceable.
    const prev = db.logs[existing];
    db.logs[existing] = { ...clean, id: prev.id, loggedAt: prev.loggedAt, planVersion: prev.planVersion, plannedTitle: prev.plannedTitle };
  } else {
    db.logs.push(clean);
  }
  event(db, {
    clientId: input.clientId,
    at: ts,
    actor: 'client',
    type: 'meal_logged',
    summary: `${existing >= 0 ? 'Updated' : 'Logged'} ${SLOT_LABEL[input.slot].toLowerCase()}: ${STATUS_LABEL[input.status].toLowerCase()}${clean.substitute ? ` (${clean.substitute})` : ''}`,
  });
  return db;
}

export function sendFeedback(
  db: Database,
  input: { clientId: string; body: string; slot?: MealSlot; topic?: FeedbackTopic },
  now: Date,
): Database {
  const body = input.body.trim();
  if (body.length < 3) throw new ValidationError('Add a few words so your practitioner knows what is happening.');
  const ts = now.toISOString();
  db.messages.push({ id: newId('msg'), clientId: input.clientId, author: 'client', kind: 'feedback', body, slot: input.slot, topic: input.topic, createdAt: ts, status: 'new' });
  event(db, { clientId: input.clientId, at: ts, actor: 'client', type: 'feedback_sent', summary: `Sent feedback${input.slot ? ` about ${SLOT_LABEL[input.slot].toLowerCase()}` : ''}` });
  return db;
}

export function markRecommendationSeen(db: Database, messageId: string, now: Date): Database {
  const m = db.messages.find((x) => x.id === messageId);
  if (!m || m.author !== 'practitioner' || m.seenByClientAt) return db;
  m.seenByClientAt = now.toISOString();
  event(db, { clientId: m.clientId, at: m.seenByClientAt, actor: 'client', type: 'recommendation_seen', summary: 'Read your message' });
  return db;
}

export function sendRecommendation(
  db: Database,
  input: { clientId: string; body: string; slot?: MealSlot; inReplyTo?: string; adjustmentId?: string },
  now: Date,
): Database {
  const body = input.body.trim();
  if (body.length < 3) throw new ValidationError('Message is empty.');
  const ts = now.toISOString();
  const msg: Message = {
    id: newId('msg'),
    clientId: input.clientId,
    author: 'practitioner',
    kind: input.inReplyTo ? 'reply' : 'recommendation',
    body,
    slot: input.slot,
    createdAt: ts,
    inReplyTo: input.inReplyTo,
    adjustmentId: input.adjustmentId,
  };
  db.messages.push(msg);
  if (input.inReplyTo) {
    const parent = db.messages.find((m) => m.id === input.inReplyTo);
    if (parent && parent.status === 'new') parent.status = 'acknowledged';
  }
  event(db, { clientId: input.clientId, at: ts, actor: 'practitioner', type: 'recommendation_sent', summary: `Sent ${input.inReplyTo ? 'a reply' : 'a recommendation'}${input.slot ? ` for ${SLOT_LABEL[input.slot].toLowerCase()}` : ''}` });
  return db;
}

export function setFeedbackStatus(db: Database, messageId: string, status: FeedbackStatus, now: Date): Database {
  const m = db.messages.find((x) => x.id === messageId);
  if (!m || m.author !== 'client') throw new ValidationError('Feedback not found.');
  m.status = status;
  event(db, {
    clientId: m.clientId,
    at: now.toISOString(),
    actor: 'practitioner',
    type: status === 'resolved' ? 'feedback_resolved' : 'feedback_acknowledged',
    summary: `Marked feedback as ${status}`,
  });
  return db;
}

export function addNote(db: Database, input: { clientId: string; body: string }, now: Date): Database {
  const body = input.body.trim();
  if (!body) throw new ValidationError('Note is empty.');
  const ts = now.toISOString();
  db.notes.unshift({ id: newId('note'), clientId: input.clientId, body, createdAt: ts });
  event(db, { clientId: input.clientId, at: ts, actor: 'practitioner', type: 'note_added', summary: 'Added a private note' });
  return db;
}

export function setFlag(db: Database, clientId: string, reason: string | null, now: Date): Database {
  const cs = caseState(db, clientId);
  const ts = now.toISOString();
  cs.flag = reason ? { reason: reason.trim() || 'Follow up', at: ts } : null;
  event(db, { clientId, at: ts, actor: 'practitioner', type: reason ? 'flagged' : 'unflagged', summary: reason ? `Flagged for follow-up: ${cs.flag!.reason}` : 'Cleared follow-up flag' });
  return db;
}

export function markReviewed(db: Database, clientId: string, now: Date): Database {
  const cs = caseState(db, clientId);
  cs.lastReviewedAt = now.toISOString();
  // Reviewing implies the practitioner has seen any new feedback.
  db.messages.filter((m) => m.clientId === clientId && m.status === 'new').forEach((m) => (m.status = 'acknowledged'));
  event(db, { clientId, at: cs.lastReviewedAt, actor: 'practitioner', type: 'reviewed', summary: 'Marked week as reviewed' });
  return db;
}

export function proposeAdjustment(
  db: Database,
  input: Pick<PlanAdjustment, 'clientId' | 'slot' | 'basedOn' | 'change' | 'rationale'>,
  now: Date,
): Database {
  const changeKeys = Object.entries(input.change).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length));
  if (!changeKeys.length) throw new ValidationError('Describe at least one change (time, meal or description).');
  if (!input.rationale.trim()) throw new ValidationError('Add a short rationale. It will be kept with the plan history.');
  const ts = now.toISOString();
  db.adjustments.unshift({ id: newId('adj'), status: 'proposed', createdAt: ts, ...input, change: Object.fromEntries(changeKeys) });
  event(db, { clientId: input.clientId, at: ts, actor: 'practitioner', type: 'adjustment_proposed', summary: `Proposed a change to ${SLOT_LABEL[input.slot].toLowerCase()}` });
  return db;
}

/**
 * Applying an adjustment creates a NEW plan version effective today. Past logs
 * keep their plan-version snapshot, so adherence history is never rewritten.
 * Meals already logged today keep the version they were logged against.
 */
export function applyAdjustment(db: Database, adjustmentId: string, message: string | null, now: Date): Database {
  const adj = db.adjustments.find((a) => a.id === adjustmentId);
  if (!adj || adj.status !== 'proposed') throw new ValidationError('This adjustment is no longer pending.');
  const today: DateKey = toDateKey(now);
  const current = planForDate(db, adj.clientId, today);
  if (!current) throw new ValidationError('Client has no active plan.');
  const version = Math.max(...db.plans.filter((p) => p.clientId === adj.clientId).map((p) => p.version)) + 1;
  const ts = now.toISOString();
  // Several versions may start on the same day; planForDate always picks the highest version.
  db.plans.push({
    id: newId('plan'),
    clientId: adj.clientId,
    version,
    effectiveFrom: today,
    createdAt: ts,
    changeNote: adj.rationale,
    changedSlots: [adj.slot],
    meals: current.meals.map((m) => (m.slot === adj.slot ? { ...m, ...adj.change } : m)),
  });
  adj.status = 'applied';
  adj.resolvedAt = ts;
  adj.appliedPlanVersion = version;
  event(db, { clientId: adj.clientId, at: ts, actor: 'practitioner', type: 'adjustment_applied', summary: `Updated ${SLOT_LABEL[adj.slot].toLowerCase()} in plan (v${version})` });
  if (message?.trim()) sendRecommendation(db, { clientId: adj.clientId, body: message, slot: adj.slot, adjustmentId: adj.id }, now);
  return db;
}

export function discardAdjustment(db: Database, adjustmentId: string, now: Date): Database {
  const adj = db.adjustments.find((a) => a.id === adjustmentId);
  if (!adj || adj.status !== 'proposed') throw new ValidationError('This adjustment is no longer pending.');
  adj.status = 'discarded';
  adj.resolvedAt = now.toISOString();
  event(db, { clientId: adj.clientId, at: adj.resolvedAt, actor: 'practitioner', type: 'adjustment_discarded', summary: `Discarded proposed change to ${SLOT_LABEL[adj.slot].toLowerCase()}` });
  return db;
}

export interface NewClientInput {
  id?: string;
  name: string;
  email: string;
  age: number;
  occupation: string;
  goal: string;
  programmeWeeks: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds a client with no plan yet. They can sign in with their email straight away
 * and will see "your plan isn't ready" until the practitioner shares one.
 */
export function addClient(db: Database, input: NewClientInput, now: Date): Database {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = input.email.trim().toLowerCase();
  const goal = input.goal.trim();
  if (name.length < 2) throw new ValidationError("Enter the client's full name.");
  if (name.length > 60) throw new ValidationError('Keep the name under 60 characters.');
  if (!EMAIL_RE.test(email)) throw new ValidationError('Enter a valid email address. The client signs in with it.');
  if (!Number.isInteger(input.age) || input.age < 12 || input.age > 100) throw new ValidationError('Enter an age between 12 and 100.');
  if (!goal) throw new ValidationError('Add a goal for the programme. A short phrase is enough.');
  if (![4, 6, 8, 12].includes(input.programmeWeeks)) throw new ValidationError('Choose a programme length.');
  const existing = db.clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) throw new ValidationError(`${existing.name} is already in your caseload.`);
  const sameEmail = db.clients.find((c) => c.email === email);
  if (sameEmail) throw new ValidationError(`That email already belongs to ${sameEmail.name}.`);

  const id = input.id ?? newId('c');
  const today = toDateKey(now);
  const avatarHue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  db.clients.push({ id, name, email, age: input.age, occupation: input.occupation.trim() || 'Not specified', goal, programmeStart: today, programmeWeeks: input.programmeWeeks, avatarHue });
  caseState(db, id);
  event(db, { clientId: id, at: now.toISOString(), actor: 'practitioner', type: 'client_added', summary: `Added ${name} (${email}) · ${input.programmeWeeks}-week programme` });
  return db;
}

export interface PublishPlanInput {
  clientId: string;
  meals: PlannedMeal[];
  /** Optional note sent to the client with the plan. */
  message?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Shares a whole plan: the first plan (v1) or a new version effective today.
 * Past logs keep the version they were logged against.
 */
export function publishPlan(db: Database, input: PublishPlanInput, now: Date): Database {
  const client = db.clients.find((c) => c.id === input.clientId);
  if (!client) throw new ValidationError('Client not found.');
  const meals: PlannedMeal[] = [];
  for (const slot of SLOTS) {
    const m = input.meals.find((x) => x.slot === slot);
    const label = SLOT_LABEL[slot];
    if (!m || !m.title.trim()) throw new ValidationError(`Give ${label.toLowerCase()} a name.`);
    if (!TIME_RE.test(m.time)) throw new ValidationError(`Set a time for ${label.toLowerCase()}.`);
    if (!Number.isFinite(m.prepMinutes) || m.prepMinutes < 0 || m.prepMinutes > 240) throw new ValidationError(`Prep time for ${label.toLowerCase()} should be 0–240 minutes.`);
    meals.push({
      slot,
      label,
      time: m.time,
      title: m.title.trim(),
      description: m.description.trim(),
      examples: m.examples.map((e) => e.trim()).filter(Boolean),
      prepMinutes: Math.round(m.prepMinutes),
    });
  }
  const times = meals.map((m) => m.time);
  for (let i = 1; i < times.length; i++) if (times[i] <= times[i - 1]) throw new ValidationError('Meal times should run in order through the day.');

  const today = toDateKey(now);
  const previous = db.plans.filter((p) => p.clientId === client.id).sort((a, b) => b.version - a.version)[0];
  const version = previous ? previous.version + 1 : 1;
  const changedSlots = previous
    ? meals.filter((m) => JSON.stringify(m) !== JSON.stringify(previous.meals.find((p) => p.slot === m.slot))).map((m) => m.slot)
    : undefined;
  if (previous && changedSlots!.length === 0) throw new ValidationError('Nothing has changed from the current plan.');

  db.plans.push({ id: newId('plan'), clientId: client.id, version, effectiveFrom: today, meals, createdAt: now.toISOString(), changeNote: previous ? 'Plan edited' : 'First plan', changedSlots });
  const first = client.name.split(' ')[0];
  const body =
    input.message?.trim() ||
    (previous ? `Hi ${first}, I've updated your meal plan. Have a look at the changes in the Plan tab.` : `Hi ${first}, your meal plan is ready. Open the Plan tab to see your meals and the options for each.`);
  db.messages.push({ id: newId('msg'), clientId: client.id, author: 'practitioner', kind: 'recommendation', body, createdAt: now.toISOString(), planVersion: version });
  event(db, {
    clientId: client.id,
    at: now.toISOString(),
    actor: 'practitioner',
    type: 'plan_published',
    summary: previous ? `Shared plan v${version} (${changedSlots!.map((s) => SLOT_LABEL[s]).join(', ')} changed)` : 'Shared the first meal plan',
  });
  return db;
}
