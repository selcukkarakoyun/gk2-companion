export type Box = { x: number; y: number; w: number; h: number };

export type Material = { id: string; name: string; description: string; icon?: string };
export type Requirement = { materialId: string; amount: number };
export type Building = {
  id: string;
  area: string;
  name: string;
  qty: number;
  built: boolean;
  requirements: Requirement[];
};
export type AppState = { version: 2; materials: Material[]; buildings: Building[] };
export type Settings = { apiKey: string; model: string };
export type Tab = 'buildings' | 'total' | 'settings';

export type ScannedRequirement = {
  materialId: string | null;
  suggestedName: string | null;
  description: string | null;
  amount: number;
  box: Box | null;
};
export type ScannedBuilding = { name: string; requirements: ScannedRequirement[] };
export type ScanResult = { area: string | null; buildings: ScannedBuilding[] };

export type ReviewNewMaterial = {
  key: string;
  name: string;
  description: string;
  mapTo: string | null;
  icon: string | null;
  box: Box | null;
};
export type ReviewRequirement = {
  key: string;
  materialId: string | null;
  newKey: string | null;
  amount: number;
  box: Box | null;
};
export type ReviewBuilding = { key: string; name: string; include: boolean; requirements: ReviewRequirement[] };
export type ReviewIconFill = { materialId: string; icon: string | null; box: Box | null; accept: boolean };
export type ReviewDraft = {
  area: string;
  skippedEmpty: number;
  buildings: ReviewBuilding[];
  newMaterials: ReviewNewMaterial[];
  iconFills: ReviewIconFill[];
};
