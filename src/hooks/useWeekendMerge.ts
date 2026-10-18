"use client";

import { useMemo } from "react";
import { useWeekendMergeState } from "@/app/components/providers/WeekendMergeProvider";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import {
	applyHolidays,
	assessCollection,
	buildMerge,
	buildSessionBoard,
	canMerge,
	compareWithSettlement,
	defaultMergeDate,
	mergeChecks,
	MISSING_SESSIONS_CHECK,
	sortSources,
} from "@/lib/weekendMerge";

function toInputDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromInputDate(v: string): Date | null {
	const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Everything the Weekend Settlement page derives from the uploaded files. */
export function useWeekendMerge() {
	const state = useWeekendMergeState();
	const { sources: uploaded, mergeDateOverride, session, settlement, allowMissingSessions } = state;
	const { lookup: holidays, status: holidayStatus } = usePublicHolidays();

	return useMemo(() => {
		// Known public holidays clear the "confirm this is a holiday" warnings.
		const sources = applyHolidays(uploaded, holidays);
		const ordered = sortSources(sources);
		const collectionChecks = assessCollection(sources, { allowMissingSessions, holidays });
		const missingSessions = collectionChecks.find((c) => c.id === MISSING_SESSIONS_CHECK);
		const ready = canMerge(collectionChecks);

		// No default date until there are files: avoids an SSR/CSR "today" mismatch.
		const hasDated = sources.some((s) => s.date);
		const mergeDateStr = mergeDateOverride ?? (hasDated ? toInputDate(defaultMergeDate(sources)) : "");
		const mergeDate = fromInputDate(mergeDateStr);

		const merge = ready && mergeDate ? buildMerge(sources, mergeDate, session) : null;
		const outputChecks = merge && mergeDate ? mergeChecks(merge, mergeDate) : [];
		const downloadable = merge !== null && !outputChecks.some((c) => c.status === "fail");
		const readinessChecks = [...collectionChecks, ...outputChecks];

		const board = buildSessionBoard(sources, holidays);
		// Position of each valid file in merge order, for the "Merge #n" labels.
		const orderOf = new Map(ordered.filter((f) => f.valid && f.date).map((f, i) => [f.id, i + 1]));

		const comparison =
			merge && settlement ? compareWithSettlement({ name: merge.fileName, text: merge.text }, settlement) : null;

		return {
			...state,
			sources,
			holidayStatus,
			ordered,
			collectionChecks,
			/** Some sessions are missing; the user may choose to merge without them. */
			canSkipMissing: !allowMissingSessions && missingSessions?.status === "fail" && sources.some((s) => s.date),
			ready,
			mergeDateStr,
			merge,
			outputChecks,
			downloadable,
			readinessChecks,
			board,
			orderOf,
			comparison,
		};
	}, [state, uploaded, holidays, holidayStatus, mergeDateOverride, session, settlement, allowMissingSessions]);
}
