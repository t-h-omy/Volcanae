import IntlMessageFormat from 'intl-messageformat';

function astFor(message, locale) {
  return new IntlMessageFormat(message, locale).getAst();
}

function collectArguments(nodes, names = new Set()) {
  for (const node of nodes) {
    if (node.type !== 0 && node.type !== 7 && node.value !== undefined) names.add(node.value);
    for (const option of Object.values(node.options ?? {})) collectArguments(option.value, names);
  }
  return names;
}

function collectLiteralText(nodes) {
  return nodes.map((node) => [
    node.type === 0 ? node.value ?? '' : '',
    ...Object.values(node.options ?? {}).map((option) => collectLiteralText(option.value)),
  ].join('')).join('');
}

function emojiSet(text) {
  return new Set(text.match(/\p{Extended_Pictographic}/gu) ?? []);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function pluralError(nodes, locale) {
  const rules = new Intl.PluralRules(locale);
  const pluralCategories = new Set(
    Array.from({ length: 1000 }, (_, value) => rules.select(value)),
  );
  const visit = (items) => {
    for (const node of items) {
      if (node.pluralType) {
        const options = Object.keys(node.options ?? {});
        if (!options.includes('other')) return 'plural is missing the other category';
        for (const category of pluralCategories) {
          if (!options.includes(category)) return `plural is missing the ${category} category`;
        }
      }
      for (const option of Object.values(node.options ?? {})) {
        const error = visit(option.value);
        if (error) return error;
      }
    }
    return undefined;
  };
  return visit(nodes);
}

export function validateReviewedMessage({ locale, key, message, enMessage, contextEntry }) {
  let targetAst;
  let sourceAst;
  try {
    targetAst = astFor(message, locale);
  } catch (error) {
    return [`invalid ICU message: ${error instanceof Error ? error.message : String(error)}`];
  }
  try {
    sourceAst = astFor(enMessage, 'en');
  } catch (error) {
    return [`English source is invalid ICU: ${error instanceof Error ? error.message : String(error)}`];
  }

  const errors = [];
  const targetArgs = [...collectArguments(targetAst)].sort();
  const sourceArgs = [...collectArguments(sourceAst)].sort();
  if (JSON.stringify(targetArgs) !== JSON.stringify(sourceArgs)) {
    errors.push(`ICU arguments differ (expected ${sourceArgs.join(', ') || 'none'})`);
  }
  const pluralIssue = pluralError(targetAst, locale);
  if (pluralIssue) errors.push(pluralIssue);
  if (message.includes('\u2014')) errors.push('contains an em dash');
  if (contextEntry?.maxLen !== undefined && message.length > contextEntry.maxLen) {
    errors.push(`exceeds maxLen ${contextEntry.maxLen} (${message.length})`);
  }
  if (!sameSet(emojiSet(message), emojiSet(enMessage))) errors.push('emoji do not match English');
  return errors;
}

export function validateCatalogs({ catalogs, sources, context, locales }) {
  const errors = [];
  const en = catalogs.en;
  const targets = locales.filter((locale) => locale !== 'en');
  const add = (rule, locale, key, reason) => errors.push({ rule, locale, key, reason });

  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, message] of Object.entries(catalog)) {
      try {
        astFor(message, locale);
      } catch (error) {
        add('a', locale, key, `invalid ICU message: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (message.includes('\u2014')) add('g', locale, key, 'contains an em dash');
    }
  }

  for (const locale of targets) {
    const catalog = catalogs[locale];
    const source = sources[locale];
    if (JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(Object.keys(en).sort())) {
      add('b', locale, '*', 'catalog does not have the English key set');
    }
    if (JSON.stringify(Object.keys(source ?? {}).sort()) !== JSON.stringify(Object.keys(en).sort())) {
      add('i', locale, '*', 'source catalog does not have the English key set');
    }

    for (const [key, enMessage] of Object.entries(en)) {
      const message = catalog[key];
      if (typeof message === 'string') {
        let sourceAst;
        let targetAst;
        try {
          sourceAst = astFor(enMessage, 'en');
          targetAst = astFor(message, locale);
          const expectedArgs = [...collectArguments(sourceAst)].sort();
          const actualArgs = [...collectArguments(targetAst)].sort();
          if (JSON.stringify(expectedArgs) !== JSON.stringify(actualArgs)) {
            add('c', locale, key, `ICU arguments differ (expected ${expectedArgs.join(', ') || 'none'})`);
          }
          const issue = pluralError(targetAst, locale);
          if (issue) add('c', locale, key, issue);
          if (catalog[key] === enMessage && /[A-Za-z]/.test(collectLiteralText(sourceAst))) {
            const approvals = context[key]?.sameAsSource ?? [];
            if (!approvals.includes(locale)) add('j', locale, key, 'unchanged English text is not approved');
          }
          if (!sameSet(emojiSet(message), emojiSet(enMessage))) add('k', locale, key, 'emoji do not match English');
        } catch {
          // Rule a reports parse failures for each catalog value.
        }
      }
      if (source?.[key] !== enMessage) add('i', locale, key, 'source text differs from current English');
    }
  }

  for (const [key, entry] of Object.entries(context)) {
    if (!Object.hasOwn(en, key)) {
      add('h', '*', key, 'context entry has no English catalog key');
      continue;
    }
    if (entry.maxLen === undefined) continue;
    for (const locale of locales) {
      const message = catalogs[locale]?.[key];
      if (typeof message === 'string' && message.length > entry.maxLen) {
        add('h', locale, key, `exceeds maxLen ${entry.maxLen} (${message.length})`);
      }
    }
  }
  return errors;
}
