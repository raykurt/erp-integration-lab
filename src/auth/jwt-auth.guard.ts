import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, Role } from '../common/roles';
import { IS_PUBLIC } from './public.decorator';
import { ROLES } from './roles.decorator';

/** Global guard: every endpoint needs a valid Bearer token unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing Bearer token');

    try {
      const payload = await this.jwt.verifyAsync(token);
      request.user = { id: payload.sub, username: payload.username, role: payload.role } as AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(request.user.role)) {
      throw new ForbiddenException('Your role cannot use this endpoint');
    }
    return true;
  }
}
