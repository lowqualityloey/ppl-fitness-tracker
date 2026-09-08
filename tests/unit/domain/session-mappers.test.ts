import { describe, expect, it } from 'vitest';
import {
  mapExercisePlan,
  mapSessionSet,
  mapSessionSummary,
} from '../../../lib/domain/sessions/mappers.js';
import { exercises, sessionSets, workoutSessions } from '../../../db/schema/index.js';

describe('session domain mappers', () => {
  it('keeps session timestamps and state fields in domain form', () => {
    const startedAt = new Date('2026-09-08T12:00:00.000Z');
    const updatedAt = new Date('2026-09-08T12:05:00.000Z');
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      routineDayId: '33333333-3333-4333-8333-333333333333',
      clientId: '44444444-4444-4444-8444-444444444444',
      status: 'in_progress' as const,
      phase: 'pre_workout' as const,
      source: 'app' as const,
      localDate: '2026-09-08',
      startedAt,
      completedAt: null,
      serverSeq: 0,
      updatedAt,
    } satisfies typeof workoutSessions.$inferSelect;

    expect(mapSessionSummary(row)).toEqual({
      id: row.id,
      routineDayId: row.routineDayId,
      clientId: row.clientId,
      status: row.status,
      phase: row.phase,
      source: row.source,
      localDate: row.localDate,
      startedAt,
      completedAt: null,
      serverSeq: 0,
      updatedAt,
    });
  });

  it('converts database numeric values to domain numbers', () => {
    const row = {
      id: '55555555-5555-4555-8555-555555555555',
      userId: '22222222-2222-4222-8222-222222222222',
      sessionId: '11111111-1111-4111-8111-111111111111',
      exerciseId: '66666666-6666-4666-8666-666666666666',
      setIndex: 0,
      isCompleted: true,
      weightKg: '82.50',
      reps: 5,
      clientTs: new Date('2026-09-08T12:00:00.000Z'),
      updatedAt: new Date('2026-09-08T12:00:01.000Z'),
    } satisfies typeof sessionSets.$inferSelect;

    expect(mapSessionSet(row).weightKg).toBe(82.5);
  });

  it('preserves content fields needed by the workout plan', () => {
    const row = {
      id: '77777777-7777-4777-8777-777777777777',
      slug: 'bench-press',
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      formTips: 'Keep your shoulders packed.',
      beginnerNotes: 'Use a spotter.',
      videoUrl: null,
      alternatives: ['push-ups'],
      kind: 'strength' as const,
      durationSeconds: null,
      ownerUserId: null,
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
    } satisfies typeof exercises.$inferSelect;

    expect(mapExercisePlan(row)).toMatchObject({
      slug: 'bench-press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      kind: 'strength',
      durationSeconds: null,
    });
  });
});
