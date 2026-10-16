"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { inspectSourceFile, type NamedText, type SessionNo, type SourceFile } from "@/lib/weekendMerge";

/**
 * Holds the Weekend Settlement merge's uploaded files and choices. Mounted in
 * the persistent app shell (like AuditProvider) so a half-finished merge
 * survives navigating away. Derived results live in useWeekendMerge.
 */

interface WeekendMergeContextValue {
	sources: SourceFile[];
	/** "YYYY-MM-DD" chosen by the user, or null to use the next business day. */
	mergeDateOverride: string | null;
	setMergeDateOverride: (v: string | null) => void;
	session: SessionNo;
	setSession: (v: SessionNo) => void;
	settlement: NamedText | null;
	/** Names replaced by a re-upload in the most recent drop. */
	replaced: string[];
	addSources: (files: File[]) => Promise<void>;
	removeSource: (id: string) => void;
	setSettlementFile: (file: File) => Promise<void>;
	clearSettlement: () => void;
	reset: () => void;
}

const WeekendMergeContext = createContext<WeekendMergeContextValue | null>(null);

export function WeekendMergeProvider({ children }: { children: ReactNode }) {
	const [sources, setSources] = useState<SourceFile[]>([]);
	const [mergeDateOverride, setMergeDateOverride] = useState<string | null>(null);
	const [session, setSession] = useState<SessionNo>(1);
	const [settlement, setSettlement] = useState<NamedText | null>(null);
	const [replaced, setReplaced] = useState<string[]>([]);
	const counter = useRef(0);

	const addSources = useCallback(async (files: File[]) => {
		const inspected = await Promise.all(
			files.map(async (file) => inspectSourceFile(file.name, await file.text(), `${file.name}#${counter.current++}`)),
		);
		// Re-dropping a file with the same name replaces it (a corrected file).
		const names = new Set(inspected.map((f) => f.name));
		setReplaced(sources.filter((f) => names.has(f.name)).map((f) => f.name));
		setSources((prev) => [...prev.filter((f) => !names.has(f.name)), ...inspected]);
	}, [sources]);

	const removeSource = useCallback((id: string) => {
		setSources((prev) => prev.filter((f) => f.id !== id));
		setReplaced([]);
	}, []);

	const setSettlementFile = useCallback(async (file: File) => {
		setSettlement({ name: file.name, text: await file.text() });
	}, []);

	const clearSettlement = useCallback(() => setSettlement(null), []);

	const reset = useCallback(() => {
		setSources([]);
		setMergeDateOverride(null);
		setSession(1);
		setSettlement(null);
		setReplaced([]);
	}, []);

	return (
		<WeekendMergeContext.Provider
			value={{
				sources,
				mergeDateOverride,
				setMergeDateOverride,
				session,
				setSession,
				settlement,
				replaced,
				addSources,
				removeSource,
				setSettlementFile,
				clearSettlement,
				reset,
			}}
		>
			{children}
		</WeekendMergeContext.Provider>
	);
}

export function useWeekendMergeState(): WeekendMergeContextValue {
	const ctx = useContext(WeekendMergeContext);
	if (!ctx) throw new Error("useWeekendMergeState must be used within WeekendMergeProvider");
	return ctx;
}
