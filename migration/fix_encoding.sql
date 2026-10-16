/* Corrige textos con acentos que sqlcmd guardó mal al leer el seed sin codepage
   UTF-8. Ejecutar SIEMPRE con:  sqlcmd ... -f 65001 -i migration/fix_encoding.sql
   (idempotente: deja los valores correctos sin importar el estado previo). */

UPDATE coe.conceptos_facturables SET nombre = N'Emisión'   WHERE codigo = 'EMISION';
UPDATE coe.conceptos_facturables SET nombre = N'Recepción' WHERE codigo = 'RECEPCION';

UPDATE coe.parametros_globales SET descripcion = N'Autorretención 0,8% (informativa)'                  WHERE clave = 'AUTORRETENCION';
UPDATE coe.parametros_globales SET descripcion = N'Retención en la fuente 3,5% (variante 4% según cliente)' WHERE clave = 'RTEFTE';
UPDATE coe.parametros_globales SET descripcion = N'Retención de IVA 15% (sobre el IVA)'                 WHERE clave = 'RTEIVA';
UPDATE coe.parametros_globales SET descripcion = N'Retención de ICA 0,966%'                            WHERE clave = 'RTEICA';
UPDATE coe.parametros_globales SET descripcion = N'IVA general 19%'                                    WHERE clave = 'IVA';
UPDATE coe.parametros_globales SET descripcion = N'IPC vigente 5,2%'                                   WHERE clave = 'IPC';
UPDATE coe.parametros_globales SET descripcion = N'TRM — actualizar con valor vigente'                 WHERE clave = 'TRM';
GO
