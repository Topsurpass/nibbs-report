"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	HANDOVER_TYPES,
	STATUS_PRESETS,
	type FraudAlert,
	type HandoverType,
	type Recommendation,
	type ScheduleReport,
	type SummaryCategory,
	type SummaryRow,
} from "@/lib/schedule/template";
import { downloadScheduleExcel } from "@/lib/schedule/exportSchedule";

type TabId = "cover" | "summary" | "fraud" | "recs";

interface Props {
	mode: "new" | "edit";
	initial: ScheduleReport;
	reportId?: string;
}

const rid = () =>
	typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);

const TABS: { id: TabId; label: string }[] = [
	{ id: "cover", label: "Cover page" },
	{ id: "summary", label: "Report Summary" },
	{ id: "fraud", label: "Fraud Alerts" },
	{ id: "recs", label: "Recommendations" },
];

const inputCls =
	"w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40";

// Module-level so inputs keep focus across re-renders (an inner component would
// be a new type each render and remount its children).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
			{children}
		</div>
	);
}

export default function ScheduleReportEditor({ mode, initial, reportId }: Props) {
	const router = useRouter();
	const [report, setReport] = useState<ScheduleReport>(initial);
	const [tab, setTab] = useState<TabId>("cover");
	const [dirty, setDirty] = useState(mode === "new");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedFlag, setSavedFlag] = useState(false);

	// ---- immutable updates ----
	const touch = () => {
		setDirty(true);
		setSavedFlag(false);
	};
	const setCover = (patch: Partial<ScheduleReport["cover"]>) => {
		setReport((r) => ({ ...r, cover: { ...r.cover, ...patch } }));
		touch();
	};
	const mapCats = (fn: (c: SummaryCategory) => SummaryCategory) => {
		setReport((r) => ({ ...r, summary: r.summary.map(fn) }));
		touch();
	};
	const setCategory = (catId: string, patch: Partial<SummaryCategory>) =>
		mapCats((c) => (c.id === catId ? { ...c, ...patch } : c));
	const setRow = (catId: string, rowId: string, patch: Partial<SummaryRow>) =>
		mapCats((c) =>
			c.id === catId
				? { ...c, rows: c.rows.map((rw) => (rw.id === rowId ? { ...rw, ...patch } : rw)) }
				: c,
		);
	const addRow = (catId: string) =>
		mapCats((c) =>
			c.id === catId
				? { ...c, rows: [...c.rows, { id: rid(), detail: "", findings: "", status: "Nil" }] }
				: c,
		);
	const removeRow = (catId: string, rowId: string) =>
		mapCats((c) => (c.id === catId ? { ...c, rows: c.rows.filter((rw) => rw.id !== rowId) } : c));
	const addCategory = () => {
		setReport((r) => ({
			...r,
			summary: [...r.summary, { id: rid(), task: "NEW TASK", description: "", rows: [] }],
		}));
		touch();
	};
	const removeCategory = (catId: string) => {
		setReport((r) => ({ ...r, summary: r.summary.filter((c) => c.id !== catId) }));
		touch();
	};

	const setAlert = (id: string, patch: Partial<FraudAlert>) => {
		setReport((r) => ({
			...r,
			fraudAlerts: r.fraudAlerts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
		}));
		touch();
	};
	const addAlert = () => {
		setReport((r) => ({
			...r,
			fraudAlerts: [
				...r.fraudAlerts,
				{ id: rid(), timeLogged: "", caseRef: "", description: "", status: "", escalatedTo: "", remarks: "" },
			],
		}));
		touch();
	};
	const removeAlert = (id: string) => {
		setReport((r) => ({ ...r, fraudAlerts: r.fraudAlerts.filter((a) => a.id !== id) }));
		touch();
	};

	const setRec = (id: string, text: string) => {
		setReport((r) => ({
			...r,
			recommendations: r.recommendations.map((x) => (x.id === id ? { ...x, text } : x)),
		}));
		touch();
	};
	const addRec = () => {
		setReport((r) => ({ ...r, recommendations: [...r.recommendations, { id: rid(), text: "" }] }));
		touch();
	};
	const removeRec = (id: string) => {
		setReport((r) => ({ ...r, recommendations: r.recommendations.filter((x) => x.id !== id) }));
		touch();
	};

	// ---- persistence ----
	const save = async () => {
		setError(null);
		if (!report.cover.date) {
			setError("Set the handover date on the Cover page.");
			setTab("cover");
			return;
		}
		setSaving(true);
		try {
			const res = await fetch(
				mode === "new" ? "/api/schedule-reports" : `/api/schedule-reports/${reportId}`,
				{
					method: mode === "new" ? "POST" : "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(report),
				},
			);
			const data = await res.json();
			if (!res.ok || !data.ok) {
				setError(data.error ?? "Couldn't save the report.");
				return;
			}
			setDirty(false);
			setSavedFlag(true);
			if (mode === "new") {
				router.replace(`/daily-reports/${data.report.id}`);
				router.refresh();
			}
		} catch {
			setError("Network error. Try again.");
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (mode !== "edit" || !reportId) return;
		if (!window.confirm("Delete this report? This cannot be undone.")) return;
		setDeleting(true);
		setError(null);
		try {
			const res = await fetch(`/api/schedule-reports/${reportId}`, { method: "DELETE" });
			const data = await res.json();
			if (!res.ok || !data.ok) {
				setError(data.error ?? "Couldn't delete the report.");
				setDeleting(false);
				return;
			}
			router.push("/daily-reports");
			router.refresh();
		} catch {
			setError("Network error. Try again.");
			setDeleting(false);
		}
	};

	return (
		<div>
			<datalist id="status-presets">
				{STATUS_PRESETS.map((s) => (
					<option key={s} value={s} />
				))}
			</datalist>

			<header className="hero-gradient text-white">
				<div className="px-6 py-8 sm:px-10">
					<Link href="/daily-reports" className="text-xs text-white/70 hover:text-white">
						← All reports
					</Link>
					<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
						{mode === "new" ? "New Daily Schedule Report" : "Edit Daily Schedule Report"}
					</h1>
					<p className="mt-1 text-sm text-white/80">
						{report.cover.handoverType} · {report.cover.date || "no date"}
					</p>
				</div>
			</header>

			{/* Action bar */}
			<div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-surface/90 px-6 py-3 backdrop-blur sm:px-10">
				<div className="flex flex-wrap gap-1">
					{TABS.map((t) => (
						<button
							key={t.id}
							onClick={() => setTab(t.id)}
							className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
								tab === t.id
									? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
									: "text-muted hover:bg-black/5 dark:hover:bg-white/5"
							}`}
						>
							{t.label}
						</button>
					))}
				</div>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<button
						onClick={() => downloadScheduleExcel(report)}
						className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
					>
						⬇ Export .xlsx
					</button>
					{mode === "edit" && (
						<button
							onClick={remove}
							disabled={deleting}
							className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
						>
							{deleting ? "Deleting…" : "Delete"}
						</button>
					)}
					<button
						onClick={save}
						disabled={saving || (!dirty && mode === "edit")}
						className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{saving ? "Saving…" : dirty ? "Save" : savedFlag ? "✓ Saved" : "Saved"}
					</button>
				</div>
			</div>

			<div className="px-6 py-6 sm:px-10">
				{error && (
					<div
						role="alert"
						className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
					>
						{error}
					</div>
				)}

				{tab === "cover" && <CoverTab report={report} setCover={setCover} />}
				{tab === "summary" && (
					<SummaryTab
						report={report}
						setCategory={setCategory}
						setRow={setRow}
						addRow={addRow}
						removeRow={removeRow}
						addCategory={addCategory}
						removeCategory={removeCategory}
					/>
				)}
				{tab === "fraud" && (
					<FraudTab report={report} setAlert={setAlert} addAlert={addAlert} removeAlert={removeAlert} />
				)}
				{tab === "recs" && (
					<RecsTab report={report} setRec={setRec} addRec={addRec} removeRec={removeRec} />
				)}
			</div>
		</div>
	);
}

/* ---------------- Cover tab ---------------- */
function CoverTab({
	report,
	setCover,
}: {
	report: ScheduleReport;
	setCover: (patch: Partial<ScheduleReport["cover"]>) => void;
}) {
	const c = report.cover;
	return (
		<div className="max-w-2xl space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
			<Field label="Department">
				<input className={inputCls} value={c.department} onChange={(e) => setCover({ department: e.target.value })} />
			</Field>
			<Field label="Handover Type">
				<select
					className={inputCls}
					value={c.handoverType}
					onChange={(e) => setCover({ handoverType: e.target.value as HandoverType })}
				>
					{HANDOVER_TYPES.map((h) => (
						<option key={h} value={h}>
							{h}
						</option>
					))}
				</select>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Date">
					<input type="date" className={inputCls} value={c.date} onChange={(e) => setCover({ date: e.target.value })} />
				</Field>
				<Field label="Time of Handover">
					<input
						className={inputCls}
						placeholder="e.g. 8:30pm"
						value={c.timeOfHandover}
						onChange={(e) => setCover({ timeOfHandover: e.target.value })}
					/>
				</Field>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Outgoing Officer(s)">
					<input className={inputCls} value={c.outgoingOfficers} onChange={(e) => setCover({ outgoingOfficers: e.target.value })} />
				</Field>
				<Field label="Incoming Officer(s)">
					<input className={inputCls} value={c.incomingOfficers} onChange={(e) => setCover({ incomingOfficers: e.target.value })} />
				</Field>
			</div>
			<p className="text-xs text-muted">
				Signature lines are added as blank rows in the exported Excel for officers to sign.
			</p>
		</div>
	);
}

/* ---------------- Report Summary tab ---------------- */
function SummaryTab({
	report,
	setCategory,
	setRow,
	addRow,
	removeRow,
	addCategory,
	removeCategory,
}: {
	report: ScheduleReport;
	setCategory: (catId: string, patch: Partial<SummaryCategory>) => void;
	setRow: (catId: string, rowId: string, patch: Partial<SummaryRow>) => void;
	addRow: (catId: string) => void;
	removeRow: (catId: string, rowId: string) => void;
	addCategory: () => void;
	removeCategory: (catId: string) => void;
}) {
	return (
		<div className="space-y-5">
			{report.summary.map((cat) => (
				<div key={cat.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
					<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
						<input
							value={cat.task}
							onChange={(e) => setCategory(cat.id, { task: e.target.value })}
							className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold uppercase tracking-wide outline-none focus:ring-2 focus:ring-indigo-500/40"
						/>
						<input
							value={cat.description}
							placeholder="Description (optional)"
							onChange={(e) => setCategory(cat.id, { description: e.target.value })}
							className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
						/>
						<button
							onClick={() => removeCategory(cat.id)}
							className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
							title="Remove category"
						>
							Remove category
						</button>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
									<th className="px-3 py-2 font-semibold">Details</th>
									<th className="px-3 py-2 font-semibold">Summary / Findings</th>
									<th className="px-3 py-2 font-semibold">Status</th>
									<th className="px-2 py-2"></th>
								</tr>
							</thead>
							<tbody>
								{cat.rows.map((row) => (
									<tr key={row.id} className="border-t border-border">
										<td className="px-3 py-1.5">
											<input className={inputCls} value={row.detail} onChange={(e) => setRow(cat.id, row.id, { detail: e.target.value })} />
										</td>
										<td className="px-3 py-1.5">
											<input className={inputCls} value={row.findings} onChange={(e) => setRow(cat.id, row.id, { findings: e.target.value })} />
										</td>
										<td className="px-3 py-1.5">
											<input
												className={inputCls}
												list="status-presets"
												value={row.status}
												onChange={(e) => setRow(cat.id, row.id, { status: e.target.value })}
											/>
										</td>
										<td className="px-2 py-1.5 text-center">
											<button
												onClick={() => removeRow(cat.id, row.id)}
												className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
												title="Remove row"
											>
												✕
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="border-t border-border px-4 py-2">
						<button
							onClick={() => addRow(cat.id)}
							className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300"
						>
							+ Add row
						</button>
					</div>
				</div>
			))}
			<button
				onClick={addCategory}
				className="rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5"
			>
				+ Add category
			</button>
		</div>
	);
}

/* ---------------- Fraud Alerts tab ---------------- */
function FraudTab({
	report,
	setAlert,
	addAlert,
	removeAlert,
}: {
	report: ScheduleReport;
	setAlert: (id: string, patch: Partial<FraudAlert>) => void;
	addAlert: () => void;
	removeAlert: (id: string) => void;
}) {
	const cols: { key: keyof Omit<FraudAlert, "id">; label: string }[] = [
		{ key: "timeLogged", label: "Time Logged" },
		{ key: "caseRef", label: "Case Reference/ID" },
		{ key: "description", label: "Description" },
		{ key: "status", label: "Status" },
		{ key: "escalatedTo", label: "Escalated To" },
		{ key: "remarks", label: "Remarks" },
	];
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted">Log any fraud incidents detected during the shift.</p>
			<div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
								{cols.map((c) => (
									<th key={c.key} className="px-3 py-2 font-semibold">
										{c.label}
									</th>
								))}
								<th className="px-2 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{report.fraudAlerts.map((a) => (
								<tr key={a.id} className="border-t border-border">
									{cols.map((c) => (
										<td key={c.key} className="px-3 py-1.5">
											<input className={inputCls} value={a[c.key]} onChange={(e) => setAlert(a.id, { [c.key]: e.target.value })} />
										</td>
									))}
									<td className="px-2 py-1.5 text-center">
										<button
											onClick={() => removeAlert(a.id)}
											className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
											title="Remove row"
										>
											✕
										</button>
									</td>
								</tr>
							))}
							{report.fraudAlerts.length === 0 && (
								<tr>
									<td colSpan={cols.length + 1} className="px-3 py-6 text-center text-sm text-muted">
										No incidents logged.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="border-t border-border px-4 py-2">
					<button
						onClick={addAlert}
						className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300"
					>
						+ Add incident
					</button>
				</div>
			</div>
		</div>
	);
}

/* ---------------- Recommendations tab ---------------- */
function RecsTab({
	report,
	setRec,
	addRec,
	removeRec,
}: {
	report: ScheduleReport;
	setRec: (id: string, text: string) => void;
	addRec: () => void;
	removeRec: (id: string) => void;
}) {
	return (
		<div className="max-w-2xl space-y-3">
			<p className="text-sm text-muted">
				Suggestions or priority actions for the incoming shift.
			</p>
			<div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
				{report.recommendations.map((rec, i) => (
					<div key={rec.id} className="flex items-center gap-2">
						<span className="tnum w-6 text-right text-sm text-muted">{i + 1}.</span>
						<input className={inputCls} value={rec.text} onChange={(e) => setRec(rec.id, e.target.value)} />
						<button
							onClick={() => removeRec(rec.id)}
							className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
							title="Remove"
						>
							✕
						</button>
					</div>
				))}
				{report.recommendations.length === 0 && (
					<p className="py-4 text-center text-sm text-muted">No recommendations yet.</p>
				)}
				<button
					onClick={addRec}
					className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300"
				>
					+ Add recommendation
				</button>
			</div>
		</div>
	);
}
