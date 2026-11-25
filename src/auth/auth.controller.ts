import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNotEmpty, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Public } from './public.decorator';

export class LoginDto {
  @ApiProperty({ example: 'ayse' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.employees.findOne({
      where: { username: dto.username },
      select: ['id', 'username', 'role', 'passwordHash'],
    });
    // Same message for "unknown user" and "wrong password", so usernames cannot be discovered.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role });
    return { accessToken };
  }
}
