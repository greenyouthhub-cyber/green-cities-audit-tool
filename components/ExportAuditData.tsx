"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

type AuditRow = Record<string, unknown>;

type ColumnMeta = {
  key: string;
  label: string;
};

const DEFAULT_FIELDS = [
  "submission_created_at",
  "email",
  "submission_city",
  "submission_country",
  "submission_age_group",
  "block_name",
  "item_code",
  "item_question",
  "item_score",
  "item_explanation",
  "block_score",
  "main_problem",
  "suggestion_text",
];

const HIDDEN_FIELDS = ["means_json", "media_evidence_json", "roadmaps_json"];

function prettifyLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeCSV(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function toAuditRows(data: unknown): AuditRow[] {
  return Array.isArray(data) ? (data as unknown as AuditRow[]) : [];
}

export default function ExportAuditData() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>(DEFAULT_FIELDS);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [countryFilter, setCountryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [ageGroupFilter, setAgeGroupFilter] = useState("");
  const [blockFilter, setBlockFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadPreview();
  }, []);

  async function loadPreview() {
    try {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("audit_export_all")
        .select("*")
        .limit(50);

      if (error) throw error;

      const safeData = toAuditRows(data);
      setRows(safeData);

      if (safeData.length > 0) {
        const keys = Object.keys(safeData[0]).filter((key) => !HIDDEN_FIELDS.includes(key));
        const builtColumns = keys.map((key) => ({
          key,
          label: prettifyLabel(key),
        }));
        setColumns(builtColumns);

        const validDefaults = DEFAULT_FIELDS.filter((field) => keys.includes(field));
        if (validDefaults.length > 0) {
          setSelectedFields(validDefaults);
        } else {
          setSelectedFields(keys.slice(0, 12));
        }
      } else {
        setColumns([]);
        setSelectedFields([]);
        setMessage("The view returned no preview records.");
      }
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Error loading the view.");
    } finally {
      setLoading(false);
    }
  }

  const allSelected = useMemo(() => {
    return columns.length > 0 && selectedFields.length === columns.length;
  }, [columns, selectedFields]);

  const uniqueCountries = useMemo(() => {
    return [...new Set(rows.map((r) => String(r.submission_country ?? "")).filter(Boolean))].sort();
  }, [rows]);

  const uniqueAgeGroups = useMemo(() => {
    return [...new Set(rows.map((r) => String(r.submission_age_group ?? "")).filter(Boolean))].sort();
  }, [rows]);

  const uniqueBlocks = useMemo(() => {
    return [...new Set(rows.map((r) => String(r.block_name ?? "")).filter(Boolean))].sort();
  }, [rows]);

  function toggleField(field: string) {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  function selectAll() {
    setSelectedFields(columns.map((c) => c.key));
  }

  function clearAll() {
    setSelectedFields([]);
  }

  async function fetchFilteredData() {
    if (selectedFields.length === 0) {
      throw new Error("Select at least one field.");
    }

    let query = supabase
      .from("audit_export_all")
      .select(selectedFields.join(","))
      .order("submission_created_at", { ascending: false });

    if (countryFilter) {
      query = query.eq("submission_country", countryFilter);
    }

    if (cityFilter) {
      query = query.ilike("submission_city", `%${cityFilter}%`);
    }

    if (ageGroupFilter) {
      query = query.eq("submission_age_group", ageGroupFilter);
    }

    if (blockFilter) {
      query = query.eq("block_name", blockFilter);
    }

    if (dateFrom) {
      query = query.gte("submission_created_at", `${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      query = query.lte("submission_created_at", `${dateTo}T23:59:59`);
    }

    const { data, error } = await query.limit(5000);

    if (error) throw error;

    return toAuditRows(data);
  }

  function formatRowsForExport(data: AuditRow[]) {
    return data.map((row) => {
      const formatted: Record<string, string | number | boolean> = {};

      selectedFields.forEach((field) => {
        const label = columns.find((c) => c.key === field)?.label ?? field;
        formatted[label] = normalizeCellValue(row[field]);
      });

      return formatted;
    });
  }

  function downloadCSV(data: Record<string, string | number | boolean>[]) {
    if (!data.length) {
      setMessage("No data available to export.");
      return;
    }

    const headers = Object.keys(data[0]);
    const lines = [
      headers.join(","),
      ...data.map((row) => headers.map((h) => escapeCSV(row[h])).join(",")),
    ];

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_export_all_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadXLSX(data: Record<string, string | number | boolean>[]) {
    if (!data.length) {
      setMessage("No data available to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Export");

    XLSX.writeFile(workbook, `audit_export_all_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleExport(type: "csv" | "xlsx") {
    try {
      setLoading(true);
      setMessage("");

      const rawData = await fetchFilteredData();
      const exportData = formatRowsForExport(rawData);

      if (type === "csv") {
        downloadCSV(exportData);
      } else {
        downloadXLSX(exportData);
      }

      setMessage(`${type.toUpperCase()} export completed.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Export error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-[#10472f]">Export data</h2>
        <p className="text-sm text-gray-600">
          Select the fields from the view <code>audit_export_all</code> and download the result as CSV or Excel.
        </p>
      </div>

      <div className="grid md:grid-cols-6 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Country</label>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {uniqueCountries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">City</label>
          <input
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            placeholder="E.g. Vigo"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Age group</label>
          <select
            value={ageGroupFilter}
            onChange={(e) => setAgeGroupFilter(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {uniqueAgeGroups.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Block</label>
          <select
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {uniqueBlocks.map((block) => (
              <option key={block} value={block}>
                {block}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Select all
          </button>

          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Clear
          </button>

          <span className="text-sm text-gray-600 self-center">
            {allSelected
              ? "All fields selected"
              : `${selectedFields.length} fields selected`}
          </span>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {columns.map((column) => (
            <label
              key={column.key}
              className="flex items-start gap-2 rounded-lg border p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedFields.includes(column.key)}
                onChange={() => toggleField(column.key)}
                className="mt-1"
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={loading}
          className="rounded-xl bg-[#10472f] px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Download CSV"}
        </button>

        <button
          type="button"
          onClick={() => handleExport("xlsx")}
          disabled={loading}
          className="rounded-xl bg-[#7dd420] px-4 py-2 text-[#10472f] font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Download Excel"}
        </button>
      </div>

      {message && <p className="text-center text-sm text-gray-700">{message}</p>}
    </section>
  );
}