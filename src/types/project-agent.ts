import type { TikzDiffLine } from './acp';

export interface PaperFileChange {
  relativePath: string;
  before: string;
  after: string;
}

export interface ProjectPatchProposal {
  id: string;
  projectId: string;
  baseRevision: number;
  summary: string;
  rationale: string;
  status: 'pending' | 'applied' | 'rejected';
  files: Array<PaperFileChange & { diffLines: TikzDiffLine[] }>;
  appliedRevision?: number;
}

/** Reject aliases and traversal before looking a path up in the project's file index. */
export function isPaperFilePath(path: string): boolean {
  return path.length > 0 && path.length <= 1024 &&
    !/[\\:\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..' &&
      !part.startsWith('.') && !/[. ]$/.test(part)) &&
    /\.(tex|bib|sty|cls|tikz)$/i.test(path);
}

/** Canvas-backed .tikz files must go through canvas proposals, not a second writer. */
export function isEditablePaperPath(path: string): boolean {
  return isPaperFilePath(path) && !/\.tikz$/i.test(path);
}
