export type GroupEditorIconOption = {
  key: string;
  label: string;
};

export type GroupEditorColorOption = {
  color: string;
  label: string;
};

export type GroupCardPalette = {
  iconBackground: string;
  iconColor: string;
  headerBackground: string;
  countBadgeBackground: string;
  countBadgeColor: string;
};

export const DEFAULT_GROUP_EDITOR_ICON_KEY = 'book';
export const DEFAULT_GROUP_EDITOR_BG_COLOR = '#3B82F6';
const DEFAULT_GROUP_CARD_BG_COLOR = '#E5E7EB';

export const GROUP_EDITOR_ICON_OPTIONS: GroupEditorIconOption[] = [
  { key: 'book', label: 'Книга' },
  { key: 'book-open', label: 'Открытая книга' },
  { key: 'layer-group', label: 'Слои' },
  { key: 'file-lines', label: 'Документ' },
  { key: 'microphone', label: 'Микрофон' },
  { key: 'list-check', label: 'Тест' },
  { key: 'gear', label: 'Настройки' },
];

export const GROUP_EDITOR_COLOR_OPTIONS: GroupEditorColorOption[] = [
  { color: '#3B82F6', label: 'Синий' },
  { color: '#06B6D4', label: 'Бирюзовый' },
  { color: '#10B981', label: 'Зеленый' },
  { color: '#F59E0B', label: 'Оранжевый' },
  { color: '#EF4444', label: 'Красный' },
  { color: '#6366F1', label: 'Индиго' },
  { color: '#8B5CF6', label: 'Фиолетовый' },
  { color: '#6B7280', label: 'Серый' },
];

const normalizeHexColor = (value?: string | null) => {
  if (!value) return '';
  const normalized = value.trim().toUpperCase();
  return /^#(?:[0-9A-F]{6})$/.test(normalized) ? normalized : '';
};

const rgbFromHex = (hexColor: string) => ({
  r: Number.parseInt(hexColor.slice(1, 3), 16),
  g: Number.parseInt(hexColor.slice(3, 5), 16),
  b: Number.parseInt(hexColor.slice(5, 7), 16),
});

const toRgba = ({ r, g, b }: { r: number; g: number; b: number }, alpha: number) => {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
};

const mixWithWhite = ({ r, g, b }: { r: number; g: number; b: number }, ratio: number) => {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return {
    r: Math.round(r + (255 - r) * safeRatio),
    g: Math.round(g + (255 - g) * safeRatio),
    b: Math.round(b + (255 - b) * safeRatio),
  };
};

const mixWithBlack = ({ r, g, b }: { r: number; g: number; b: number }, ratio: number) => {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return {
    r: Math.round(r * (1 - safeRatio)),
    g: Math.round(g * (1 - safeRatio)),
    b: Math.round(b * (1 - safeRatio)),
  };
};

const relativeLuminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const transform = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

export const resolveGroupEditorIconKey = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return GROUP_EDITOR_ICON_OPTIONS.some((option) => option.key === normalized)
    ? normalized
    : DEFAULT_GROUP_EDITOR_ICON_KEY;
};

export const resolveGroupEditorBgColor = (value?: string | null) => {
  const normalized = normalizeHexColor(value);
  return normalized || DEFAULT_GROUP_EDITOR_BG_COLOR;
};

export const resolveGroupCardPalette = (value?: string | null): GroupCardPalette => {
  const baseColor = normalizeHexColor(value) || DEFAULT_GROUP_CARD_BG_COLOR;
  const baseRgb = rgbFromHex(baseColor);
  const headerStart = mixWithWhite(baseRgb, 0.84);
  const headerMid = mixWithWhite(baseRgb, 0.92);
  const darkerText = mixWithBlack(baseRgb, 0.24);
  const lightBackground = mixWithWhite(baseRgb, 0.88);
  const iconColor = relativeLuminance(baseRgb) > 0.62 ? '#334155' : '#FFFFFF';

  return {
    iconBackground: baseColor,
    iconColor,
    headerBackground: `linear-gradient(90deg, ${toRgba(headerStart, 1)} 0%, ${toRgba(headerMid, 0.78)} 34%, rgba(255, 255, 255, 0) 78%)`,
    countBadgeBackground: toRgba(lightBackground, 0.92),
    countBadgeColor: relativeLuminance(baseRgb) > 0.62 ? '#1F2937' : toRgba(darkerText, 1),
  };
};

export const resolveGroupEditorIconLabel = (iconKey: string) =>
  GROUP_EDITOR_ICON_OPTIONS.find((option) => option.key === iconKey)?.label ?? 'Книга';

export const resolveGroupEditorColorLabel = (bgColor: string) =>
  GROUP_EDITOR_COLOR_OPTIONS.find((option) => option.color.toUpperCase() === bgColor.toUpperCase())?.label ??
  'Свой цвет';
