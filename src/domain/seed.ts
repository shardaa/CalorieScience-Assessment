import { addDays, at, clockOf, isWorkday, lastNDays, minutesOf, toDateKey } from './time';
import type {
  ActivityEvent,
  CaseState,
  Client,
  Database,
  DateKey,
  HungerLevel,
  LogStatus,
  MealLog,
  MealPlan,
  MealSlot,
  Message,
  PlannedMeal,
  ReasonCode,
} from './types';
import { SLOTS } from './types';

/**
 * Seed data is generated RELATIVE TO TODAY so the prototype always shows
 * "the last 7 days" no matter when it is opened. Ananya's week is hand-scripted
 * to match the brief exactly; the rest of the caseload is generated from
 * behaviour profiles with a deterministic PRNG.
 */
export const SCHEMA_VERSION = 4;

/** Fictional sign-in addresses on a reserved example domain. */
export const emailFor = (name: string) => `${name.toLowerCase().trim().replace(/[^a-z]+/g, '.')}@mail.example`;
export const PRIMARY_CLIENT_ID = 'c_ananya';

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7);

const ANANYA_MEALS: PlannedMeal[] = [
  {
    slot: 'breakfast',
    label: 'Breakfast',
    time: '08:00',
    title: 'High-protein breakfast',
    description: 'Moong dal chilla with a paneer filling and mint chutney.',
    examples: ['Moong dal chilla + paneer', 'Vegetable besan omelette + 1 multigrain toast', 'Greek yoghurt, berries, seeds'],
    prepMinutes: 15,
  },
  {
    slot: 'lunch',
    label: 'Lunch',
    time: '13:00',
    title: 'Balanced home-style meal',
    description: '2 phulkas, a bowl of dal, seasonal sabzi, salad and curd. Half the plate vegetables.',
    examples: ['Phulka + dal + sabzi + curd', 'Brown rice + rajma + salad'],
    prepMinutes: 25,
  },
  {
    slot: 'snack',
    label: 'Afternoon snack',
    time: '16:30',
    title: 'Protein-rich snack',
    description: 'Roasted chana chaat with cucumber, tomato and lemon.',
    examples: ['Roasted chana chaat', 'Sprouts salad', 'Paneer tikka bites'],
    prepMinutes: 10,
  },
  {
    slot: 'dinner',
    label: 'Dinner',
    time: '20:00',
    title: 'Balanced dinner',
    description: 'Grilled fish or tofu tikka with millet pulao and stir-fried vegetables.',
    examples: ['Fish/tofu tikka + millet pulao', 'Chicken curry + 1 phulka + salad'],
    prepMinutes: 30,
  },
];

/** The starter plan every new client begins on; the practitioner adjusts it from there. */
export const GENERIC_MEALS: PlannedMeal[] = [
  { slot: 'breakfast', label: 'Breakfast', time: '08:30', title: 'Protein-forward breakfast', description: 'Vegetable poha with peanuts and a glass of buttermilk.', examples: ['Vegetable poha', 'Ragi dosa + sambar'], prepMinutes: 15 },
  { slot: 'lunch', label: 'Lunch', time: '13:30', title: 'Balanced plate', description: 'Millet roti, dal, mixed vegetable sabzi and salad.', examples: ['Millet roti + dal + sabzi'], prepMinutes: 25 },
  { slot: 'snack', label: 'Afternoon snack', time: '17:00', title: 'Light protein snack', description: 'Handful of nuts and a fruit.', examples: ['Almonds + apple', 'Buttermilk + roasted makhana'], prepMinutes: 2 },
  { slot: 'dinner', label: 'Dinner', time: '20:30', title: 'Light dinner', description: 'Grilled paneer or chicken with sautéed vegetables and quinoa.', examples: ['Paneer + quinoa + vegetables'], prepMinutes: 25 },
];

type Draft = Omit<MealLog, 'id' | 'clientId' | 'date' | 'slot' | 'planVersion' | 'plannedTitle' | 'loggedAt' | 'updatedAt'> & {
  loggedTime?: string;
};

const F = (extra: Partial<Draft> = {}): Draft => ({ status: 'followed', reasons: [], ...extra });

/** Ananya's 7-day window, keyed by workday index (0..4) or weekend index (0..1). */
const ANANYA_WORKDAYS: Record<MealSlot, (Draft | null)[]> = {
  breakfast: [
    F({ hunger: 4 }),
    F({ hunger: 4 }),
    { status: 'partial', reasons: ['no_time'], substitute: undefined, comment: 'Only had the chilla, skipped the paneer. Running late.', hunger: 3 },
    F({ hunger: 4 }),
    F({ hunger: 4 }),
  ],
  lunch: [
    { status: 'substituted', substitute: 'Office cafeteria thali', reasons: ['at_work'], hunger: 4, actualTime: '13:45' },
    { status: 'substituted', substitute: 'Ordered biryani to desk', reasons: ['at_work', 'no_time'], comment: 'Back-to-back meetings until 3.', hunger: 5, actualTime: '15:10' },
    F({ hunger: 4, prepDifficulty: 'manageable', comment: 'Packed a tiffin the night before.', actualTime: '13:15' }),
    { status: 'substituted', substitute: 'Sandwich from café', reasons: ['no_time'], hunger: 3, actualTime: '14:20' },
    { status: 'partial', reasons: ['at_work'], comment: 'Ate half at my desk.', hunger: 3, actualTime: '14:00' },
  ],
  snack: [
    { status: 'skipped', reasons: ['no_time', 'at_work'], hunger: 2 },
    { status: 'skipped', reasons: ['at_work'] },
    { status: 'skipped', reasons: ['prep_effort', 'no_time'], prepDifficulty: 'hard', comment: "Didn't have anything prepared to bring." },
    { status: 'skipped', reasons: ['no_time'], comment: "Didn't get a break between calls." },
    { status: 'substituted', substitute: 'Biscuits and chai', reasons: ['no_time', 'no_food_available'] },
  ],
  dinner: [
    F({ actualTime: '21:30', hunger: 1, comment: 'Very hungry by the time I got home.' }),
    F({ actualTime: '22:15', hunger: 1 }),
    null, // not logged — a logging gap, NOT a skipped meal
    { status: 'partial', reasons: ['no_time'], actualTime: '21:45', hunger: 2 },
    { status: 'substituted', substitute: 'Takeaway pizza with colleagues', reasons: ['social'], actualTime: '21:00', hunger: 4 },
  ],
};

const ANANYA_WEEKEND: Record<MealSlot, Draft[]> = {
  breakfast: [F({ hunger: 4, actualTime: '09:00' }), F({ hunger: 4, actualTime: '08:45' })],
  lunch: [F({ hunger: 4, actualTime: '13:30', prepDifficulty: 'easy' }), F({ hunger: 4, actualTime: '13:15' })],
  snack: [F({ hunger: 3, prepDifficulty: 'easy' }), { status: 'partial', reasons: ['not_hungry'], hunger: 4 }],
  dinner: [F({ actualTime: '20:00', hunger: 4 }), F({ actualTime: '20:30', hunger: 4 })],
};

interface Profile {
  /** weights: followed, partial, substituted, skipped, not logged */
  base: [number, number, number, number, number];
  /** optional override by slot */
  slots?: Partial<Record<MealSlot, [number, number, number, number, number]>>;
  /** shape over the 7-day window, index 0..6 → returns weights */
  shape?: (dayIdx: number, w: [number, number, number, number, number]) => [number, number, number, number, number];
}

const PROFILES: Record<string, Profile> = {
  on_track: { base: [80, 10, 5, 2, 3] },
  logging_gap: { base: [65, 15, 10, 5, 5], shape: (i, w) => (i >= 3 ? [5, 2, 2, 1, 90] : w) },
  declining: { base: [70, 15, 8, 4, 3], shape: (i, w) => (i >= 4 ? [15, 20, 25, 35, 5] : w) },
  dinner_social: { base: [75, 10, 8, 3, 4], slots: { dinner: [20, 10, 60, 5, 5] } },
  mixed: { base: [55, 20, 12, 8, 5] },
};

const REASONS_BY_STATUS: Record<Exclude<LogStatus, 'followed'>, ReasonCode[]> = {
  partial: ['not_hungry', 'no_time', 'preference'],
  substituted: ['social', 'no_food_available', 'at_work', 'preference'],
  skipped: ['no_time', 'not_hungry', 'at_work'],
};

const SUBSTITUTES: Record<MealSlot, string[]> = {
  breakfast: ['Toast and coffee', 'Cereal'],
  lunch: ['Canteen meal', 'Ordered in', 'Leftovers'],
  snack: ['Biscuits and tea', 'Samosa', 'Packaged chips'],
  dinner: ['Restaurant meal', 'Takeaway', 'Instant noodles'],
};

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function pickWeighted(rnd: () => number, w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return i;
  }
  return w.length - 1;
}

const STATUS_BY_INDEX: (LogStatus | null)[] = ['followed', 'partial', 'substituted', 'skipped', null];

function generatedDraft(rnd: () => number, profile: Profile, slot: MealSlot, dayIdx: number, planned: PlannedMeal): Draft | null {
  let w = profile.slots?.[slot] ?? profile.base;
  if (profile.shape) w = profile.shape(dayIdx, w);
  const status = STATUS_BY_INDEX[pickWeighted(rnd, w)];
  if (!status) return null;
  const drift = Math.round((rnd() - 0.3) * 50);
  const draft: Draft = { status, reasons: [], actualTime: clockOf(minutesOf(planned.time) + drift) };
  if (status !== 'followed') draft.reasons = [pick(rnd, REASONS_BY_STATUS[status])];
  if (status === 'substituted') draft.substitute = pick(rnd, SUBSTITUTES[slot]);
  if (status === 'skipped') draft.actualTime = undefined;
  if (rnd() < 0.4) draft.hunger = (2 + Math.floor(rnd() * 3)) as HungerLevel;
  return draft;
}

interface Ctx {
  logs: MealLog[];
  activity: ActivityEvent[];
  n: number;
}

function pushLog(ctx: Ctx, client: Client, plan: MealPlan, date: DateKey, slot: MealSlot, d: Draft) {
  const planned = plan.meals.find((m) => m.slot === slot)!;
  const loggedClock = d.loggedTime ?? clockOf(minutesOf(d.actualTime ?? planned.time) + 25);
  const ts = at(date, loggedClock);
  const { loggedTime: _ignored, ...rest } = d;
  void _ignored;
  ctx.logs.push({
    id: `log_${client.id}_${date}_${slot}`,
    clientId: client.id,
    date,
    slot,
    planVersion: plan.version,
    plannedTitle: planned.title,
    ...rest,
    loggedAt: ts,
    updatedAt: ts,
  });
}

export function createSeed(now: Date = new Date(), extraClients = 0): Database {
  const today = toDateKey(now);
  const yesterday = addDays(today, -1);
  const window = lastNDays(yesterday, 7);
  const ctx: Ctx = { logs: [], activity: [], n: 0 };
  const plans: MealPlan[] = [];
  const messages: Message[] = [];
  const caseStates: CaseState[] = [];

  const practitioner = { id: 'p_neha', name: 'Neha Kulkarni', credentials: 'RD, Clinical Nutritionist' };

  // ---------- Ananya (scripted) ----------
  const ananya: Client = {
    id: PRIMARY_CLIENT_ID,
    name: 'Ananya Rao',
    email: emailFor('Ananya Rao'),
    age: 34,
    occupation: 'Corporate professional',
    goal: 'Improve metabolic health and build sustainable eating habits',
    programmeStart: addDays(today, -9),
    programmeWeeks: 4,
    avatarHue: 168,
  };
  const ananyaPlan: MealPlan = {
    id: 'plan_ananya_v1',
    clientId: ananya.id,
    version: 1,
    effectiveFrom: ananya.programmeStart,
    meals: ANANYA_MEALS,
    createdAt: at(addDays(ananya.programmeStart, -1), '18:00'),
    changeNote: 'Initial plan',
  };
  plans.push(ananyaPlan);

  // Two pre-window days (programme days 1–2): settling in.
  for (const date of [ananya.programmeStart, addDays(ananya.programmeStart, 1)]) {
    for (const slot of SLOTS) {
      const planned = ANANYA_MEALS.find((m) => m.slot === slot)!;
      const d: Draft = slot === 'snack' && isWorkday(date) ? { status: 'skipped', reasons: ['no_time'] } : F({ actualTime: planned.time });
      pushLog(ctx, ananya, ananyaPlan, date, slot, d);
    }
  }
  let wi = 0;
  let we = 0;
  for (const date of window) {
    const work = isWorkday(date);
    for (const slot of SLOTS) {
      const d = work ? ANANYA_WORKDAYS[slot][wi] : ANANYA_WEEKEND[slot][we];
      if (d) pushLog(ctx, ananya, ananyaPlan, date, slot, d);
    }
    if (work) wi++;
    else we++;
  }
  // Today: breakfast already logged if the morning has passed.
  if (now.getHours() >= 9) pushLog(ctx, ananya, ananyaPlan, today, 'breakfast', F({ hunger: 4, actualTime: '08:10', loggedTime: '08:35' }));

  const lastWorkday = [...window].reverse().find(isWorkday) ?? yesterday;
  messages.push(
    {
      id: 'msg_ananya_welcome',
      clientId: ananya.id,
      author: 'practitioner',
      kind: 'recommendation',
      body: 'Welcome to your programme, Ananya! Please log what actually happens, not what you planned. Partial and skipped meals help me adjust your plan just as much as perfect days do.',
      createdAt: at(ananya.programmeStart, '07:30'),
      seenByClientAt: at(ananya.programmeStart, '08:05'),
    },
    {
      id: 'msg_ananya_snack',
      clientId: ananya.id,
      author: 'client',
      kind: 'feedback',
      topic: 'timing',
      slot: 'snack',
      body: 'I don’t have enough time to prepare or eat the planned afternoon meal when I’m at work.',
      createdAt: at(lastWorkday, '17:10'),
      status: 'new',
    },
  );
  caseStates.push({ clientId: ananya.id, flag: null, lastReviewedAt: at(addDays(ananya.programmeStart, 1), '19:00') });

  // ---------- Generated caseload ----------
  const roster: [string, number, string, string, string, number][] = [
    ['Rohan Mehta', 41, 'Software architect', 'Lower HbA1c and improve energy', 'on_track', 18],
    ['Priya Nair', 29, 'School teacher', 'Sustainable weight management', 'logging_gap', 12],
    ['Karan Singh', 52, 'Bank manager', 'Manage blood pressure and cholesterol', 'declining', 16],
    ['Meera Iyer', 38, 'Architect', 'PCOS-friendly eating pattern', 'on_track', 22],
    ['Sameer Khan', 45, 'Regional sales lead', 'Reduce visceral fat', 'dinner_social', 10],
    ['Arjun Pillai', 27, 'Data analyst', 'Gain lean mass', 'mixed', 20],
  ];
  const firstNames = ['Aisha', 'Vikram', 'Sneha', 'Rahul', 'Kavya', 'Nikhil', 'Pooja', 'Aditya', 'Ishita', 'Manav', 'Riya', 'Siddharth', 'Tanvi', 'Yash', 'Zoya', 'Dev'];
  const lastNames = ['Bose', 'Chopra', 'Das', 'Gupta', 'Joshi', 'Kapoor', 'Malhotra', 'Patel', 'Reddy', 'Shah', 'Verma', 'Bhat'];
  const profileKeys = Object.keys(PROFILES);
  for (let i = 0; i < extraClients; i++) {
    const rnd = mulberry32(9000 + i);
    roster.push([
      `${pick(rnd, firstNames)} ${pick(rnd, lastNames)}`,
      24 + Math.floor(rnd() * 35),
      pick(rnd, ['Consultant', 'Engineer', 'Designer', 'Doctor', 'Entrepreneur', 'Lawyer']),
      pick(rnd, ['Improve metabolic health', 'Weight management', 'Better energy levels', 'Blood sugar control']),
      profileKeys[i % profileKeys.length],
      7 + Math.floor(rnd() * 20),
    ]);
  }

  const rosterClients: Client[] = [];
  roster.forEach(([name, age, occupation, goal, profileKey, daysIn], idx) => {
    const id = `c_${name.toLowerCase().replace(/\W+/g, '_')}_${idx}`;
    const rnd = mulberry32(hash(id));
    const client: Client = {
      id,
      name,
      email: emailFor(name),
      age,
      occupation,
      goal,
      programmeStart: addDays(today, -daysIn),
      programmeWeeks: 4 + (idx % 3) * 2,
      avatarHue: Math.floor(rnd() * 360),
    };
    const plan: MealPlan = {
      id: `plan_${id}_v1`,
      clientId: id,
      version: 1,
      effectiveFrom: client.programmeStart,
      meals: GENERIC_MEALS,
      createdAt: at(addDays(client.programmeStart, -1), '18:00'),
      changeNote: 'Initial plan',
    };
    rosterClients.push(client);
    plans.push(plan);
    const profile = PROFILES[profileKey];
    const days = lastNDays(yesterday, Math.min(daysIn, 14));
    days.forEach((date) => {
      const dayIdx = window.indexOf(date);
      for (const slot of SLOTS) {
        const planned = GENERIC_MEALS.find((m) => m.slot === slot)!;
        const d = generatedDraft(rnd, profile, slot, dayIdx < 0 ? 0 : dayIdx, planned);
        if (d) pushLog(ctx, client, plan, date, slot, d);
      }
    });
    const reviewedDaysAgo = profileKey === 'on_track' ? 0 : 4 + Math.floor(rnd() * 3);
    caseStates.push({
      clientId: id,
      flag: name === 'Meera Iyer' ? { reason: 'Discuss new lab results', at: at(addDays(today, -2), '11:00') } : null,
      lastReviewedAt: at(addDays(today, -reviewedDaysAgo), reviewedDaysAgo === 0 ? '00:05' : '18:30'),
    });
    if (profileKey === 'dinner_social') {
      messages.push({
        id: `msg_${id}_1`,
        clientId: id,
        author: 'client',
        kind: 'feedback',
        topic: 'other',
        slot: 'dinner',
        body: 'Lots of client dinners this month. Not sure what to order at restaurants.',
        createdAt: at(addDays(today, -2), '22:40'),
        status: 'new',
      });
    }
  });

  // New client who starts today → exercises empty states on both sides.
  const divya: Client = {
    id: 'c_divya',
    name: 'Divya Menon',
    email: emailFor('Divya Menon'),
    age: 31,
    occupation: 'Product designer',
    goal: 'Build a regular eating routine',
    programmeStart: today,
    programmeWeeks: 4,
    avatarHue: 280,
  };
  plans.push({ id: 'plan_divya_v1', clientId: divya.id, version: 1, effectiveFrom: today, meals: GENERIC_MEALS, createdAt: at(yesterday, '18:00'), changeNote: 'Initial plan' });
  caseStates.push({ clientId: divya.id, flag: null, lastReviewedAt: null });

  return {
    schemaVersion: SCHEMA_VERSION,
    seededFor: today,
    practitioner,
    clients: [ananya, ...rosterClients, divya],
    plans,
    logs: ctx.logs,
    messages,
    notes: [],
    adjustments: [],
    caseStates,
    activity: [],
  };
}
