import { formatearMoneda } from '../../lib/format';

export function Money({ valor, decimales }: { valor: number | null | undefined; decimales?: number }) {
  return <span className="num">{formatearMoneda(valor, decimales)}</span>;
}
