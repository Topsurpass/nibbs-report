"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	ArrowLeft,
	Download,
	Mail,
	Trash2,
	Check,
	Plus,
	X,
	AlertCircle,
	CheckCircle2,
	Loader2,
} from "lucide-react";
import {
	CATEGORY_PRESETS,
	HANDOVER_TYPES,
	STATUS_OPTIONS,
	type FraudAlert,
	type HandoverType,
	type ScheduleReport,
	type SummaryCategory,
	type SummaryRow,
} from "@/lib/schedule/template";
import { scheduleFileName } from "@/lib/schedule/exportSchedule";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
	typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

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

/** Extracted from the shadcn Input styling, for the dense per-row grid cells
 * where a raw control keeps the tables compact — a full `Select`/`Input`
 * component per cell would add popover overhead across dozens of rows. */
const inputCls =
	"h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const iconBtnCls =
	"rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive";
const addBtnCls =
	"inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<Label className="mb-1.5">{label}</Label>
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
			const res = await fetch(isNew ? "/api/schedule-reports" : `/api/schedule-reports/${idRef.current}`, {
				method: isNew ? "POST" : "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(report),
			});
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
			<div className="p-4 pb-0 md:p-6 md:pb-0">
				<Link
					href="/daily-reports"
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" />
					All reports
				</Link>
				<h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
					{mode === "new" ? "New Daily Schedule Report" : "Edit Daily Schedule Report"}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					{report.cover.handoverType} · {report.cover.date || "no date"}
				</p>
			</div>

			<div className="sticky top-14 z-20 mt-4 flex flex-wrap items-center gap-2 border-y border-border bg-card/90 px-4 py-3 backdrop-blur-sm md:px-6">
				<Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
					<TabsList>
						{TABS.map((t) => (
							<TabsTrigger key={t.id} value={t.id}>
								{t.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<Button type="button" variant="outline" size="sm" onClick={exportXlsx} disabled={exporting}>
						{exporting ? <Loader2 className="animate-spin" /> : <Download />}
						{exporting ? "Building…" : "Export .xlsx"}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={openSend} disabled={saving}>
						<Mail />
						Send
					</Button>
					{mode === "edit" && (
						<Button type="button" variant="destructive" size="sm" onClick={remove} disabled={deleting}>
							<Trash2 />
							{deleting ? "Deleting…" : "Delete"}
						</Button>
					)}
					<Button
						type="button"
						size="sm"
						onClick={() => saveReport(true)}
						disabled={saving || (!dirty && persistedRef.current)}
					>
						{saving ? <Loader2 className="animate-spin" /> : dirty ? null : <Check />}
						{saving ? "Saving…" : dirty ? "Save" : savedFlag ? "Saved" : "Saved"}
					</Button>
				</div>
			</div>

			<div className="p-4 md:p-6">
				{error && (
					<Alert variant="destructive" role="alert" className="mb-4">
						<AlertCircle />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{notice && (
					<Alert className="mb-4 border-emerald-500/30 bg-emerald-500/5">
						<CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />
						<AlertDescription className="text-emerald-700 dark:text-emerald-300">{notice}</AlertDescription>
					</Alert>
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
								<button type="button" onClick={() => remove(i)} className={iconBtnCls} title="Remove officer">
									<X className="size-3.5" />
								</button>
							)}
						</div>
					);
				})}
				<button type="button" onClick={add} className={addBtnCls}>
					<Plus className="size-3.5" />
					Add officer
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
		<Card className="max-w-2xl space-y-4 p-6">
			<Field label="Department">
				<Input value={c.department} onChange={(e) => setCover({ department: e.target.value })} />
			</Field>
			<Field label="Handover Type">
				<Select value={c.handoverType} onValueChange={(v) => setCover({ handoverType: v as HandoverType })}>
					<SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
					<SelectContent>
						{HANDOVER_TYPES.map((h) => (
							<SelectItem key={h} value={h}>
								{h}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Date">
					<Input type="date" value={c.date} onChange={(e) => setCover({ date: e.target.value })} />
				</Field>
				<Field label="Time of Handover">
					<Input placeholder="e.g. 8:30pm" value={c.timeOfHandover} onChange={(e) => setCover({ timeOfHandover: e.target.value })} />
				</Field>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<OfficerPicker label="Outgoing Officer(s)" values={c.outgoingOfficers} options={outgoingOpts} onChange={(list) => setOfficers("outgoingOfficers", list)} />
				<OfficerPicker label="Incoming Officer(s)" values={c.incomingOfficers} options={officerNames} onChange={(list) => setOfficers("incomingOfficers", list)} />
			</div>
			<p className="text-xs text-muted-foreground">
				Officers are chosen from the user list. Signature lines are added as blank rows in the exported Excel.
			</p>
		</Card>
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
				<Card key={cat.id} className="gap-0 overflow-hidden py-0">
					<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
						<input
							value={cat.task}
							onChange={(e) => setCategory(cat.id, { task: e.target.value })}
							className={cn(inputCls, "w-auto font-semibold uppercase tracking-wide")}
						/>
						<input
							value={cat.description}
							placeholder="Description (optional)"
							onChange={(e) => setCategory(cat.id, { description: e.target.value })}
							className={cn(inputCls, "min-w-[200px] flex-1")}
						/>
						<button type="button" onClick={() => removeCategory(cat.id)} className={cn(iconBtnCls, "text-xs")} title="Remove category">
							<Trash2 className="size-3.5" />
						</button>
					</div>
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="text-[11px] uppercase tracking-wide">Details</TableHead>
								<TableHead className="text-[11px] uppercase tracking-wide">Summary / Findings</TableHead>
								<TableHead className="w-40 text-[11px] uppercase tracking-wide">Status</TableHead>
								<TableHead className="w-10" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{cat.rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<input className={inputCls} value={row.detail} onChange={(e) => setRow(cat.id, row.id, { detail: e.target.value })} />
									</TableCell>
									<TableCell>
										<input className={inputCls} value={row.findings} onChange={(e) => setRow(cat.id, row.id, { findings: e.target.value })} />
									</TableCell>
									<TableCell>
										<StatusSelect value={row.status} onChange={(v) => setRow(cat.id, row.id, { status: v })} />
									</TableCell>
									<TableCell className="text-center">
										<button type="button" onClick={() => removeRow(cat.id, row.id)} className={iconBtnCls} title="Remove row">
											<X className="size-3.5" />
										</button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<div className="border-t border-border px-4 py-2">
						<button type="button" onClick={() => addRow(cat.id)} className={addBtnCls}>
							<Plus className="size-3.5" />
							Add row
						</button>
					</div>
				</Card>
			))}

			<div className="flex items-center gap-3">
				<Label className="shrink-0">Add category:</Label>
				<Select value="" onValueChange={(v) => v && addCategory(v)}>
					<SelectTrigger className="w-56">
						<SelectValue placeholder="Choose…" />
					</SelectTrigger>
					<SelectContent>
						{CATEGORY_PRESETS.map((p) => (
							<SelectItem key={p.key} value={p.key}>
								{p.label}
							</SelectItem>
						))}
						<SelectItem value="custom">Custom (blank)</SelectItem>
					</SelectContent>
				</Select>
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
			<p className="text-sm text-muted-foreground">Log any fraud incidents detected during the shift.</p>
			<Card className="gap-0 overflow-hidden py-0">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							{cols.map((c) => (
								<TableHead key={c.key} className="text-[11px] uppercase tracking-wide">
									{c.label}
								</TableHead>
							))}
							<TableHead className="w-10" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{report.fraudAlerts.map((a) => (
							<TableRow key={a.id}>
								{cols.map((c) => (
									<TableCell key={c.key}>
										<input className={inputCls} value={a[c.key]} onChange={(e) => setAlert(a.id, { [c.key]: e.target.value })} />
									</TableCell>
								))}
								<TableCell className="text-center">
									<button type="button" onClick={() => removeAlert(a.id)} className={iconBtnCls} title="Remove row">
										<X className="size-3.5" />
									</button>
								</TableCell>
							</TableRow>
						))}
						{report.fraudAlerts.length === 0 && (
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={cols.length + 1} className="py-6 text-center text-sm text-muted-foreground">
									No incidents logged.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
				<div className="border-t border-border px-4 py-2">
					<button type="button" onClick={addAlert} className={addBtnCls}>
						<Plus className="size-3.5" />
						Add incident
					</button>
				</div>
			</Card>
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
			<p className="text-sm text-muted-foreground">Suggestions or priority actions for the incoming shift.</p>
			<Card className="space-y-2 p-4">
				{report.recommendations.map((rec, i) => (
					<div key={rec.id} className="flex items-center gap-2">
						<span className="tnum w-6 text-right text-sm text-muted-foreground">{i + 1}.</span>
						<input className={inputCls} value={rec.text} onChange={(e) => setRec(rec.id, e.target.value)} />
						<button type="button" onClick={() => removeRec(rec.id)} className={iconBtnCls} title="Remove">
							<X className="size-3.5" />
						</button>
					</div>
				))}
				{report.recommendations.length === 0 && (
					<p className="py-4 text-center text-sm text-muted-foreground">No recommendations yet.</p>
				)}
				<button type="button" onClick={addRec} className={addBtnCls}>
					<Plus className="size-3.5" />
					Add recommendation
				</button>
			</Card>
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
	const onSelectRecipient = (id: string | null) => {
		if (!id) return;
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
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Send report</DialogTitle>
					<DialogDescription>The styled .xlsx is attached to the email.</DialogDescription>
				</DialogHeader>

				{err && (
					<Alert variant="destructive">
						<AlertCircle />
						<AlertDescription>{err}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-4">
					<Field label="To">
						<Select value={toUserId} onValueChange={onSelectRecipient}>
							<SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
							<SelectContent>
								{users.map((u) => (
									<SelectItem key={u.id} value={u.id}>
										{fullName(u)} ({u.email})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<label className="flex items-center gap-2 text-sm text-foreground">
						<Checkbox checked={ccAll} onCheckedChange={(v) => setCcAll(v === true)} />
						Copy all other users
					</label>

					{!ccAll && (
						<Field label="CC (optional)">
							<div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
								{users
									.filter((u) => u.id !== toUserId)
									.map((u) => (
										<label key={u.id} className="flex items-center gap-2 text-sm text-muted-foreground">
											<Checkbox checked={ccIds.has(u.id)} onCheckedChange={() => toggleCc(u.id)} />
											{fullName(u)}
										</label>
									))}
								{users.filter((u) => u.id !== toUserId).length === 0 && (
									<p className="text-xs text-muted-foreground">No other users.</p>
								)}
							</div>
						</Field>
					)}

					<Field label="Message">
						<Textarea
							className="h-28"
							value={message}
							onChange={(e) => {
								setMessage(e.target.value);
								setMessageEdited(true);
							}}
						/>
					</Field>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button type="button" onClick={send} disabled={sending}>
						{sending && <Loader2 className="animate-spin" />}
						{sending ? "Sending…" : "Send report"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
