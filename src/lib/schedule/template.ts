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

/** Common Status values, offered as combobox presets (free text still allowed). */
export const STATUS_PRESETS = [
	"Nil",
	"Okay",
	"No Issue",
	"Treated",
	"Pending",
	"Recorded, wallet(s) blocked",
	"Approval gotten, wallet(s) unblocked",
	"Reasons provided",
];

export interface CoverPage {
	department: string;
	handoverType: HandoverType;
	/** YYYY-MM-DD */
	date: string;
	outgoingOfficers: string;
	incomingOfficers: string;
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

/** The standard Report Summary structure (matches the sample workbook). */
export function defaultSummary(): SummaryCategory[] {
	return [
		{
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
		},
		{
			id: "tools-health",
			task: "Tools Health",
			description: "None",
			rows: [
				row("Razor SQL", "No Issue", "Okay"),
				row("PM Portal", "No Issue", "Okay"),
				row("PowerBI", "No Issue", "Okay"),
				row("3CX", "No Issue", "Okay"),
			],
		},
		{
			id: "fraud-register-update",
			task: "FRAUD REGISTER UPDATE",
			description: "None",
			rows: [
				row("Addition", "0", "Recorded, wallet(s) blocked"),
				row("Subtraction", "0", "Approval gotten, wallet(s) unblocked"),
			],
		},
		{
			id: "fraud-complaints",
			task: "Fraud Complaints",
			description: "None",
			rows: [row("Email", "", "Nil"), row("Phone call", "", "Nil")],
		},
		{
			id: "nibss",
			task: "NIBSS",
			description: "None",
			rows: [row("NIBSS", "", "Treated")],
		},
		{
			id: "other-requests",
			task: "Other Requests",
			description:
				"Other non-transactional requests made to the team for our action to enable them proceed with their tasks",
			rows: [
				row("BANK REQUEST", "", "Nil"),
				row("UNLIEN REQUEST", "", "Nil"),
				row("UNBLOCK REQUEST", "", "Nil"),
			],
		},
	];
}

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
			outgoingOfficers: opts.outgoingOfficers ?? "",
			incomingOfficers: "",
			timeOfHandover: "",
		},
		summary: defaultSummary(),
		fraudAlerts: defaultFraudAlerts(),
		recommendations: defaultRecommendations(),
	};
}
