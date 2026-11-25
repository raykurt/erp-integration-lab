import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { todayIso } from '../common/dates';
import { BusinessError } from '../common/errors';
import { AuthUser, Role } from '../common/roles';
import { Employee } from '../employees/employee.entity';
import { CreateLeaveRequestDto, ListLeaveRequestsQuery } from './dto';
import { LeaveRequest, LeaveStatus, LeaveType } from './leave-request.entity';
import { canDecide, canView, ensureEnoughBalance, workingDaysFor } from './leave-rules';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveRequest) private readonly requests: Repository<LeaveRequest>,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(user: AuthUser, dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    const days = workingDaysFor(dto.startDate, dto.endDate, todayIso());

    return this.dataSource.transaction(async (m) => {
      // Lock the employee row so two parallel requests cannot both pass the balance check.
      const employee = await m.findOne(Employee, { where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!employee) throw new NotFoundException('Employee not found');

      const overlapping = await m.count(LeaveRequest, {
        where: {
          employeeId: user.id,
          status: In([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
          startDate: LessThanOrEqual(dto.endDate),
          endDate: MoreThanOrEqual(dto.startDate),
        },
      });
      if (overlapping > 0) {
        throw new BusinessError(HttpStatus.CONFLICT, 'OVERLAPPING_REQUEST', 'You already have a leave request in this range');
      }

      if (dto.type === LeaveType.ANNUAL) {
        ensureEnoughBalance(employee.annualLeaveBalance, await this.pendingAnnualDays(m, user.id), days);
      }

      return m.save(
        m.create(LeaveRequest, {
          employeeId: user.id,
          type: dto.type,
          startDate: dto.startDate,
          endDate: dto.endDate,
          workingDays: days,
          note: dto.note ?? null,
        }),
      );
    });
  }

  /** Employees see their own requests, managers also see their team, HR sees everything. */
  list(user: AuthUser, query: ListLeaveRequestsQuery): Promise<LeaveRequest[]> {
    const qb = this.requests
      .createQueryBuilder('r')
      .innerJoin('r.employee', 'e')
      .orderBy('r.startDate', 'ASC')
      .addOrderBy('r.id', 'ASC');

    if (user.role !== Role.HR) {
      qb.where(new Brackets((w) => w.where('r.employeeId = :id', { id: user.id }).orWhere('e.managerId = :id', { id: user.id })));
    }
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    return qb.getMany();
  }

  async get(user: AuthUser, id: number): Promise<LeaveRequest> {
    const request = await this.requests.findOne({ where: { id }, relations: { employee: true } });
    if (!request || !request.employee) throw new NotFoundException('Leave request not found');
    if (!canView(user, request.employee)) throw new ForbiddenException('You cannot view this leave request');
    delete request.employee;
    return request;
  }

  approve(user: AuthUser, id: number): Promise<LeaveRequest> {
    return this.decide(user, id, async (m, request, owner) => {
      if (request.type === LeaveType.ANNUAL) {
        // Re-check at approval time: the balance may have changed since the request was created.
        ensureEnoughBalance(owner.annualLeaveBalance, 0, request.workingDays);
        owner.annualLeaveBalance -= request.workingDays;
        await m.save(owner);
      }
      request.status = LeaveStatus.APPROVED;
    });
  }

  reject(user: AuthUser, id: number, reason: string): Promise<LeaveRequest> {
    return this.decide(user, id, async (_m, request) => {
      request.status = LeaveStatus.REJECTED;
      request.decisionReason = reason;
    });
  }

  async cancel(user: AuthUser, id: number): Promise<LeaveRequest> {
    return this.dataSource.transaction(async (m) => {
      const request = await this.lockRequest(m, id);
      if (request.employeeId !== user.id) throw new ForbiddenException('Only the owner can cancel a leave request');

      if (request.status === LeaveStatus.APPROVED) {
        if (request.startDate <= todayIso()) {
          throw new BusinessError(HttpStatus.CONFLICT, 'ALREADY_STARTED', 'An approved leave cannot be cancelled after it has started');
        }
        if (request.type === LeaveType.ANNUAL) {
          await m.increment(Employee, { id: request.employeeId }, 'annualLeaveBalance', request.workingDays);
        }
      } else if (request.status !== LeaveStatus.PENDING) {
        throw new BusinessError(HttpStatus.CONFLICT, 'INVALID_STATUS', `A ${request.status} request cannot be cancelled`);
      }

      request.status = LeaveStatus.CANCELLED;
      return m.save(request);
    });
  }

  /** Shared flow for approve/reject: lock, check permission and status, apply the change. */
  private decide(
    user: AuthUser,
    id: number,
    apply: (m: EntityManager, request: LeaveRequest, owner: Employee) => Promise<void>,
  ): Promise<LeaveRequest> {
    return this.dataSource.transaction(async (m) => {
      const request = await this.lockRequest(m, id);
      const owner = await m.findOne(Employee, { where: { id: request.employeeId }, lock: { mode: 'pessimistic_write' } });
      if (!owner) throw new NotFoundException('Employee not found');
      if (!canDecide(user, owner)) throw new ForbiddenException('You cannot decide on this leave request');
      if (request.status !== LeaveStatus.PENDING) {
        throw new BusinessError(HttpStatus.CONFLICT, 'INVALID_STATUS', `Request is already ${request.status}`);
      }

      await apply(m, request, owner);
      request.decidedById = user.id;
      request.decidedAt = new Date();
      return m.save(request);
    });
  }

  /** SELECT ... FOR UPDATE: two managers clicking "approve" at the same time cannot both succeed. */
  private async lockRequest(m: EntityManager, id: number): Promise<LeaveRequest> {
    const request = await m.findOne(LeaveRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!request) throw new NotFoundException('Leave request not found');
    return request;
  }

  private async pendingAnnualDays(m: EntityManager, employeeId: number): Promise<number> {
    const row = await m
      .createQueryBuilder(LeaveRequest, 'r')
      .select('COALESCE(SUM(r.workingDays), 0)', 'days')
      .where('r.employeeId = :employeeId', { employeeId })
      .andWhere('r.status = :status', { status: LeaveStatus.PENDING })
      .andWhere('r.type = :type', { type: LeaveType.ANNUAL })
      .getRawOne<{ days: string }>();
    return Number(row?.days ?? 0);
  }
}
