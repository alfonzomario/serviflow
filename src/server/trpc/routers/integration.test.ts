import { describe, it, expect } from 'vitest';
import { appRouter } from '../router';

describe('App Integration & Routers Test Suite', () => {
  it('should export appRouter with all sub-routers registered', () => {
    expect(appRouter).toBeDefined();
    expect(appRouter._def.procedures).toBeDefined();
  });

  it('should have ai, superadmin, subscription, and portal procedures registered', () => {
    const procedureKeys = Object.keys(appRouter._def.procedures);
    expect(procedureKeys).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ai\./),
        expect.stringMatching(/^superadmin\./),
        expect.stringMatching(/^subscription\./),
        expect.stringMatching(/^portal\./),
      ])
    );
  });
});

