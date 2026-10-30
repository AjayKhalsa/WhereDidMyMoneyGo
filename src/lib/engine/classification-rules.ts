import type { ClassificationRule } from '@/lib/domain/types';
import { classificationMerchantKey } from './merchant-identity';
import { recognizedMerchants } from './merchant-recognition';
import { automaticSubcategory } from './subcategory-recognition';
import { ruleConditionsMatch } from './time-rules';

export const explicitCorrection = (rule: ClassificationRule) =>
  ['gmail-correction', 'manual-correction'].includes(rule.learningEvidence?.source ?? '');

/** Weak, unscoped legacy meal guesses must not block stronger merchant evidence.
 * Explicit corrections, conditional rules and cross-family choices are preserved. */
function supersededLegacyRule(rule: ClassificationRule, text: string): boolean {
  if (rule.learningEvidence || rule.conditions || rule.confidence >= 0.85) return false;
  const specific = automaticSubcategory(text);
  const known = recognizedMerchants(text);
  const category = specific?.categoryId ?? (known.length === 1 ? known[0]!.categoryId : undefined);
  return !!category && (rule.categoryId.split('.')[0] === category.split('.')[0]
    || rule.pattern === 'district' && category === 'dining.restaurant');
}

const normalise = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Shared by quick entry and Gmail: same evidence must make the same rule choice. */
export function selectClassificationRule(text: string, rules: ClassificationRule[], actualTime?: string) {
  const phrase = ` ${normalise(text)} `;
  const applicable = rules.filter(rule => {
    const pattern = normalise(rule.pattern);
    return pattern && phrase.includes(` ${pattern} `) && !supersededLegacyRule(rule, text)
      && ruleConditionsMatch(rule, text, actualTime)
      && (!rule.learningEvidence || classificationMerchantKey(rule.learningEvidence.merchantKey) === classificationMerchantKey(text));
  });
  const conditional = applicable.filter(rule => rule.conditions);
  const corrections = applicable.filter(explicitCorrection);
  const tier = conditional.length ? conditional : corrections.length ? corrections : applicable;
  const longest = Math.max(0, ...tier.map(rule => normalise(rule.pattern).length));
  // Overlapping approved time rules remain a conflict, regardless of pattern length.
  const finalists = conditional.length ? tier : tier.filter(rule => normalise(rule.pattern).length === longest);
  const conflicts = [...new Set(finalists.map(rule => rule.categoryId))];
  if (conflicts.length > 1) return { rule: undefined, conflicts };
  const rule = [...finalists].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
  return { rule, conflicts: [] as string[] };
}

export const preserveRuleLeaf = (rule: ClassificationRule | undefined) =>
  !!rule && rule.categoryId.includes('.') && (!!rule.conditions || explicitCorrection(rule));

/** A previously saved sub-brand alias must not rename a different known brand. */
export function ruleMerchantAlias(rule: ClassificationRule, observed: string): string | undefined {
  if (!rule.merchant) return;
  const original = recognizedMerchants(observed), alias = recognizedMerchants(rule.merchant);
  if (original.length > 1 || original.length && alias.length
    && classificationMerchantKey(observed) !== classificationMerchantKey(rule.merchant)) return;
  return rule.merchant;
}
