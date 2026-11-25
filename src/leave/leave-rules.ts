import { HttpStatus } from '@nestjs/common';
import { BusinessError } from '../common/errors';
import { countWorkingDays, parseIsoDate } from '../common/dates';
import { AuthUser, Role } from '../common/roles';

/**
 * Pure business rules of the leave module.
 * They have no database access, so they are covered by fast unit tests (leave-rules.spec.ts).
 */

export interface Owner {
  id: number;
  managerId: number | null;
}

/** Validates the date range and returns the number of working days. */
export function workingDaysFor(start: string, end: string, today: string): number {
  for (const value of [start, end]) {
    try {
      parseIsoDate(value);
    } catch {
      throw new BusinessError(HttpStatus.BAD_REQUEST, 'INVALID_DATE', `${value} is not a valid calendar date`);
    }
  }
  if (end < start) throw new BusinessError(HttpStatus.BAD_REQUEST, 'END_BEFORE_START', 'End date is before start date');
  if (start < today) throw new BusinessError(HttpStatus.BAD_REQUEST, 'START_IN_PAST', 'Start date is in the past');
  const days = countWorkingDays(start, end);
  if (days === 0) throw new BusinessError(HttpStatus.BAD_REQUEST, 'NO_WORKING_DAYS', 'The range contains no working days');
  return days;
}

/** Annual leave: balance minus days already waiting for approval. */
export function ensureEnoughBalance(balance: number, pendingDays: number, requestedDays: number): void {
  const available = balance - pendingDays;
  if (requestedDays > available) {
    throw new BusinessError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INSUFFICIENT_BALANCE',
      `Requested ${requestedDays} day(s), available ${available} day(s)`,
    );
  }
}

/** HR can decide on anyone except themselves; a manager only on their own team. */
export function canDecide(actor: AuthUser, owner: Owner): boolean {
  if (actor.id === owner.id) return false;
  if (actor.role === Role.HR) return true;
  return actor.role === Role.MANAGER && owner.managerId === actor.id;
}

/** Owner, their manager and HR can see a request. */
export function canView(actor: AuthUser, owner: Owner): boolean {
  return actor.id === owner.id || canDecide(actor, owner) || actor.role === Role.HR;
}
