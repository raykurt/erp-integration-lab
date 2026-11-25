import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser, Role } from '../common/roles';
import { Employee } from './employee.entity';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(@InjectRepository(Employee) private readonly employees: Repository<Employee>) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<Employee> {
    const me = await this.employees.findOneBy({ id: user.id });
    if (!me) throw new NotFoundException();
    return me;
  }

  @Get()
  @Roles(Role.HR)
  list(): Promise<Employee[]> {
    return this.employees.find({ order: { id: 'ASC' } });
  }
}
