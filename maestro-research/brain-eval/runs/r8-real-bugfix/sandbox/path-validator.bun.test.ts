import { describe, it, expect } from 'bun:test';
import { isPathWithinAllowedDirectories } from './path-validator';

describe('isPathWithinAllowedDirectories — boundary safety', () => {
  const allowed = ['/home/user/project'];
  it('accepts the dir itself', () => {
    expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(true);
  });
  it('accepts a child path', () => {
    expect(isPathWithinAllowedDirectories('/home/user/project/src/a.ts', allowed)).toBe(true);
  });
  it('rejects a sibling sharing a name prefix (no separator boundary)', () => {
    expect(isPathWithinAllowedDirectories('/home/user/project-evil/secret.ts', allowed)).toBe(false);
  });
  it('rejects an unrelated path', () => {
    expect(isPathWithinAllowedDirectories('/etc/passwd', allowed)).toBe(false);
  });
});
