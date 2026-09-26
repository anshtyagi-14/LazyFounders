import { describe, expect, test } from 'vitest';

import { splitBodyNearMiddle } from './article-body';

describe('splitBodyNearMiddle', () => {
  test('cuts at the heading closest to the middle', () => {
    const body = 'Intro.\n\n## One\n\nA.\n\n## Two\n\nB.\n\n## Three\n\nC.';
    const [top, bottom] = splitBodyNearMiddle(body);
    expect(top + bottom).toBe(body);
    expect(bottom.startsWith('\n## Two')).toBe(true);
  });

  test('never cuts inside a summary box', () => {
    const body = '<div class="summary-box"><h3>30 SEC SUMMARY</h3>\n\n## Inside\n\nx\n</div>\n\nPara one.\n\n## After\n\nPara two.';
    const [top] = splitBodyNearMiddle(body);
    expect(top).toContain('</div>');
  });

  test('falls back to a paragraph break when there are no headings', () => {
    const body = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
    const [top, bottom] = splitBodyNearMiddle(body);
    expect(top).toBe('First paragraph here.\n\nSecond paragraph here.');
    expect(bottom).toBe('\n\nThird paragraph here.');
  });

  test('does not split a list', () => {
    const [top, bottom] = splitBodyNearMiddle('- a\n\n- b\n\n- c');
    expect(bottom).toBe('');
    expect(top).toBe('- a\n\n- b\n\n- c');
  });
});
