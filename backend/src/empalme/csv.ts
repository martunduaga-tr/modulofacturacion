/**
 * Lectura mínima de CSV (sin dependencias): comillas dobles, separador
 * configurable, CRLF/LF y BOM. Los archivos de Data llegan a veces en latin-1
 * (ej. "Estándar" ilegible), por eso `decodificar` intenta UTF-8 estricto y
 * cae a latin-1 si el archivo no es UTF-8 válido.
 */

export function decodificar(buffer: Buffer): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    texto = new TextDecoder('latin1').decode(buffer);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/**
 * Separador según el encabezado: Excel guarda el CSV con `;` o `,` dependiendo
 * de la configuración regional del equipo (en Colombia suele ser `;`).
 */
export function detectarSeparador(texto: string): ';' | ',' {
  const fin = texto.search(/\r?\n/);
  const encabezado = fin < 0 ? texto : texto.slice(0, fin);
  return (encabezado.match(/;/g)?.length ?? 0) >= (encabezado.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export function parsearCsv(texto: string, separador = ','): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        enComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  const [encabezado, ...datos] = filas.filter((f) => f.some((v) => v.trim() !== ''));
  if (!encabezado) return [];
  const columnas = encabezado.map((c) => c.trim());
  return datos.map((f) => Object.fromEntries(columnas.map((col, i) => [col, (f[i] ?? '').trim()])));
}
