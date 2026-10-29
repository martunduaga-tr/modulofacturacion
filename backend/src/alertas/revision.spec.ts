import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { diasSinRevisar } from './alertas.types';
import { RevisarAlertaDto } from './dto/revisar-alerta.dto';

describe('Revisión de alertas de variación', () => {
  const diaria = (fechas: string[]) => ({ tipo: 'variacion_diaria' as const, detalle: { dias: fechas.map((fecha) => ({ fecha })) } });

  it('revisada con los mismos días: no vuelve a salir', () => {
    expect(diasSinRevisar(diaria(['2026-10-06', '2026-10-07']), ['2026-10-06', '2026-10-07'])).toEqual([]);
  });

  it('mes en curso con un día nuevo fuera de lo normal: vuelve a salir con ese día', () => {
    expect(diasSinRevisar(diaria(['2026-10-06', '2026-10-07', '2026-10-20']), ['2026-10-06', '2026-10-07'])).toEqual(['2026-10-20']);
  });

  it('la mensual y la caída general no se reabren por días', () => {
    expect(diasSinRevisar({ tipo: 'variacion_mensual', detalle: {} }, [])).toEqual([]);
  });

  it('motivo de la lista; nota obligatoria si es "otro" o "se ajusta la factura"', async () => {
    const errores = async (o: object) => (await validate(plainToInstance(RevisarAlertaDto, o))).map((e) => e.property);
    expect(await errores({ clave: 'x', motivo: 'festivo_o_cierre' })).toEqual([]);
    expect(await errores({ clave: 'x', motivo: 'inventado' })).toEqual(['motivo']);
    expect(await errores({ clave: 'x', motivo: 'otro' })).toEqual(['nota']);
    expect(await errores({ clave: 'x', motivo: 'ajuste_factura', nota: '  ' })).toEqual(['nota']);
    expect(await errores({ clave: 'x', motivo: 'ajuste_factura', nota: 'Se descuentan 300 trx de la FE-25001' })).toEqual([]);
  });
});
