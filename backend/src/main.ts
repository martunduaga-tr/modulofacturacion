import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo global: todas las rutas bajo /api
  app.setGlobalPrefix('api');

  // CORS para el frontend de Contabilidad
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  });

  // Validación global de DTOs. whitelist + forbidNonWhitelisted: rechaza campos
  // no declarados. transform: convierte tipos según el DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Documentación Swagger en /api/docs
  const config = new DocumentBuilder()
    .setTitle('Facturación COE — API')
    .setDescription('Sistema de Facturación Automatizada (COE) · Transfiriendo S.A. — Etapa 1')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API escuchando en http://localhost:${port}/api (docs en /api/docs)`);
}

bootstrap();
