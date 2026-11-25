export const SOF_NUMBER_FORMAT_MESSAGE =
  'Enter SOF followed by exactly five digits (for example, SOF12345).';

export const normalizeSofNumber = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/gu, '');

export const isValidSofNumber = (value: string) =>
  /^SOF[0-9]{5}$/u.test(normalizeSofNumber(value));
