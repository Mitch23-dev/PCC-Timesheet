export type EstimateRowType = "item" | "header" | "subtotal";

export type EstimateRow = {
  id: string;
  type: EstimateRowType;
  rowKind?: "custom" | "equipment" | "material";
  item: string;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
  notes: string;
  equipmentUnitId?: string;
  equipmentClassId?: string;
  attachmentId?: string;
  materialId?: string;
  cycleTimeHours?: string;
};

export type EstimateRecord = {
  id: string;
  quoteNumber: string;
  projectName: string;
  clientName: string;
  projectLocation: string;
  estimator: string;
  estimateDate: string;
  revision: string;
  expectedStart: string;
  expectedDuration: string;
  truckCycleTimeHours: string;
  status: "draft" | "quoted";
  notes: string;
  exclusions: string;
  rows: EstimateRow[];
  subtotal: number;
  createdAt: string;
  updatedAt: string;
  quoteId?: string | null;
};

export type QuoteRecord = {
  id: string;
  estimateId: string;
  quoteNumber: string;
  projectName: string;
  clientName: string;
  projectLocation: string;
  estimateTotal: number;
  revision: string;
  status: "draft" | "ready" | "sent" | "awarded" | "lost" | "cancelled" | "started";
  notes: string;
  createdAt: string;
  updatedAt: string;
  activeJobId?: string | null;
};

export type ActiveJobRecord = {
  id: string;
  quoteId: string;
  quoteNumber: string;
  jobNumber: string;
  projectName: string;
  clientName: string;
  projectLocation: string;
  contractValue: number;
  status: "active" | "on-hold";
  startedAt: string;
  completedAt?: string | null;
  notes: string;
};

export type CompletedJobRecord = {
  id: string;
  quoteId: string;
  activeJobId: string;
  quoteNumber: string;
  jobNumber: string;
  projectName: string;
  clientName: string;
  projectLocation: string;
  contractValue: number;
  startedAt: string;
  completedAt: string;
  notes: string;
};

export type PipelineData = {
  estimates: EstimateRecord[];
  quotes: QuoteRecord[];
  activeJobs: ActiveJobRecord[];
  completedJobs: CompletedJobRecord[];
};

export const PIPELINE_SETTINGS_KEY = "project_pipeline_v1";

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function emptyPipelineData(): PipelineData {
  return { estimates: [], quotes: [], activeJobs: [], completedJobs: [] };
}

export function parsePipelineData(value: unknown): PipelineData {
  if (!value || typeof value !== "object") return emptyPipelineData();
  const source = value as Partial<PipelineData>;
  return {
    estimates: Array.isArray(source.estimates) ? source.estimates as EstimateRecord[] : [],
    quotes: Array.isArray(source.quotes) ? source.quotes as QuoteRecord[] : [],
    activeJobs: Array.isArray(source.activeJobs) ? source.activeJobs as ActiveJobRecord[] : [],
    completedJobs: Array.isArray(source.completedJobs) ? source.completedJobs as CompletedJobRecord[] : [],
  };
}

export function asMoney(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

export function toNumber(value: string | number | null | undefined) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function computeRowAmount(row: EstimateRow): number {
  if (row.type === "header") return 0;
  if (row.type === "subtotal") return toNumber(row.amount);
  const manual = toNumber(row.amount);
  const qty = toNumber(row.quantity);
  const rate = toNumber(row.rate);
  return manual || qty * rate;
}

export function computeEstimateTotal(rows: EstimateRow[]): number {
  return rows.reduce((sum, row) => sum + computeRowAmount(row), 0);
}

export function createBlankEstimateRow(type: EstimateRowType = "item"): EstimateRow {
  return {
    id: createId("row"),
    type,
    item: "",
    description: "",
    unit: "",
    quantity: "",
    rate: "",
    amount: "",
    notes: "",
    rowKind: "custom",
    equipmentUnitId: "",
    equipmentClassId: "",
    attachmentId: "",
    materialId: "",
    cycleTimeHours: "",
  };
}

export function createBlankEstimateRecord(): EstimateRecord {
  const now = new Date().toISOString();
  return {
    id: createId("est"),
    quoteNumber: "",
    projectName: "",
    clientName: "",
    projectLocation: "",
    estimator: "",
    estimateDate: now.slice(0, 10),
    revision: "0",
    expectedStart: "",
    expectedDuration: "",
    truckCycleTimeHours: "",
    status: "draft",
    notes: "",
    exclusions: "",
    rows: [createBlankEstimateRow("header"), createBlankEstimateRow("item")],
    subtotal: 0,
    createdAt: now,
    updatedAt: now,
    quoteId: null,
  };
}

export function nextJobNumber(activeJobs: ActiveJobRecord[], completedJobs: CompletedJobRecord[]) {
  const all = [...activeJobs.map((j) => j.jobNumber), ...completedJobs.map((j) => j.jobNumber)];
  let max = 0;
  for (const value of all) {
    const match = String(value || "").match(/(\d+)/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `JOB-${String(max + 1).padStart(4, "0")}`;
}
