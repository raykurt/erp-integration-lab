export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  HR = 'HR',
}

/** The user taken from the JWT and attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}
