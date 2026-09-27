import { describe, expect, it } from 'vitest';
import { linesNeeded } from './capacity.js';

describe('linesNeeded', () => {
  it('переносит по словам', () => {
    expect(linesNeeded(['один два три'], 20)).toBe(1);
    expect(linesNeeded(['один два три'], 8)).toBe(2);
  });

  it('каждый абзац начинается с новой строки', () => {
    expect(linesNeeded(['а', 'б', 'в'], 40)).toBe(3);
  });

  it('слово длиннее строки режется по символам', () => {
    expect(linesNeeded(['GENERATION_TIME_BUDGET_MS'], 10)).toBe(3);
  });
});
