import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store.ts';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import { resolveAnchor, sourceOffset, type TextProjection } from '../../domain/anchors.ts';
import type { TextSelector } from '../../domain/links.ts';

/**
 * Resaltado de los fragmentos con backlinks (fase 7.F): el destino de un enlace con ancla se
 * marca en el editor con una decoración, sin tocar el contenido.
 */
export interface BacklinkAnchor {
  blockId: string | null;
  quote: TextSelector | null;
  /** Títulos de los documentos que enlazan a este fragmento. */
  sources: string[];
}

/** Rango que se resalta, en posiciones del editor, con el texto de su aviso al pasar. */
export interface MarkRange {
  from: number;
  to: number;
  sources: string[];
}

/** Backlinks con ancla de un documento, agrupados por fragmento; se renuevan con el índice. */
export function useBacklinkAnchors(knowledge: KnowledgeService, documentId: string) {
  const version = useUiStore((s) => s.knowledgeVersion);
  const [anchors, setAnchors] = useState<BacklinkAnchor[]>([]);
  useEffect(() => {
    let cancelled = false;
    void knowledge.backlinks(documentId).then((links) => {
      if (cancelled) return;
      const groups = new Map<string, BacklinkAnchor>();
      for (const { link, source, status } of links) {
        // Solo lo que se encuentra tal cual: un ancla aproximada o perdida no marca nada.
        if (status !== 'ok' || !source || (!link.targetQuote && !link.targetBlockId)) continue;
        const blockId = link.targetBlockId ?? null;
        const quote = link.targetQuote ?? null;
        const key = JSON.stringify([blockId, quote]);
        const group = groups.get(key) ?? { blockId, quote, sources: [] };
        if (!group.sources.includes(source.title)) group.sources.push(source.title);
        groups.set(key, group);
      }
      setAnchors([...groups.values()]);
    });
    return () => {
      cancelled = true;
    };
  }, [knowledge, documentId, version]);
  return anchors;
}

/** Rangos de origen (Markdown fuente o posiciones de ProseMirror) de los fragmentos enlazados. */
export function backlinkRanges(projection: TextProjection, anchors: BacklinkAnchor[]): MarkRange[] {
  const ranges: MarkRange[] = [];
  for (const anchor of anchors) {
    const result = resolveAnchor(projection, { blockId: anchor.blockId, text: anchor.quote });
    if (result?.status !== 'found') continue;
    const from = sourceOffset(projection, result.from, 'start');
    const to = sourceOffset(projection, result.to, 'end');
    if (from !== null && to !== null && from < to)
      ranges.push({ from, to, sources: anchor.sources });
  }
  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
}
