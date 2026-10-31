export type List = "clients" | "team";

export type Person = {
  id: string;
  name: string;
  about: string;
  notes: string;
  list: List;
  archived: boolean;
  createdAt: string;
};
