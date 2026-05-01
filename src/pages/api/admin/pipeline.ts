import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/adminAuth";
import {
  PipelineData,
  emptyPipelineData,
  EstimateRecord,
  QuoteRecord,
  ActiveJobRecord,
  CompletedJobRecord,
  createId,
  computeEstimateTotal,
  nextJobNumber,
  EstimateRow,
} from "@/lib/projectPipeline";

type EstimateTableRow = {
  id: string;
  quote_number: string | null;
  project_name: string | null;
  client_name: string | null;
  project_location: string | null;
  estimator: string | null;
  estimate_date: string | null;
  revision: string | null;
  expected_start: string | null;
  expected_duration: string | null;
  truck_cycle_time_hours: number | string | null;
  status: EstimateRecord["status"] | null;
  notes: string | null;
  exclusions: string | null;
  subtotal: number | string | null;
  quote_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type EstimateRowTableRow = {
  id: string;
  estimate_id: string;
  row_order: number | null;
  type: EstimateRow["type"] | null;
  row_kind: "custom" | "equipment" | "material" | null;
  item: string | null;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string | null;
  notes: string | null;
  equipment_unit_id: number | string | null;
  equipment_class_id: number | string | null;
  attachment_id: number | string | null;
  material_id: number | string | null;
  cycle_time_hours: number | string | null;
};

type QuoteTableRow = {
  id: string;
  estimate_id: string;
  quote_number: string | null;
  project_name: string | null;
  client_name: string | null;
  project_location: string | null;
  estimate_total: number | string | null;
  revision: string | null;
  status: QuoteRecord["status"] | null;
  notes: string | null;
  active_job_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ActiveJobTableRow = {
  id: string;
  quote_id: string;
  quote_number: string | null;
  job_number: string | null;
  project_name: string | null;
  client_name: string | null;
  project_location: string | null;
  contract_value: number | string | null;
  status: ActiveJobRecord["status"] | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type CompletedJobTableRow = {
  id: string;
  quote_id: string;
  active_job_id: string;
  quote_number: string | null;
  job_number: string | null;
  project_name: string | null;
  client_name: string | null;
  project_location: string | null;
  contract_value: number | string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeEstimateRow(row: EstimateRow, index: number) {
  return {
    id: row.id || createId("row"),
    row_order: index,
    type: row.type,
    row_kind: row.rowKind || "custom",
    item: asString(row.item),
    description: asString(row.description),
    unit: asString(row.unit),
    quantity: asString(row.quantity),
    rate: asString(row.rate),
    amount: asString(row.amount),
    notes: asString(row.notes),
    equipment_unit_id: row.equipmentUnitId ? Number(row.equipmentUnitId) : null,
    equipment_class_id: row.equipmentClassId ? Number(row.equipmentClassId) : null,
    attachment_id: row.attachmentId ? Number(row.attachmentId) : null,
    material_id: row.materialId ? Number(row.materialId) : null,
    cycle_time_hours: (() => {
      const raw = asString(row.cycleTimeHours);
      if (!raw.trim()) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
  };
}

function mapEstimateRows(rows: EstimateRowTableRow[]): EstimateRow[] {
  return rows
    .slice()
    .sort((a, b) => (a.row_order ?? 0) - (b.row_order ?? 0))
    .map((row) => ({
      id: row.id,
      type: (row.type || "item") as EstimateRow["type"],
      rowKind: (row.row_kind || "custom") as EstimateRow["rowKind"],
      item: row.item || "",
      description: row.description || "",
      unit: row.unit || "",
      quantity: row.quantity || "",
      rate: row.rate || "",
      amount: row.amount || "",
      notes: row.notes || "",
      equipmentUnitId: row.equipment_unit_id == null ? "" : String(row.equipment_unit_id),
      equipmentClassId: row.equipment_class_id == null ? "" : String(row.equipment_class_id),
      attachmentId: row.attachment_id == null ? "" : String(row.attachment_id),
      materialId: row.material_id == null ? "" : String(row.material_id),
      cycleTimeHours: row.cycle_time_hours == null ? "" : String(row.cycle_time_hours),
    }));
}

function mapEstimate(row: EstimateTableRow, estimateRows: EstimateRow[]): EstimateRecord {
  return {
    id: row.id,
    quoteNumber: row.quote_number || "",
    projectName: row.project_name || "",
    clientName: row.client_name || "",
    projectLocation: row.project_location || "",
    estimator: row.estimator || "",
    estimateDate: row.estimate_date || "",
    revision: row.revision || "0",
    expectedStart: row.expected_start || "",
    expectedDuration: row.expected_duration || "",
    truckCycleTimeHours: row.truck_cycle_time_hours == null ? "" : String(row.truck_cycle_time_hours),
    status: (row.status || "draft") as EstimateRecord["status"],
    notes: row.notes || "",
    exclusions: row.exclusions || "",
    rows: estimateRows,
    subtotal: asNumber(row.subtotal),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    quoteId: row.quote_id || null,
  };
}

function mapQuote(row: QuoteTableRow): QuoteRecord {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    quoteNumber: row.quote_number || "",
    projectName: row.project_name || "",
    clientName: row.client_name || "",
    projectLocation: row.project_location || "",
    estimateTotal: asNumber(row.estimate_total),
    revision: row.revision || "0",
    status: (row.status || "draft") as QuoteRecord["status"],
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    activeJobId: row.active_job_id || null,
  };
}

function mapActiveJob(row: ActiveJobTableRow): ActiveJobRecord {
  return {
    id: row.id,
    quoteId: row.quote_id,
    quoteNumber: row.quote_number || "",
    jobNumber: row.job_number || "",
    projectName: row.project_name || "",
    clientName: row.client_name || "",
    projectLocation: row.project_location || "",
    contractValue: asNumber(row.contract_value),
    status: (row.status || "active") as ActiveJobRecord["status"],
    startedAt: row.started_at || row.created_at || new Date().toISOString(),
    completedAt: row.completed_at || null,
    notes: row.notes || "",
  };
}

function mapCompletedJob(row: CompletedJobTableRow): CompletedJobRecord {
  return {
    id: row.id,
    quoteId: row.quote_id,
    activeJobId: row.active_job_id,
    quoteNumber: row.quote_number || "",
    jobNumber: row.job_number || "",
    projectName: row.project_name || "",
    clientName: row.client_name || "",
    projectLocation: row.project_location || "",
    contractValue: asNumber(row.contract_value),
    startedAt: row.started_at || row.created_at || new Date().toISOString(),
    completedAt: row.completed_at || new Date().toISOString(),
    notes: row.notes || "",
  };
}

async function loadPipeline(): Promise<PipelineData> {
  const [
    estimatesResult,
    estimateRowsResult,
    quotesResult,
    activeJobsResult,
    completedJobsResult,
  ] = await Promise.all([
    supabaseServer.from("estimates").select("*").order("created_at", { ascending: false }),
    supabaseServer.from("estimate_rows").select("*").order("estimate_id", { ascending: true }).order("row_order", { ascending: true }),
    supabaseServer.from("quotes").select("*").order("created_at", { ascending: false }),
    supabaseServer.from("active_jobs").select("*").order("started_at", { ascending: false }),
    supabaseServer.from("completed_jobs").select("*").order("completed_at", { ascending: false }),
  ]);

  const firstError = [
    estimatesResult.error,
    estimateRowsResult.error,
    quotesResult.error,
    activeJobsResult.error,
    completedJobsResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const estimateRowsByEstimate = new Map<string, EstimateRowTableRow[]>();
  for (const row of (estimateRowsResult.data || []) as EstimateRowTableRow[]) {
    const list = estimateRowsByEstimate.get(row.estimate_id) || [];
    list.push(row);
    estimateRowsByEstimate.set(row.estimate_id, list);
  }

  return {
    estimates: ((estimatesResult.data || []) as EstimateTableRow[]).map((row) =>
      mapEstimate(row, mapEstimateRows(estimateRowsByEstimate.get(row.id) || []))
    ),
    quotes: ((quotesResult.data || []) as QuoteTableRow[]).map(mapQuote),
    activeJobs: ((activeJobsResult.data || []) as ActiveJobTableRow[]).map(mapActiveJob),
    completedJobs: ((completedJobsResult.data || []) as CompletedJobTableRow[]).map(mapCompletedJob),
  };
}

async function saveEstimateToTables(estimate: EstimateRecord, now: string) {
  const normalizedRows = (Array.isArray(estimate.rows) ? estimate.rows : []).map(normalizeEstimateRow);
  const subtotal = computeEstimateTotal(Array.isArray(estimate.rows) ? estimate.rows : []);

  const estimatePayload = {
    id: estimate.id,
    quote_number: asString(estimate.quoteNumber),
    project_name: asString(estimate.projectName),
    client_name: asString(estimate.clientName),
    project_location: asString(estimate.projectLocation),
    estimator: asString(estimate.estimator),
    estimate_date: estimate.estimateDate || null,
    revision: asString(estimate.revision || "0"),
    expected_start: asString(estimate.expectedStart),
    expected_duration: asString(estimate.expectedDuration),
    truck_cycle_time_hours: (() => {
      const raw = asString(estimate.truckCycleTimeHours);
      if (!raw.trim()) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
    status: (estimate.status || "draft") as EstimateRecord["status"],
    notes: asString(estimate.notes),
    exclusions: asString(estimate.exclusions),
    subtotal,
    quote_id: estimate.quoteId || null,
    created_at: estimate.createdAt || now,
    updated_at: now,
  };

  const { error: estimateError } = await supabaseServer
    .from("estimates")
    .upsert(estimatePayload, { onConflict: "id" });
  if (estimateError) throw estimateError;

  const { error: deleteRowsError } = await supabaseServer
    .from("estimate_rows")
    .delete()
    .eq("estimate_id", estimate.id);
  if (deleteRowsError) throw deleteRowsError;

  if (normalizedRows.length) {
    const rowPayload = normalizedRows.map((row) => ({
      id: row.id,
      estimate_id: estimate.id,
      row_order: row.row_order,
      type: row.type,
      item: row.item,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rate: row.rate,
      amount: row.amount,
      notes: row.notes,
      row_kind: row.row_kind,
      equipment_unit_id: row.equipment_unit_id,
      equipment_class_id: row.equipment_class_id,
      attachment_id: row.attachment_id,
      material_id: row.material_id,
      cycle_time_hours: row.cycle_time_hours,
      created_at: now,
      updated_at: now,
    }));
    const { error: insertRowsError } = await supabaseServer.from("estimate_rows").insert(rowPayload);
    if (insertRowsError) throw insertRowsError;
  }

  return {
    ...estimate,
    rows: normalizedRows.map((row) => ({
      id: row.id,
      type: row.type,
      item: row.item,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rate: row.rate,
      amount: row.amount,
      notes: row.notes,
      rowKind: row.row_kind,
      equipmentUnitId: row.equipment_unit_id == null ? "" : String(row.equipment_unit_id),
      equipmentClassId: row.equipment_class_id == null ? "" : String(row.equipment_class_id),
      attachmentId: row.attachment_id == null ? "" : String(row.attachment_id),
      materialId: row.material_id == null ? "" : String(row.material_id),
      cycleTimeHours: row.cycle_time_hours == null ? "" : String(row.cycle_time_hours),
    })),
    subtotal,
    updatedAt: now,
    createdAt: estimate.createdAt || now,
  } satisfies EstimateRecord;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authError = requireAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  if (req.method === "GET") {
    try {
      const pipeline = await loadPipeline();
      return res.status(200).json({ ok: true, pipeline });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to load project pipeline" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const action = String(req.body?.action || "");
    const now = new Date().toISOString();

    if (action === "saveEstimate") {
      const estimate = req.body?.estimate as EstimateRecord;
      if (!estimate?.id) return res.status(400).json({ error: "Estimate is missing an id" });
      const normalized = await saveEstimateToTables(estimate, now);
      const pipeline = await loadPipeline();
      return res.status(200).json({ ok: true, pipeline, estimate: normalized });
    }

    if (action === "convertEstimateToQuote") {
      const estimateId = String(req.body?.estimateId || "");
      const pipeline = await loadPipeline();
      const estimate = pipeline.estimates.find((item) => item.id === estimateId);
      if (!estimate) return res.status(404).json({ error: "Estimate not found" });

      const quoteId = estimate.quoteId || createId("q");
      const total = computeEstimateTotal(estimate.rows || []);
      const quoteCountResult = await supabaseServer.from("quotes").select("id", { count: "exact", head: true });
      if (quoteCountResult.error) throw quoteCountResult.error;
      const quoteNumber = estimate.quoteNumber || `Q-${String((quoteCountResult.count || 0) + 1).padStart(4, "0")}`;

      const quotePayload = {
        id: quoteId,
        estimate_id: estimate.id,
        quote_number: quoteNumber,
        project_name: estimate.projectName,
        client_name: estimate.clientName,
        project_location: estimate.projectLocation,
        estimate_total: total,
        revision: estimate.revision || "0",
        status: "ready" as QuoteRecord["status"],
        notes: estimate.notes || "",
        active_job_id: null,
        created_at: now,
        updated_at: now,
      };
      const { error: quoteError } = await supabaseServer.from("quotes").upsert(quotePayload, { onConflict: "id" });
      if (quoteError) throw quoteError;

      const updatedEstimate = await saveEstimateToTables(
        {
          ...estimate,
          quoteNumber,
          quoteId,
          status: "quoted",
          subtotal: total,
        },
        now
      );

      const refreshedPipeline = await loadPipeline();
      const refreshedQuote = refreshedPipeline.quotes.find((item) => item.id === quoteId) || {
        id: quoteId,
        estimateId: estimate.id,
        quoteNumber,
        projectName: estimate.projectName,
        clientName: estimate.clientName,
        projectLocation: estimate.projectLocation,
        estimateTotal: total,
        revision: estimate.revision || "0",
        status: "ready",
        notes: estimate.notes || "",
        createdAt: now,
        updatedAt: now,
        activeJobId: null,
      };
      return res.status(200).json({ ok: true, pipeline: refreshedPipeline, quote: refreshedQuote, estimate: updatedEstimate });
    }

    if (action === "updateQuote") {
      const quote = req.body?.quote as Partial<QuoteRecord> & { id: string };
      if (!quote?.id) return res.status(400).json({ error: "Quote id is required" });
      const existing = await supabaseServer.from("quotes").select("*").eq("id", quote.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return res.status(404).json({ error: "Quote not found" });
      const current = mapQuote(existing.data as QuoteTableRow);
      const merged = { ...current, ...quote, updatedAt: now };
      const payload = {
        id: merged.id,
        estimate_id: merged.estimateId,
        quote_number: merged.quoteNumber,
        project_name: merged.projectName,
        client_name: merged.clientName,
        project_location: merged.projectLocation,
        estimate_total: merged.estimateTotal,
        revision: merged.revision,
        status: merged.status,
        notes: merged.notes,
        active_job_id: merged.activeJobId || null,
        created_at: current.createdAt || now,
        updated_at: now,
      };
      const { error } = await supabaseServer.from("quotes").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      const pipeline = await loadPipeline();
      return res.status(200).json({ ok: true, pipeline, quote: merged });
    }

    if (action === "startProject") {
      const quoteId = String(req.body?.quoteId || "");
      const pipeline = await loadPipeline();
      const quote = pipeline.quotes.find((item) => item.id === quoteId);
      if (!quote) return res.status(404).json({ error: "Quote not found" });
      if (quote.activeJobId && pipeline.activeJobs.some((item) => item.id === quote.activeJobId)) {
        return res.status(200).json({ ok: true, pipeline, activeJob: pipeline.activeJobs.find((item) => item.id === quote.activeJobId) });
      }

      const activeJobId = createId("job");
      const jobNumber = nextJobNumber(pipeline.activeJobs, pipeline.completedJobs);
      const activeJobPayload = {
        id: activeJobId,
        quote_id: quote.id,
        quote_number: quote.quoteNumber,
        job_number: jobNumber,
        project_name: quote.projectName,
        client_name: quote.clientName,
        project_location: quote.projectLocation,
        contract_value: quote.estimateTotal,
        status: "active" as ActiveJobRecord["status"],
        started_at: now,
        completed_at: null,
        notes: quote.notes || "",
        created_at: now,
        updated_at: now,
      };
      const { error: activeJobError } = await supabaseServer.from("active_jobs").insert(activeJobPayload);
      if (activeJobError) throw activeJobError;

      const { error: quoteError } = await supabaseServer
        .from("quotes")
        .update({ status: "started", active_job_id: activeJobId, updated_at: now })
        .eq("id", quote.id);
      if (quoteError) throw quoteError;

      const refreshedPipeline = await loadPipeline();
      const activeJob = refreshedPipeline.activeJobs.find((item) => item.id === activeJobId);
      return res.status(200).json({ ok: true, pipeline: refreshedPipeline, activeJob });
    }

    if (action === "updateActiveJob") {
      const job = req.body?.job as Partial<ActiveJobRecord> & { id: string };
      if (!job?.id) return res.status(400).json({ error: "Active job id is required" });
      const existing = await supabaseServer.from("active_jobs").select("*").eq("id", job.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return res.status(404).json({ error: "Active job not found" });
      const current = mapActiveJob(existing.data as ActiveJobTableRow);
      const merged = { ...current, ...job };
      const payload = {
        id: merged.id,
        quote_id: merged.quoteId,
        quote_number: merged.quoteNumber,
        job_number: merged.jobNumber,
        project_name: merged.projectName,
        client_name: merged.clientName,
        project_location: merged.projectLocation,
        contract_value: merged.contractValue,
        status: merged.status,
        started_at: merged.startedAt,
        completed_at: merged.completedAt || null,
        notes: merged.notes || "",
        updated_at: now,
      };
      const { error } = await supabaseServer.from("active_jobs").update(payload).eq("id", merged.id);
      if (error) throw error;
      const pipeline = await loadPipeline();
      return res.status(200).json({ ok: true, pipeline, activeJob: merged });
    }

    if (action === "completeJob") {
      const activeJobId = String(req.body?.activeJobId || "");
      const existing = await supabaseServer.from("active_jobs").select("*").eq("id", activeJobId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return res.status(404).json({ error: "Active job not found" });
      const activeJob = mapActiveJob(existing.data as ActiveJobTableRow);
      const completedId = createId("done");
      const completedPayload = {
        id: completedId,
        quote_id: activeJob.quoteId,
        active_job_id: activeJob.id,
        quote_number: activeJob.quoteNumber,
        job_number: activeJob.jobNumber,
        project_name: activeJob.projectName,
        client_name: activeJob.clientName,
        project_location: activeJob.projectLocation,
        contract_value: activeJob.contractValue,
        started_at: activeJob.startedAt,
        completed_at: now,
        notes: activeJob.notes || "",
        created_at: now,
        updated_at: now,
      };
      const { error: completedError } = await supabaseServer.from("completed_jobs").insert(completedPayload);
      if (completedError) throw completedError;

      const { error: deleteError } = await supabaseServer.from("active_jobs").delete().eq("id", activeJob.id);
      if (deleteError) throw deleteError;

      const { error: quoteError } = await supabaseServer
        .from("quotes")
        .update({ status: "awarded", updated_at: now })
        .eq("id", activeJob.quoteId);
      if (quoteError) throw quoteError;

      const refreshedPipeline = await loadPipeline();
      const completedJob = refreshedPipeline.completedJobs.find((item) => item.id === completedId);
      return res.status(200).json({ ok: true, pipeline: refreshedPipeline, completedJob });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Pipeline update failed" });
  }
}
