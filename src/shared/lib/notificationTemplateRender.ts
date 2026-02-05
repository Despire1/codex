export type TemplateRenderResult = {
  renderedText: string;
  missingData: string[];
  unknownPlaceholders: string[];
};

const VARIABLE_REGEX = /{{\s*([^}]+)\s*}}/g;

export const renderNotificationTemplate = ({
  template,
  values,
  allowedVariables,
  missingPlaceholder = '—',
}: {
  template: string;
  values: Record<string, string | null | undefined>;
  allowedVariables: readonly string[];
  missingPlaceholder?: string;
}): TemplateRenderResult => {
  const allowedSet = new Set(allowedVariables);
  const missingData = new Set<string>();
  const unknownPlaceholders = new Set<string>();

  const renderedText = template.replace(VARIABLE_REGEX, (match, rawVariable) => {
    const key = typeof rawVariable === 'string' ? rawVariable.trim() : '';
    if (!allowedSet.has(key)) {
      if (key) unknownPlaceholders.add(key);
      return match;
    }

    const value = values[key];
    if (value === undefined || value === null || value === '') {
      missingData.add(key);
      return missingPlaceholder;
    }

    return String(value);
  });

  return {
    renderedText,
    missingData: Array.from(missingData),
    unknownPlaceholders: Array.from(unknownPlaceholders),
  };
};
