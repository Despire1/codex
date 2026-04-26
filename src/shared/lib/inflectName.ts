export type RussianCase = 'nominative' | 'genitive' | 'dative' | 'accusative' | 'instrumental';

const VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я']);

const isCyrillic = (value: string) => /^[А-Яа-яЁё-]+$/.test(value);

const lastChar = (value: string) => value.slice(-1).toLowerCase();
const last2Chars = (value: string) => value.slice(-2).toLowerCase();

const looksFeminineByName = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('ия') || lower.endsWith('ья') || lower.endsWith('ея')) return true;
  if (lower.endsWith('а') || lower.endsWith('я')) return true;
  return false;
};

const inflectMasculineConsonant = (name: string, target: RussianCase) => {
  switch (target) {
    case 'genitive':
    case 'accusative':
      return `${name}а`;
    case 'dative':
      return `${name}у`;
    case 'instrumental':
      return `${name}ом`;
    default:
      return name;
  }
};

const inflectMasculineHusy = (name: string, target: RussianCase) => {
  const stem = name.slice(0, -1);
  switch (target) {
    case 'genitive':
    case 'accusative':
      return `${stem}я`;
    case 'dative':
      return `${stem}ю`;
    case 'instrumental':
      return `${stem}ем`;
    default:
      return name;
  }
};

const inflectMasculineSoftSign = (name: string, target: RussianCase) => {
  const stem = name.slice(0, -1);
  switch (target) {
    case 'genitive':
    case 'accusative':
      return `${stem}я`;
    case 'dative':
      return `${stem}ю`;
    case 'instrumental':
      return `${stem}ем`;
    default:
      return name;
  }
};

const inflectFeminineA = (name: string, target: RussianCase) => {
  const stem = name.slice(0, -1);
  switch (target) {
    case 'genitive':
      return `${stem}ы`;
    case 'dative':
      return `${stem}е`;
    case 'accusative':
      return `${stem}у`;
    case 'instrumental':
      return `${stem}ой`;
    default:
      return name;
  }
};

const inflectFeminineYa = (name: string, target: RussianCase) => {
  const stem = name.slice(0, -1);
  if (last2Chars(name) === 'ия') {
    switch (target) {
      case 'genitive':
      case 'dative':
        return `${stem}и`;
      case 'accusative':
        return `${stem}ю`;
      case 'instrumental':
        return `${stem}ей`;
      default:
        return name;
    }
  }
  switch (target) {
    case 'genitive':
      return `${stem}и`;
    case 'dative':
      return `${stem}е`;
    case 'accusative':
      return `${stem}ю`;
    case 'instrumental':
      return `${stem}ей`;
    default:
      return name;
  }
};

export const inflectFirstName = (rawName: string, target: RussianCase): string => {
  const name = rawName.trim();
  if (!name) return name;
  if (target === 'nominative') return name;
  if (!isCyrillic(name)) return name;

  const tail = lastChar(name);
  const tail2 = last2Chars(name);

  if (looksFeminineByName(name)) {
    if (tail === 'а') return inflectFeminineA(name, target);
    if (tail === 'я') return inflectFeminineYa(name, target);
  }

  if (tail === 'й') return inflectMasculineHusy(name, target);
  if (tail === 'ь') return inflectMasculineSoftSign(name, target);
  if (tail2 === 'ий') return inflectMasculineHusy(name, target);

  if (!VOWELS.has(tail)) {
    return inflectMasculineConsonant(name, target);
  }

  if (tail === 'о' || tail === 'е' || tail === 'у' || tail === 'ы' || tail === 'и' || tail === 'э' || tail === 'ю') {
    return name;
  }

  if (tail === 'а') return inflectFeminineA(name, target);
  if (tail === 'я') return inflectFeminineYa(name, target);

  return name;
};

export const inflectFullName = (rawName: string, target: RussianCase): string => {
  const name = rawName.trim();
  if (!name) return name;
  if (target === 'nominative') return name;
  return name
    .split(/\s+/)
    .map((part) => inflectFirstName(part, target))
    .join(' ');
};
