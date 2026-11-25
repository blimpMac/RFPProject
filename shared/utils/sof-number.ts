export const SOF_NUMBER_FORMAT_MESSAGE =
  'Enter SOF followed by digits. The number of digits may vary (for example, SOF12, SOF123, or SOF12345678901234567).';

export const normalizeSofNumber = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/gu, '');

export const isValidSofNumber = (value: string) =>
  /^SOF[0-9]+$/u.test(normalizeSofNumber(value));
