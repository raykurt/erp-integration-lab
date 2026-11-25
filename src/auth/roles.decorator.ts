import { SetMetadata } from '@nestjs/common';
import { Role } from '../common/roles';

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
