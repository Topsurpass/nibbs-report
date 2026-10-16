"use client";

import { useMemo } from "react";
import { useWeekendMergeState } from "@/app/components/providers/WeekendMergeProvider";
import {
	assessCollection,
	buildMerge,
	canMerge,
	compareWithSettlement,
	defaultMergeDate,
	mergeChecks,
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
	const { sources, mergeDateOverride, session, settlement } = state;

	return useMemo(() => {
		const ordered = sortSources(sources);
		const collectionChecks = assessCollection(sources);
		const ready = canMerge(collectionChecks);

		// No default date until there are files: avoids an SSR/CSR "today" mismatch.
		const hasDated = sources.some((s) => s.date);
		const mergeDateStr = mergeDateOverride ?? (hasDated ? toInputDate(defaultMergeDate(sources)) : "");
		const mergeDate = fromInputDate(mergeDateStr);

		const merge = ready && mergeDate ? buildMerge(sources, mergeDate, session) : null;
		const outputChecks = merge && mergeDate ? mergeChecks(merge, mergeDate) : [];
		const downloadable = merge !== null && !outputChecks.some((c) => c.status === "fail");

		const comparison =
			merge && settlement ? compareWithSettlement({ name: merge.fileName, text: merge.text }, settlement) : null;

		return {
			...state,
			ordered,
			collectionChecks,
			ready,
			mergeDateStr,
			merge,
			outputChecks,
			downloadable,
			comparison,
		};
	}, [state, sources, mergeDateOverride, session, settlement]);
}
