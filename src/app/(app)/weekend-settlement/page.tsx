"use client";

import { WeekendSettlement } from "@/app/components/weekend-merge";

// Weekend Settlement ("/weekend-settlement"). State lives in WeekendMergeProvider
// in the app shell, so leaving and returning keeps the uploaded files.
export default function WeekendSettlementPage() {
	return <WeekendSettlement />;
}
