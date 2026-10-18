"use client";

import { useEffect, useState } from "react";
import { holidayLookup, type HolidayLookup, type PublicHoliday } from "@/lib/holidays/parseIcs";

export type HolidayStatus = "loading" | "ready" | "unavailable";

// One fetch per browser session, shared by every component that asks.
let cache: Promise<PublicHoliday[] | null> | null = null;

function loadHolidays(): Promise<PublicHoliday[] | null> {
	cache ??= fetch("/api/holidays")
		.then((res) => res.json())
		.then((body: { ok: boolean; holidays?: PublicHoliday[] }) => (body.ok && body.holidays ? body.holidays : null))
		.catch(() => null)
		.then((list) => {
			if (!list) cache = null; // let a later mount retry
			return list;
		});
	return cache;
}

const NONE: HolidayLookup = () => undefined;

/** Nigerian public holidays from Google Calendar, as a date lookup. */
export function usePublicHolidays(): { lookup: HolidayLookup; status: HolidayStatus } {
	const [state, setState] = useState<{ lookup: HolidayLookup; status: HolidayStatus }>({ lookup: NONE, status: "loading" });

	useEffect(() => {
		let cancelled = false;
		loadHolidays().then((list) => {
			if (cancelled) return;
			setState(list ? { lookup: holidayLookup(list), status: "ready" } : { lookup: NONE, status: "unavailable" });
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
