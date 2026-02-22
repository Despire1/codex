export type GroupEditorIconOption = {
  key: string;
  label: string;
};

export type GroupEditorColorOption = {
  color: string;
  label: string;
};

export const DEFAULT_GROUP_EDITOR_ICON_KEY = 'book';
export const DEFAULT_GROUP_EDITOR_BG_COLOR = '#3B82F6';

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

export const resolveGroupEditorIconLabel = (iconKey: string) =>
  GROUP_EDITOR_ICON_OPTIONS.find((option) => option.key === iconKey)?.label ?? 'Книга';

export const resolveGroupEditorColorLabel = (bgColor: string) =>
  GROUP_EDITOR_COLOR_OPTIONS.find((option) => option.color.toUpperCase() === bgColor.toUpperCase())?.label ??
  'Свой цвет';
