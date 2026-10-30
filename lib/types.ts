export const STAGES = [
  { id: "new", label: "New" },
  { id: "reached_out", label: "Reached out" },
  { id: "talking", label: "In talks" },
  { id: "won", label: "Won" },
  { id: "parked", label: "Parked" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];

export const ACTIVITY_KINDS = ["note", "call", "email", "meeting"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  link: string;
  stage: Stage;
  /** YYYY-MM-DD */
  followUp: string | null;
  /** ISO timestamp of the latest logged activity */
  lastTouch: string | null;
  createdAt: string;
  groupIds: string[];
};

export type Group = { id: string; name: string; hue: number };

export type Activity = { id: string; kind: ActivityKind; body: string; at: string };
