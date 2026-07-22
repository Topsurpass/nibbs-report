// Daily Schedule (shift-handover) report — data model + the standard template.
//
// Modeled directly on the Frauddesk Excel: a Cover page, a grouped Report
// Summary (TASK + Description merged across each category's rows), a Fraud
// Alerts log, and a Recommendations list. `blankReport` seeds a new report with
// the standard structure so an analyst only fills findings/status day to day.

export type HandoverType =
	| "Morning to Afternoon"
	| "Afternoon to Night"
	| "Night to Morning";

export const HANDOVER_TYPES: HandoverType[] = [
	"Morning to Afternoon",
	"Afternoon to Night",
	"Night to Morning",
];

/** The fixed Status choices (a dropdown in the editor). */
export const STATUS_OPTIONS = ["Nil", "Okay", "Pending", "Treated"] as const;
export const DEFAULT_STATUS = "Nil";

export interface CoverPage {
	department: string;
	handoverType: HandoverType;
	/** YYYY-MM-DD */
	date: string;
	/** Officer names, chosen from the user directory. First = the signed-in user. */
	outgoingOfficers: string[];
	incomingOfficers: string[];
	/** Free text, e.g. "8:30pm". */
	timeOfHandover: string;
}

export interface SummaryRow {
	id: string;
	detail: string;
	findings: string;
	status: string;
}

export interface SummaryCategory {
	id: string;
	/** The TASK label (merged across the category's rows in the sheet). */
	task: string;
	/** The Description (merged across the category's rows). */
	description: string;
	rows: SummaryRow[];
}

export interface FraudAlert {
	id: string;
	timeLogged: string;
	caseRef: string;
	description: string;
	status: string;
	escalatedTo: string;
	remarks: string;
}

export interface Recommendation {
	id: string;
	text: string;
}

export interface ScheduleReport {
	cover: CoverPage;
	summary: SummaryCategory[];
	fraudAlerts: FraudAlert[];
	recommendations: Recommendation[];
}

/** Trimmed view stored/returned for the list page. */
export interface ScheduleReportListItem {
	id: string;
	reportDate: string;
	handoverType: string;
	outgoingOfficers: string;
	incomingOfficers: string;
	createdAt: string;
}

export const DEFAULT_DEPARTMENT = "Internal Audit (Frauddesk Unit)";

const row = (detail: string, findings = "", status = "Nil"): SummaryRow => ({
	id: `${detail}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
	detail,
	findings,
	status,
});

function monitoring(): SummaryCategory {
	return {
		id: "monitoring",
		task: "MONITORING",
		description: "None",
		rows: [
			row("Mobile Transfer", "0"),
			row("VTU", "0"),
			row("Payment", "0"),
			row("Pocketmoni", "0"),
			row("CorporatePay", "0"),
			row("SwitchIT", "0"),
			row("Payoutlet", "0"),
		],
	};
}
function fraudComplaints(): SummaryCategory {
	return {
		id: "fraud-complaints",
		task: "Fraud Complaints",
		description: "None",
		rows: [row("Email", "", "Nil"), row("Phone call", "", "Nil")],
	};
}
/** The NIBSS summary category — id "nibss" is the anchor breach rows merge into. */
export function nibss(): SummaryCategory {
	return {
		id: "nibss",
		task: "NIBSS",
		description: "None",
		rows: [row("NIBSS", "", "Treated")],
	};
}

/** The default Report Summary: MONITORING, Fraud Complaints, NIBSS. */
export function defaultSummary(): SummaryCategory[] {
	return [monitoring(), fraudComplaints(), nibss()];
}

/**
 * Extra standard categories offered one-click under "Add category" (statuses
 * kept within STATUS_OPTIONS; the old descriptive statuses live in findings).
 */
export interface CategoryPreset {
	key: string;
	label: string;
	make: () => SummaryCategory;
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
	{
		key: "tools-health",
		label: "Tools Health",
		make: () => ({
			id: "tools-health",
			task: "Tools Health",
			description: "None",
			rows: [
				row("Razor SQL", "No Issue", "Okay"),
				row("PM Portal", "No Issue", "Okay"),
				row("PowerBI", "No Issue", "Okay"),
				row("3CX", "No Issue", "Okay"),
			],
		}),
	},
	{
		key: "fraud-register-update",
		label: "Fraud Register Update",
		make: () => ({
			id: "fraud-register-update",
			task: "FRAUD REGISTER UPDATE",
			description: "None",
			rows: [
				row("Addition", "0 — wallet(s) blocked", "Treated"),
				row("Subtraction", "0 — wallet(s) unblocked", "Treated"),
			],
		}),
	},
	{
		key: "other-requests",
		label: "Other Requests",
		make: () => ({
			id: "other-requests",
			task: "Other Requests",
			description:
				"Other non-transactional requests made to the team for our action to enable them proceed with their tasks",
			rows: [
				row("BANK REQUEST", "", "Nil"),
				row("UNLIEN REQUEST", "", "Nil"),
				row("UNBLOCK REQUEST", "", "Nil"),
			],
		}),
	},
];

/** One "no incidents" row, matching the sample's None/Nil default. */
export function defaultFraudAlerts(): FraudAlert[] {
	return [
		{
			id: "alert-1",
			timeLogged: "None",
			caseRef: "None",
			description: "None",
			status: "None",
			escalatedTo: "Nil",
			remarks: "Nil",
		},
	];
}

export function defaultRecommendations(): Recommendation[] {
	return [
		{ id: "rec-1", text: "Monitor new MFBs terminals" },
		{ id: "rec-2", text: "Continuous monitoring of SwitchIT terminals" },
	];
}

/** Seed a fresh report with the standard template. `date` is YYYY-MM-DD. */
export function blankReport(opts: {
	date: string;
	outgoingOfficers?: string;
}): ScheduleReport {
	return {
		cover: {
			department: DEFAULT_DEPARTMENT,
			handoverType: "Afternoon to Night",
			date: opts.date,
			outgoingOfficers: opts.outgoingOfficers ? [opts.outgoingOfficers] : [],
			incomingOfficers: [],
			timeOfHandover: "",
		},
		summary: defaultSummary(),
		fraudAlerts: defaultFraudAlerts(),
		recommendations: defaultRecommendations(),
	};
}

/** Coerce a stored/legacy document into the current shape (officers as arrays). */
export function normalizeReport(raw: ScheduleReport): ScheduleReport {
	const toArr = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((x) => typeof x === "string") : typeof v === "string" && v.trim() ? [v] : [];
	return {
		...raw,
		cover: {
			...raw.cover,
			outgoingOfficers: toArr(raw.cover?.outgoingOfficers),
			incomingOfficers: toArr(raw.cover?.incomingOfficers),
		},
	};
}
