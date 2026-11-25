import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/roles';
import { CreateLeaveRequestDto, ListLeaveRequestsQuery, RejectLeaveRequestDto } from './dto';
import { LeaveRequest } from './leave-request.entity';
import { LeaveService } from './leave.service';

@ApiTags('leave-requests')
@ApiBearerAuth()
@Controller('leave-requests')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    return this.leave.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListLeaveRequestsQuery): Promise<LeaveRequest[]> {
    return this.leave.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<LeaveRequest> {
    return this.leave.get(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<LeaveRequest> {
    return this.leave.approve(user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectLeaveRequestDto,
  ): Promise<LeaveRequest> {
    return this.leave.reject(user, id, dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<LeaveRequest> {
    return this.leave.cancel(user, id);
  }
}
