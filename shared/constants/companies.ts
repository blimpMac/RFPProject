export const companies = [
  'Greenlight Power Inc.',
  'Greenmetal Electric Manufacturing Corp.',
] as const;

export type Company = (typeof companies)[number];
