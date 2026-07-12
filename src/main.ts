import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvConfig, true>);

  app.setGlobalPrefix('api/v1');

  // Without this, the API has no CORS policy at all — every browser-based
  // request (from the frontend or anywhere else) is blocked by the
  // browser's own same-origin policy before it even reaches a controller,
  // regardless of auth. Non-browser clients (curl, server-to-server) are
  // unaffected either way, which is why this was easy to miss.
  app.enableCors({
    origin: configService
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const first = errors[0];
        const message = first
          ? Object.values(first.constraints ?? {})[0]
          : 'Validation failed';
        return new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          message,
          field: first?.property ?? null,
        });
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('accounting-system API')
    .setDescription(
      'Backend API for a multi-tenant, dual-currency ERP platform for Lebanese trading companies.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(configService.get('PORT', { infer: true }));
}
void bootstrap();
