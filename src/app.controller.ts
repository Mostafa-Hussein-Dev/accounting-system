import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Root welcome endpoint. Mapped at the API root (`GET /api/v1`) — a friendly
 * pointer to the docs rather than a bare 404. Public.
 */
@ApiTags('Root')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'API welcome message and links.' })
  @ApiResponse({ status: 200, description: 'Welcome payload' })
  welcome(): {
    name: string;
    version: string;
    docs: string;
    health: string;
  } {
    return {
      name: 'accounting-system API',
      version: '1.0',
      docs: '/api/docs',
      health: '/health',
    };
  }
}
