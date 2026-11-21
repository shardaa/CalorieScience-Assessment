import type { FeedbackTopic, HungerLevel, LogStatus, MealSlot, PrepDifficulty, ReasonCode } from './types';

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Afternoon snack',
  dinner: 'Dinner',
};

/** Practitioner-facing wording: precise. */
export const STATUS_LABEL: Record<LogStatus | 'not_logged' | 'upcoming', string> = {
  followed: 'Followed',
  partial: 'Partially followed',
  substituted: 'Substituted',
  skipped: 'Skipped',
  not_logged: 'Not logged',
  upcoming: 'Upcoming',
};

/** Client-facing wording: neutral, first person, no judgement. */
export const CLIENT_STATUS_LABEL: Record<LogStatus, string> = {
  followed: 'Had it as planned',
  partial: 'Had some of it',
  substituted: 'Had something else',
  skipped: "Didn't eat",
};

export const REASON_LABEL: Record<ReasonCode, string> = {
  no_time: 'No time',
  at_work: 'At work / meetings',
  not_hungry: "Wasn't hungry",
  no_food_available: 'Food not available',
  prep_effort: 'Too much prep',
  social: 'Social / eating out',
  preference: "Didn't feel like it",
  other: 'Other',
};

export const HUNGER_LABEL: Record<HungerLevel, string> = {
  1: 'Very hungry',
  2: 'Hungry',
  3: 'Comfortable',
  4: 'Satisfied',
  5: 'Too full',
};

export const PREP_LABEL: Record<PrepDifficulty, string> = {
  easy: 'Easy',
  manageable: 'Manageable',
  hard: 'Hard',
};

export const TOPIC_LABEL: Record<FeedbackTopic, string> = {
  timing: 'Meal timing',
  hunger: 'Hunger / fullness',
  preparation: 'Preparation',
  taste: 'Taste / variety',
  other: 'Something else',
};
