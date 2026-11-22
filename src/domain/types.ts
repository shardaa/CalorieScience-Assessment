/**
 * Core data model. Two rules drive the shape of everything here:
 *
 * 1. PLANNED and ACTUAL are separate records. A `MealPlan` (versioned) says what
 *    the practitioner intended; a `MealLog` says what the client reports happened.
 *    A log snapshots the plan version + title it was logged against, so editing
 *    the plan later never rewrites history.
 * 2. "No log" is not a status. Missing data is derived (absence of a MealLog for a
 *    due meal) and is never silently counted as "skipped".
 */

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Local calendar date, YYYY-MM-DD. */
export type DateKey = string;
/** Local wall-clock time, HH:MM (24h). */
export type ClockTime = string;
/** ISO-8601 timestamp. */
export type Timestamp = string;

export interface PlannedMeal {
  slot: MealSlot;
  label: string; // "Afternoon snack"
  time: ClockTime;
  title: string; // "Protein-rich snack"
  description: string;
  examples: string[];
  prepMinutes: number;
}

export interface MealPlan {
  id: string;
  clientId: string;
  version: number;
  effectiveFrom: DateKey;
  meals: PlannedMeal[];
  createdAt: Timestamp;
  changeNote?: string;
  /** Slots changed relative to the previous version (for "Updated" badges). */
  changedSlots?: MealSlot[];
}

export interface Client {
  id: string;
  name: string;
  /** Sign-in identity for the Companion app. */
  email: string;
  age: number;
  occupation: string;
  goal: string;
  programmeStart: DateKey;
  programmeWeeks: number;
  avatarHue: number;
}

export type LogStatus = 'followed' | 'partial' | 'substituted' | 'skipped';
export const LOG_STATUSES: LogStatus[] = ['followed', 'partial', 'substituted', 'skipped'];

export type ReasonCode =
  | 'no_time'
  | 'at_work'
  | 'not_hungry'
  | 'no_food_available'
  | 'prep_effort'
  | 'social'
  | 'preference'
  | 'other';

/** 1 = very hungry … 5 = very full. Captured as how the client felt around this meal. */
export type HungerLevel = 1 | 2 | 3 | 4 | 5;
export type PrepDifficulty = 'easy' | 'manageable' | 'hard';

export interface MealLog {
  id: string;
  clientId: string;
  date: DateKey;
  slot: MealSlot;
  /** Snapshot of what was planned when this was logged. */
  planVersion: number;
  plannedTitle: string;
  status: LogStatus;
  substitute?: string;
  reasons: ReasonCode[];
  hunger?: HungerLevel;
  prepDifficulty?: PrepDifficulty;
  actualTime?: ClockTime;
  comment?: string;
  loggedAt: Timestamp;
  updatedAt: Timestamp;
}

export type MessageKind = 'feedback' | 'recommendation' | 'reply';
export type FeedbackTopic = 'timing' | 'hunger' | 'preparation' | 'taste' | 'other';
export type FeedbackStatus = 'new' | 'acknowledged' | 'resolved';

export interface Message {
  id: string;
  clientId: string;
  author: 'client' | 'practitioner';
  kind: MessageKind;
  body: string;
  slot?: MealSlot;
  topic?: FeedbackTopic;
  createdAt: Timestamp;
  /** Client-authored feedback lifecycle (practitioner side). */
  status?: FeedbackStatus;
  /** Practitioner-authored: has the client opened/acknowledged it? */
  seenByClientAt?: Timestamp;
  inReplyTo?: string;
  /** Link to the plan adjustment this message announces, if any. */
  adjustmentId?: string;
  /** Plan version this message announces when a whole plan was shared. */
  planVersion?: number;
}

export interface PractitionerNote {
  id: string;
  clientId: string;
  body: string;
  createdAt: Timestamp;
}

export type AdjustmentStatus = 'proposed' | 'applied' | 'discarded';

export interface PlanAdjustment {
  id: string;
  clientId: string;
  slot: MealSlot;
  status: AdjustmentStatus;
  /** Observation that motivated it — keeps the "why" next to the "what". */
  basedOn: string;
  change: Partial<Pick<PlannedMeal, 'time' | 'title' | 'description' | 'examples' | 'prepMinutes'>>;
  rationale: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  appliedPlanVersion?: number;
}

export interface CaseState {
  clientId: string;
  flag: { reason: string; at: Timestamp } | null;
  lastReviewedAt: Timestamp | null;
}

export type ActivityType =
  | 'client_added'
  | 'plan_published'
  | 'meal_logged'
  | 'feedback_sent'
  | 'recommendation_sent'
  | 'recommendation_seen'
  | 'note_added'
  | 'flagged'
  | 'unflagged'
  | 'reviewed'
  | 'adjustment_proposed'
  | 'adjustment_applied'
  | 'adjustment_discarded'
  | 'feedback_acknowledged'
  | 'feedback_resolved';

export interface ActivityEvent {
  id: string;
  clientId: string;
  at: Timestamp;
  actor: 'client' | 'practitioner';
  type: ActivityType;
  summary: string;
}

export interface Practitioner {
  id: string;
  name: string;
  credentials: string;
}

export interface Database {
  schemaVersion: number;
  seededFor: DateKey;
  practitioner: Practitioner;
  clients: Client[];
  plans: MealPlan[];
  logs: MealLog[];
  messages: Message[];
  notes: PractitionerNote[];
  adjustments: PlanAdjustment[];
  caseStates: CaseState[];
  activity: ActivityEvent[];
}
