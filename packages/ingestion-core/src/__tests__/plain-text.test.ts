import { describe, expect, it } from 'vitest';
import { stripInlineMarkdown } from '../content/plain-text';

describe('stripInlineMarkdown', () => {
  it('unwraps italic publication names', () => {
    expect(stripInlineMarkdown('*WIRED* has released its 2026 gift guide')).toBe('WIRED has released its 2026 gift guide');
    expect(stripInlineMarkdown('according to _The Hindu_, the round closed')).toBe('according to The Hindu, the round closed');
  });

  it('unwraps bold, code and links', () => {
    expect(stripInlineMarkdown('**Bold** move by Zepto')).toBe('Bold move by Zepto');
    expect(stripInlineMarkdown('Raises **$33M** in __Series B__')).toBe('Raises $33M in Series B');
    expect(stripInlineMarkdown('Ships `v2` of [Claw](https://oracle.com/claw) today')).toBe('Ships v2 of Claw today');
    expect(stripInlineMarkdown('***Big*** news')).toBe('Big news');
  });

  it('drops orphan asterisks left by truncation and leading markers', () => {
    expect(stripInlineMarkdown('*WIRED has released its guide…')).toBe('WIRED has released its guide…');
    expect(stripInlineMarkdown('the guide by WIRED*.')).toBe('the guide by WIRED.');
    expect(stripInlineMarkdown('## Oracle ships Claw')).toBe('Oracle ships Claw');
  });

  it('leaves arithmetic, snake_case and plain text alone', () => {
    expect(stripInlineMarkdown('5 * 3 = 15')).toBe('5 * 3 = 15');
    expect(stripInlineMarkdown('the user_id and snake_case_name fields')).toBe('the user_id and snake_case_name fields');
    expect(stripInlineMarkdown('Zepto raises $25M')).toBe('Zepto raises $25M');
    expect(stripInlineMarkdown('')).toBe('');
  });
});
