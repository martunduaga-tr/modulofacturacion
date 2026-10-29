import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CambiarClaveDto } from './dto/clave.dto';
import { Public } from './decorators/public.decorator';
import { PermiteClaveTemporal } from './decorators/clave-temporal.decorator';
import { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión y obtener el token JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @PermiteClaveTemporal()
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  me(@Req() req: { user: unknown }) {
    return req.user;
  }

  @Post('cambiar-clave')
  @PermiteClaveTemporal()
  @ApiOperation({ summary: 'Cambiar la propia clave (obligatorio con clave temporal); devuelve una sesión nueva' })
  cambiarClave(@Req() req: { user: AuthUser }, @Body() dto: CambiarClaveDto) {
    return this.authService.cambiarClave(req.user.id, dto.actual, dto.nueva);
  }
}
