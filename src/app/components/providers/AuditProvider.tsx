"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import {
	decodeSettlementHtml,
	parseSettlementHtml,
	type FrameParseResult,
} from "@/lib/parseHtml";
import { parseEtranzactTxt, type TxtParseResult } from "@/lib/parseTxt";
import type { BreachRecord } from "@/lib/reconcile";

/**
 * Holds the Settlement Audit's in-progress source state (uploaded files, parsed
 * results, breach edits). Mounted in the persistent (app) layout so an audit
 * survives navigating to Settings/Users and back — the audit page is just a view
 * over this state. Derived values (reconcile result, summaries) are recomputed in
 * the component from these persisted inputs.
 */

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
		d.getDate(),
	).padStart(2, "0")}`;
}

type BreachEdits = Record<string, Partial<BreachRecord>>;

interface AuditContextValue {
	reportDate: string;
	setReportDate: (v: string) => void;
	htmlFile: File | null;
	txtFile: File | null;
	frame: FrameParseResult | null;
	txt: TxtParseResult | null;
	htmlError?: string;
	txtError?: string;
	armed: boolean;
	setArmed: (v: boolean) => void;
	breachEdits: BreachEdits;
	setBreachEdits: React.Dispatch<React.SetStateAction<BreachEdits>>;
	onHtml: (file: File) => Promise<void>;
	onTxt: (file: File) => Promise<void>;
}

const AuditContext = createContext<AuditContextValue | null>(null);

export function AuditProvider({ children }: { children: ReactNode }) {
	const [reportDate, setReportDate] = useState("");
	const [htmlFile, setHtmlFile] = useState<File | null>(null);
	const [txtFile, setTxtFile] = useState<File | null>(null);
	const [frame, setFrame] = useState<FrameParseResult | null>(null);
	const [txt, setTxt] = useState<TxtParseResult | null>(null);
	const [htmlError, setHtmlError] = useState<string>();
	const [txtError, setTxtError] = useState<string>();
	const [armed, setArmed] = useState(false);
	const [breachEdits, setBreachEdits] = useState<BreachEdits>({});

	// Set today's date after mount to avoid an SSR/CSR hydration mismatch.
	useEffect(() => {
		/* eslint-disable-next-line react-hooks/set-state-in-effect */
		setReportDate((d) => d || todayStr());
	}, []);

	const onHtml = useCallback(async (file: File) => {
		setHtmlError(undefined);
		try {
			const buf = await file.arrayBuffer();
			const parsed = parseSettlementHtml(decodeSettlementHtml(buf));
			setHtmlFile(file);
			setFrame(parsed);
			if (parsed.rows.length === 0) setHtmlError("No bank rows found in the HTML table.");
		} catch (e) {
			setHtmlFile(file);
			setFrame(null);
			setHtmlError(e instanceof Error ? e.message : "Failed to parse HTML.");
		}
	}, []);

	const onTxt = useCallback(async (file: File) => {
		setTxtError(undefined);
		try {
			const text = await file.text();
			const parsed = parseEtranzactTxt(text);
			setTxtFile(file);
			setTxt(parsed);
			if (parsed.rows.length === 0) setTxtError("No records parsed from the TXT.");
			else if (!parsed.format.valid)
				setTxtError(
					`⚠ ${parsed.format.issues.length} line(s) break the required format — see “Format deviations” after running the audit.`,
				);
		} catch (e) {
			setTxtFile(file);
			setTxt(null);
			setTxtError(e instanceof Error ? e.message : "Failed to read TXT.");
		}
	}, []);

	return (
		<AuditContext.Provider
			value={{
				reportDate,
				setReportDate,
				htmlFile,
				txtFile,
				frame,
				txt,
				htmlError,
				txtError,
				armed,
				setArmed,
				breachEdits,
				setBreachEdits,
				onHtml,
				onTxt,
			}}
		>
			{children}
		</AuditContext.Provider>
	);
}

export function useAudit(): AuditContextValue {
	const ctx = useContext(AuditContext);
	if (!ctx) throw new Error("useAudit must be used within AuditProvider");
	return ctx;
}
