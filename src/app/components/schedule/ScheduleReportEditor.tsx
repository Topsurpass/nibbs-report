"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	CATEGORY_PRESETS,
	HANDOVER_TYPES,
	STATUS_OPTIONS,
	nibss,
	type FraudAlert,
	type HandoverType,
	type ScheduleReport,
	type SummaryCategory,
	type SummaryRow,
} from "@/lib/schedule/template";
import { scheduleFileName } from "@/lib/schedule/exportSchedule";
import {
	getBreachRows,
	clearBreachRows,
	mergeRows,
	pendingBreachDates,
} from "@/stores/nibbsBreachBuffer";

type TabId = "cover" | "summary" | "fraud" | "recs";

export interface DirectoryUser {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
}

interface Props {
	mode: "new" | "edit";
	initial: ScheduleReport;
	reportId?: string;
	users: DirectoryUser[];
	currentUserName?: string;
}

const rid = () =>
	typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);

const fullName = (u: DirectoryUser) => `${u.firstName} ${u.lastName}`.trim();

/** Editable default body for the send-report email, greeting the recipient. */
const defaultScheduleMessage = (firstName: string) =>
	`Dear ${firstName || "team"},\n\nKindly find attached daily schedule report.`;

const TABS: { id: TabId; label: string }[] = [
	{ id: "cover", label: "Cover page" },
	{ id: "summary", label: "Report Summary" },
	{ id: "fraud", label: "Fraud Alerts" },
	{ id: "recs", label: "Recommendations" },
];

const inputCls =
	"w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
			{children}
		</div>
	);
}

export default function ScheduleReportEditor({ mode, initial, reportId, users, currentUserName }: Props) {
	const router = useRouter();
	const [report, setReport] = useState<ScheduleReport>(initial);
	const [tab, setTab] = useState<TabId>("cover");
	const [dirty, setDirty] = useState(mode === "new");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [savedFlag, setSavedFlag] = useState(false);
	const [showSend, setShowSend] = useState(false);

	// Tracked in refs so async flows (save-then-send) read the live values without
	// stale closures. `persisted` flips true once a new report has an id.
	const idRef = useRef<string | undefined>(reportId);
	const persistedRef = useRef(mode === "edit");

	// Drain any NIBSS breach rows the Settlement Auditor queued for the report's
	// current date into the "nibss" summary category. Re-runs when the cover date
	// changes, so rows still land when the audit was for a different day than the
	// report opened on (just set the handover date to match). Idempotent: rows
	// dedupe, and each date is drained once per session so a manually removed row
	// doesn't reappear. The buffer is cleared on save — not here — so a re-render,
	// StrictMode double-invoke, or navigation can't lose queued rows. Runs in an
	// effect (not a useState initializer) because localStorage is empty during SSR.
	const drainedDatesRef = useRef<Set<string>>(new Set());
	const [otherPendingDates, setOtherPendingDates] = useState<string[]>([]);
	/* eslint-disable react-hooks/set-state-in-effect */
	useEffect(() => {
		const date = report.cover.date;

		if (date && !drainedDatesRef.current.has(date)) {
			const buffered = getBreachRows(date);
			if (buffered.length > 0) {
				drainedDatesRef.current.add(date);
				setReport((r) => {
					const hasNibss = r.summary.some((c) => c.id === "nibss");
					const summary = hasNibss
						? r.summary.map((c) =>
								c.id === "nibss" ? { ...c, rows: mergeRows(c.rows, buffered) } : c,
							)
						: [...r.summary, { ...nibss(), rows: mergeRows(nibss().rows, buffered) }];
					return { ...r, summary };
				});
				setDirty(true);
				setSavedFlag(false);
				setNotice(
					`Added ${buffered.length} NIBBS breach row${buffered.length === 1 ? "" : "s"} from the Settlement Auditor.`,
				);
			}
		}

		// Surface breach rows queued for a *different* date so the analyst knows to
		// set the handover date to match.
		setOtherPendingDates(pendingBreachDates().filter((d) => d !== date));
	}, [report.cover.date]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const officerNames = useMemo(() => {
		const seen = new Set<string>();
		const names: string[] = [];
		for (const u of users) {
			const n = fullName(u);
			if (n && !seen.has(n)) {
				seen.add(n);
				names.push(n);
			}
		}
		return names;
	}, [users]);

	const touch = () => {
		setDirty(true);
		setSavedFlag(false);
	};

	// ---- cover ----
	const setCover = (patch: Partial<ScheduleReport["cover"]>) => {
		setReport((r) => ({ ...r, cover: { ...r.cover, ...patch } }));
		touch();
	};
	const setOfficers = (kind: "outgoingOfficers" | "incomingOfficers", list: string[]) =>
		setCover({ [kind]: list } as Partial<ScheduleReport["cover"]>);

	// ---- summary ----
	const mapCats = (fn: (c: SummaryCategory) => SummaryCategory) => {
		setReport((r) => ({ ...r, summary: r.summary.map(fn) }));
		touch();
	};
	const setCategory = (catId: string, patch: Partial<SummaryCategory>) =>
		mapCats((c) => (c.id === catId ? { ...c, ...patch } : c));
	const setRow = (catId: string, rowId: string, patch: Partial<SummaryRow>) =>
		mapCats((c) =>
			c.id === catId ? { ...c, rows: c.rows.map((rw) => (rw.id === rowId ? { ...rw, ...patch } : rw)) } : c,
		);
	const addRow = (catId: string) =>
		mapCats((c) =>
			c.id === catId ? { ...c, rows: [...c.rows, { id: rid(), detail: "", findings: "", status: "Nil" }] } : c,
		);
	const removeRow = (catId: string, rowId: string) =>
		mapCats((c) => (c.id === catId ? { ...c, rows: c.rows.filter((rw) => rw.id !== rowId) } : c));
	const removeCategory = (catId: string) => {
		setReport((r) => ({ ...r, summary: r.summary.filter((c) => c.id !== catId) }));
		touch();
	};
	const addCategory = (presetKey: string) => {
		let cat: SummaryCategory;
		if (presetKey === "custom") {
			cat = { id: rid(), task: "NEW TASK", description: "", rows: [] };
		} else {
			const preset = CATEGORY_PRESETS.find((p) => p.key === presetKey);
			if (!preset) return;
			const base = preset.make();
			cat = { ...base, id: rid(), rows: base.rows.map((rw) => ({ ...rw, id: rid() })) };
		}
		setReport((r) => ({ ...r, summary: [...r.summary, cat] }));
		touch();
	};

	// ---- fraud + recs ----
	const setAlert = (id: string, patch: Partial<FraudAlert>) => {
		setReport((r) => ({ ...r, fraudAlerts: r.fraudAlerts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
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
		setReport((r) => ({ ...r, recommendations: r.recommendations.map((x) => (x.id === id ? { ...x, text } : x)) }));
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
	/** Save (POST when new, PUT once persisted). Returns the id, or null. */
	const saveReport = async (navigate: boolean): Promise<string | null> => {
		setError(null);
		if (!report.cover.date) {
			setError("Set the handover date on the Cover page.");
			setTab("cover");
			return null;
		}
		if (report.cover.outgoingOfficers.filter(Boolean).length === 0) {
			setError("Add at least one outgoing officer on the Cover page.");
			setTab("cover");
			return null;
		}
		setSaving(true);
		try {
			const isNew = !persistedRef.current;
			const res = await fetch(
				isNew ? "/api/schedule-reports" : `/api/schedule-reports/${idRef.current}`,
				{
					method: isNew ? "POST" : "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(report),
				},
			);
			const data = await res.json();
			if (!res.ok || !data.ok) {
				setError(data.error ?? "Couldn't save the report.");
				return null;
			}
			const id = data.report.id as string;
			idRef.current = id;
			persistedRef.current = true;
			setDirty(false);
			setSavedFlag(true);
			// The queued breach rows are now persisted in the report; drop the buffer
			// for this date so it won't re-merge into a future report.
			clearBreachRows(report.cover.date);
			setOtherPendingDates(pendingBreachDates().filter((d) => d !== report.cover.date));
			if (isNew && navigate) {
				router.replace(`/daily-reports/${id}`);
				router.refresh();
			}
			return id;
		} catch {
			setError("Network error. Try again.");
			return null;
		} finally {
			setSaving(false);
		}
	};

	/** Ensure the report is persisted (for send/export by id); returns the id. */
	const ensureSaved = async (): Promise<string | null> => {
		if (persistedRef.current && !dirty) return idRef.current ?? null;
		return saveReport(false); // no navigation, so the send modal survives
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

	const exportXlsx = async () => {
		setError(null);
		setExporting(true);
		try {
			const res = await fetch("/api/schedule-reports/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(report),
			});
			if (!res.ok) {
				const d = await res.json().catch(() => null);
				setError(d?.error ?? "Export failed.");
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = scheduleFileName(report);
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch {
			setError("Export failed.");
		} finally {
			setExporting(false);
		}
	};

	const openSend = () => {
		setError(null);
		setNotice(null);
		setShowSend(true); // instant; the report is saved inside the modal on send
	};

	return (
		<div>
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
						onClick={exportXlsx}
						disabled={exporting}
						className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
					>
						{exporting ? "Building…" : "⬇ Export .xlsx"}
					</button>
					<button
						onClick={openSend}
						disabled={saving}
						className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
					>
						✉ Send
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
						onClick={() => saveReport(true)}
						disabled={saving || (!dirty && persistedRef.current)}
						className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{saving ? "Saving…" : dirty ? "Save" : savedFlag ? "✓ Saved" : "Saved"}
					</button>
				</div>
			</div>

			<div className="px-6 py-6 sm:px-10">
				{error && (
					<div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
						{error}
					</div>
				)}
				{notice && (
					<div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-700 dark:text-teal-300">
						{notice}
					</div>
				)}
				{otherPendingDates.length > 0 && (
					<div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
						<span>
							Breach rows are waiting from the Settlement Auditor for{" "}
							{otherPendingDates.join(", ")}. Set the handover date to match to add them.
						</span>
						{otherPendingDates.map((d) => (
							<button
								key={d}
								type="button"
								onClick={() => setCover({ date: d })}
								className="rounded border border-amber-500/50 px-2 py-0.5 text-xs font-semibold hover:bg-amber-500/20"
							>
								Use {d}
							</button>
						))}
					</div>
				)}

				{tab === "cover" && (
					<CoverTab report={report} setCover={setCover} setOfficers={setOfficers} officerNames={officerNames} currentUserName={currentUserName} />
				)}
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
				{tab === "fraud" && <FraudTab report={report} setAlert={setAlert} addAlert={addAlert} removeAlert={removeAlert} />}
				{tab === "recs" && <RecsTab report={report} setRec={setRec} addRec={addRec} removeRec={removeRec} />}
			</div>

			{showSend && (
				<SendModal
					users={users}
					ensureSaved={ensureSaved}
					onClose={() => setShowSend(false)}
					onSent={(msg) => {
						setShowSend(false);
						setNotice(msg);
						// A brand-new report is now persisted; point the URL at it.
						if (mode === "new" && idRef.current) {
							router.replace(`/daily-reports/${idRef.current}`);
							router.refresh();
						}
					}}
				/>
			)}
		</div>
	);
}

/* ---------------- Cover tab ---------------- */
function OfficerPicker({
	label,
	values,
	options,
	onChange,
}: {
	label: string;
	values: string[];
	options: string[];
	onChange: (list: string[]) => void;
}) {
	const set = (i: number, v: string) => onChange(values.map((x, idx) => (idx === i ? v : x)));
	const add = () => onChange([...values, ""]);
	const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));
	const rows = values.length ? values : [""];
	return (
		<Field label={label}>
			<div className="space-y-2">
				{rows.map((val, i) => {
					const opts = val && !options.includes(val) ? [val, ...options] : options;
					return (
						<div key={i} className="flex items-center gap-2">
							<select
								className={inputCls}
								value={val}
								onChange={(e) => {
									if (values.length === 0) onChange([e.target.value]);
									else set(i, e.target.value);
								}}
							>
								<option value="">Select officer…</option>
								{opts.map((o) => (
									<option key={o} value={o}>
										{o}
									</option>
								))}
							</select>
							{values.length > 1 && (
								<button
									onClick={() => remove(i)}
									className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
									title="Remove officer"
								>
									✕
								</button>
							)}
						</div>
					);
				})}
				<button onClick={add} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">
					+ Add officer
				</button>
			</div>
		</Field>
	);
}

function CoverTab({
	report,
	setCover,
	setOfficers,
	officerNames,
	currentUserName,
}: {
	report: ScheduleReport;
	setCover: (patch: Partial<ScheduleReport["cover"]>) => void;
	setOfficers: (kind: "outgoingOfficers" | "incomingOfficers", list: string[]) => void;
	officerNames: string[];
	currentUserName?: string;
}) {
	const c = report.cover;
	// Ensure the signed-in officer is always an option even if not in the directory.
	const outgoingOpts = currentUserName && !officerNames.includes(currentUserName) ? [currentUserName, ...officerNames] : officerNames;
	return (
		<div className="max-w-2xl space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
			<Field label="Department">
				<input className={inputCls} value={c.department} onChange={(e) => setCover({ department: e.target.value })} />
			</Field>
			<Field label="Handover Type">
				<select className={inputCls} value={c.handoverType} onChange={(e) => setCover({ handoverType: e.target.value as HandoverType })}>
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
					<input className={inputCls} placeholder="e.g. 8:30pm" value={c.timeOfHandover} onChange={(e) => setCover({ timeOfHandover: e.target.value })} />
				</Field>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<OfficerPicker label="Outgoing Officer(s)" values={c.outgoingOfficers} options={outgoingOpts} onChange={(list) => setOfficers("outgoingOfficers", list)} />
				<OfficerPicker label="Incoming Officer(s)" values={c.incomingOfficers} options={officerNames} onChange={(list) => setOfficers("incomingOfficers", list)} />
			</div>
			<p className="text-xs text-muted">
				Officers are chosen from the user list. Signature lines are added as blank rows in the exported Excel.
			</p>
		</div>
	);
}

/* ---------------- Report Summary tab ---------------- */
function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	const opts = (STATUS_OPTIONS as readonly string[]).includes(value) ? STATUS_OPTIONS : [value, ...STATUS_OPTIONS];
	return (
		<select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
			{opts.map((o) => (
				<option key={o} value={o}>
					{o}
				</option>
			))}
		</select>
	);
}

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
	addCategory: (presetKey: string) => void;
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
						<button onClick={() => removeCategory(cat.id)} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400" title="Remove category">
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
											<StatusSelect value={row.status} onChange={(v) => setRow(cat.id, row.id, { status: v })} />
										</td>
										<td className="px-2 py-1.5 text-center">
											<button onClick={() => removeRow(cat.id, row.id)} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400" title="Remove row">
												✕
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="border-t border-border px-4 py-2">
						<button onClick={() => addRow(cat.id)} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">
							+ Add row
						</button>
					</div>
				</div>
			))}

			<div className="flex items-center gap-2">
				<label className="text-sm font-medium text-foreground">Add category:</label>
				<select
					value=""
					onChange={(e) => {
						if (e.target.value) addCategory(e.target.value);
						e.target.value = "";
					}}
					className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
				>
					<option value="">Choose…</option>
					{CATEGORY_PRESETS.map((p) => (
						<option key={p.key} value={p.key}>
							{p.label}
						</option>
					))}
					<option value="custom">Custom (blank)</option>
				</select>
			</div>
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
										<button onClick={() => removeAlert(a.id)} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400" title="Remove row">
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
					<button onClick={addAlert} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">
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
			<p className="text-sm text-muted">Suggestions or priority actions for the incoming shift.</p>
			<div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
				{report.recommendations.map((rec, i) => (
					<div key={rec.id} className="flex items-center gap-2">
						<span className="tnum w-6 text-right text-sm text-muted">{i + 1}.</span>
						<input className={inputCls} value={rec.text} onChange={(e) => setRec(rec.id, e.target.value)} />
						<button onClick={() => removeRec(rec.id)} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400" title="Remove">
							✕
						</button>
					</div>
				))}
				{report.recommendations.length === 0 && <p className="py-4 text-center text-sm text-muted">No recommendations yet.</p>}
				<button onClick={addRec} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">
					+ Add recommendation
				</button>
			</div>
		</div>
	);
}

/* ---------------- Send modal ---------------- */
function SendModal({
	users,
	ensureSaved,
	onClose,
	onSent,
}: {
	users: DirectoryUser[];
	ensureSaved: () => Promise<string | null>;
	onClose: () => void;
	onSent: (msg: string) => void;
}) {
	const [toUserId, setToUserId] = useState(users[0]?.id ?? "");
	const [ccAll, setCcAll] = useState(false);
	const [ccIds, setCcIds] = useState<Set<string>>(new Set());
	const [message, setMessage] = useState(() => defaultScheduleMessage(users[0]?.firstName ?? ""));
	const [messageEdited, setMessageEdited] = useState(false);
	const [sending, setSending] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Change the recipient: refresh the greeting to match, unless the user has
	// already customized the message.
	const onSelectRecipient = (id: string) => {
		setToUserId(id);
		if (!messageEdited) {
			const u = users.find((x) => x.id === id);
			setMessage(defaultScheduleMessage(u?.firstName ?? ""));
		}
	};

	const toggleCc = (id: string) => {
		setCcIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const send = async () => {
		if (!toUserId) {
			setErr("Pick a recipient.");
			return;
		}
		setSending(true);
		setErr(null);
		try {
			// Persist the report first (if new/dirty) so it can be sent by id.
			const id = await ensureSaved();
			if (!id) {
				setErr("Couldn't save the report before sending.");
				return;
			}
			const body: Record<string, unknown> = { toUserId, message };
			if (ccAll) body.ccAll = true;
			else body.ccUserIds = [...ccIds].filter((cid) => cid !== toUserId);
			const res = await fetch(`/api/schedule-reports/${id}/send`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				setErr(data.error ?? "Couldn't send the report.");
				return;
			}
			onSent(`Report sent to ${data.to}${data.ccCount ? ` (+${data.ccCount} cc)` : ""}.`);
		} catch {
			setErr("Network error. Try again.");
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="fixed inset-0 z-40 flex items-center justify-center p-4">
			<div className="absolute inset-0 bg-black/40" onClick={onClose} />
			<div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
				<h2 className="text-base font-semibold text-foreground">Send report</h2>
				<p className="mb-4 text-xs text-muted">The styled .xlsx is attached to the email.</p>

				{err && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{err}</div>}

				<div className="space-y-4">
					<div>
						<label className="mb-1 block text-sm font-medium text-foreground">To</label>
						<select className={inputCls} value={toUserId} onChange={(e) => onSelectRecipient(e.target.value)}>
							{users.map((u) => (
								<option key={u.id} value={u.id}>
									{fullName(u)} ({u.email})
								</option>
							))}
						</select>
					</div>

					<label className="flex items-center gap-2 text-sm text-foreground">
						<input type="checkbox" checked={ccAll} onChange={(e) => setCcAll(e.target.checked)} />
						Copy all other users
					</label>

					{!ccAll && (
						<div>
							<label className="mb-1 block text-sm font-medium text-foreground">CC (optional)</label>
							<div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
								{users
									.filter((u) => u.id !== toUserId)
									.map((u) => (
										<label key={u.id} className="flex items-center gap-2 text-sm text-muted">
											<input type="checkbox" checked={ccIds.has(u.id)} onChange={() => toggleCc(u.id)} />
											{fullName(u)}
										</label>
									))}
								{users.filter((u) => u.id !== toUserId).length === 0 && (
									<p className="text-xs text-muted">No other users.</p>
								)}
							</div>
						</div>
					)}

					<div>
						<label className="mb-1 block text-sm font-medium text-foreground">Message</label>
						<textarea
							className={`${inputCls} h-28`}
							value={message}
							onChange={(e) => {
								setMessage(e.target.value);
								setMessageEdited(true);
							}}
						/>
					</div>
				</div>

				<div className="mt-5 flex justify-end gap-2">
					<button onClick={onClose} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5">
						Cancel
					</button>
					<button onClick={send} disabled={sending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
						{sending ? "Sending…" : "Send report"}
					</button>
				</div>
			</div>
		</div>
	);
}
