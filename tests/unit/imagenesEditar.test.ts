import { describe, expect, it } from 'vitest';
import {
  clampCrop,
  cropFromRotated,
  cropToRotated,
  editedSize,
  imageLayout,
  isEdited,
  needsBaking,
  readImageEdit,
  rotateBy,
  type ImageRotation,
} from '../../src/domain/imageEdit.ts';

describe('editar imágenes de los documentos (plan 10.8)', () => {
  it('lee los atributos y descarta lo que no es válido', () => {
    expect(readImageEdit({ src: 'x' })).toEqual({ width: null, rotation: 0, crop: null });
    expect(
      readImageEdit({
        width: 320.4,
        rotation: 90,
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      }),
    ).toEqual({ width: 320, rotation: 90, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } });
    expect(readImageEdit({ width: 10, rotation: 45, crop: { x: 'a' } })).toEqual({
      width: null,
      rotation: 0,
      crop: null,
    });
    expect(readImageEdit({ width: Number.NaN, crop: null })).toEqual({
      width: null,
      rotation: 0,
      crop: null,
    });
  });

  it('el recorte queda dentro de la imagen, con un mínimo, y la imagen entera no es recorte', () => {
    expect(clampCrop({ x: 0.9, y: -1, width: 0.5, height: 0.01 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.05,
    });
    expect(clampCrop({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it('girar da la vuelta en pasos de 90°', () => {
    expect(rotateBy(0, -90)).toBe(270);
    expect(rotateBy(270, 90)).toBe(0);
    expect(rotateBy(90, 90)).toBe(180);
  });

  it('el recorte se pasa a la imagen girada y vuelve igual', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    // Girada 90° a la derecha, la esquina de arriba a la izquierda pasa arriba a la derecha.
    const r90 = cropToRotated(crop, 90);
    expect(r90.x).toBeCloseTo(0.4);
    expect(r90.y).toBeCloseTo(0.1);
    expect(r90.width).toBeCloseTo(0.4);
    expect(r90.height).toBeCloseTo(0.3);
    for (const rotation of [0, 90, 180, 270] as ImageRotation[]) {
      const back = cropFromRotated(cropToRotated(crop, rotation), rotation);
      expect(back.x).toBeCloseTo(crop.x);
      expect(back.y).toBeCloseTo(crop.y);
      expect(back.width).toBeCloseTo(crop.width);
      expect(back.height).toBeCloseTo(crop.height);
    }
  });

  it('tamaño resultante y colocación con CSS', () => {
    const crop = { x: 0.25, y: 0, width: 0.5, height: 0.5 };
    expect(editedSize({ width: 800, height: 400 }, { rotation: 0, crop })).toEqual({
      width: 400,
      height: 200,
    });
    expect(editedSize({ width: 800, height: 400 }, { rotation: 270, crop })).toEqual({
      width: 200,
      height: 400,
    });
    expect(imageLayout({ rotation: 90, crop })).toEqual({
      swap: true,
      image: { left: -50, top: -0, width: 200, height: 200 },
    });
  });

  it('solo el recorte o el giro obligan a generar otra imagen al exportar', () => {
    expect(needsBaking(readImageEdit({ width: 200 }))).toBe(false);
    expect(isEdited(readImageEdit({ width: 200 }))).toBe(true);
    expect(needsBaking(readImageEdit({ rotation: 180 }))).toBe(true);
    expect(isEdited(readImageEdit({}))).toBe(false);
  });
});
