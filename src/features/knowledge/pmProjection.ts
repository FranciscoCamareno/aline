import { ProjectionBuilder, type TextProjection } from '../../domain/anchors.ts';

/**
 * Lo que se usa de un nodo de ProseMirror. Tiptap y Milkdown traen cada uno su copia del paquete,
 * así que se describe por su forma y vale para los dos.
 */
interface PmNode {
  readonly isText: boolean;
  readonly isTextblock: boolean;
  readonly text?: string | undefined;
  readonly nodeSize: number;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly type: { readonly name: string };
  forEach(f: (child: PmNode, offset: number) => void): void;
  descendants(f: (node: PmNode, pos: number) => boolean | void): void;
}

/**
 * Texto mostrado de un documento abierto en un editor ProseMirror, para crear y resolver anclas
 * de texto (`domain/anchors.ts`): un bloque por bloque de texto, con su ancla (`attrs.anchor`)
 * si la tiene, y la posición de ProseMirror de cada tramo. Coincide con `richDocProjection`.
 */
export function pmProjection(doc: PmNode): TextProjection {
  const builder = new ProjectionBuilder();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const anchor = node.attrs['anchor'];
    builder.startBlock(typeof anchor === 'string' && anchor ? anchor : null);
    node.forEach((child, offset) => {
      const at = pos + 1 + offset;
      if (child.isText) builder.append(child.text ?? '', at, at + child.nodeSize);
      else if (child.type.name.toLowerCase() === 'hardbreak') builder.append(' ', at, at + 1);
    });
    builder.endBlock();
    return false;
  });
  return builder.build();
}
