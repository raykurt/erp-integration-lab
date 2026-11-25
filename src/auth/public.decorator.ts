import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Marks an endpoint that does not need a token (e.g. login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
