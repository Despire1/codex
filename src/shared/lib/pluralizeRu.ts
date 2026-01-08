type PluralForms = {
  one: string;
  few: string;
  many: string;
};

export const getPluralForm = (count: number, forms: PluralForms) => {
  const normalized = Math.abs(count);
  const mod100 = normalized % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return forms.many;
  }

  const mod10 = normalized % 10;
  if (mod10 === 1) {
    return forms.one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return forms.few;
  }
  return forms.many;
};

export const pluralizeRu = (count: number, forms: PluralForms) =>
  `${count} ${getPluralForm(count, forms)}`;
