import { Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SeedService } from './seed.service';

/**
 * Used by the Playwright end-to-end tests to start every test from the same data.
 * Exists only when the API runs with NODE_ENV=test; everywhere else it answers 404.
 */
@ApiExcludeController()
@Controller('test-support')
export class TestSupportController {
  constructor(private readonly seed: SeedService) {}

  @Public()
  @Post('reset')
  @HttpCode(204)
  async reset(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') throw new NotFoundException();
    await this.seed.reset();
  }
}
