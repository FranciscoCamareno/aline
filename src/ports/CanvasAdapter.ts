import type { CanvasExtensions } from '../domain/sidecar.ts';

/**
 * Puerto del motor de lienzo (diseño §9). La aplicación trata la escena como bytes opacos en
 * formato .excalidraw; solo el adaptador conoce los tipos del motor.
 */
export interface CanvasAsset {
  hash: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface SerializedCanvas {
  /** Escena en esquema .excalidraw, con los archivos sustituidos por referencias a assets. */
  sceneJson: string;
  assets: CanvasAsset[];
  /** Sidecar derivado de la escena; si se omite, se conserva el de la cabeza. */
  extensions?: CanvasExtensions;
}

export interface CanvasAdapter<Scene> {
  /** Convierte la escena del motor en bytes persistibles y assets direccionados por hash. */
  serialize(scene: Scene): Promise<SerializedCanvas>;
  /** Rehidrata la escena a partir de bytes y assets almacenados. */
  deserialize(
    sceneJson: string,
    loadAsset: (hash: string) => Promise<CanvasAsset | undefined>,
  ): Promise<Scene>;
  /** Firma de contenido para ignorar cambios de desplazamiento, zoom o selección. */
  contentSignature(scene: Scene): string;
}
