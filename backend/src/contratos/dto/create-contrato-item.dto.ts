import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import type { Moneda } from '../entities/contrato-item.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import { TarifaAnioDto } from '../../tarifas/dto/tarifa-anio.dto';
import { CreateItemConceptoDto } from './create-item-concepto.dto';
import { ModeloCobro } from '../entities/contrato-item.entity';

export class CreateContratoItemDto {
  @ApiProperty({
    type: [CreateItemConceptoDto],
    description:
      'Servicios (producto+concepto) que agrupa este item. Lo normal es 1; un item ' +
      'con 2+ es un contrato "híbrido": sus volúmenes se SUMAN y esa suma es la que ' +
      'se compara contra la tabla de tarifa única del item.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'El item debe tener al menos un servicio (producto+concepto)' })
  @ValidateNested({ each: true })
  @Type(() => CreateItemConceptoDto)
  conceptos: CreateItemConceptoDto[];

  @ApiProperty({ enum: ['volumen_escalonado', 'minimo_garantizado', 'fijo_mensual', 'bolsa'] })
  @IsIn(['volumen_escalonado', 'minimo_garantizado', 'fijo_mensual', 'bolsa'], {
    message: "modeloCobro debe ser 'volumen_escalonado', 'minimo_garantizado', 'fijo_mensual' o 'bolsa'",
  })
  modeloCobro: ModeloCobro;

  @ApiPropertyOptional({ enum: ['COP', 'USD'], default: 'COP', description: 'Moneda de la tarifa. USD pasa a pesos con la TRM del día de la factura.' })
  @IsOptional()
  @IsIn(['COP', 'USD'], { message: "moneda debe ser 'COP' o 'USD'" })
  moneda?: Moneda;

  @ApiProperty({ type: [TarifaAnioDto], description: 'Tarifas por año, coherentes con el modelo de cobro' })
  @IsArray()
  @ArrayMinSize(1, { message: 'El item debe tener al menos una tarifa (un año)' })
  @ValidateNested({ each: true })
  @Type(() => TarifaAnioDto)
  tarifas: TarifaAnioDto[];
}
