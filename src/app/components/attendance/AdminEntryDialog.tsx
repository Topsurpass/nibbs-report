"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { adminEntrySchema, type AdminEntryInput } from "@/lib/validators/attendance";
import {
	formatLagosTime,
	formatNightLabel,
	isNightDate,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { personName } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";

/**
 * Admin correction for one night.
 *
 * Validates against `adminEntrySchema` — the exact contract the route re-checks
 * server-side — so the field-level message an admin sees is the same rule that
 * decides whether the write is accepted.
 *
 * Times are Lagos wall clock (`HH:MM`). The server maps them onto the right
 * calendar date via `instantForNight`, because a night spans two dates and
 * "08:00" means the morning after it started.
 */

interface Props {
	open: boolean;
	nightDate: NightDate;
	/** Preselect an analyst, when opened from an existing row rather than a day. */
	initialUserId?: string;
	people: AttendancePerson[];
	/** The row already on the register for the chosen analyst, if any. */
	existingFor: (userId: string, nightDate: NightDate) => AttendanceEntry | null;
	onClose: () => void;
	onSaved: () => void;
}

/**
 * A full night, prefilled. Almost every correction is a standard 20:30 → 08:30
 * shift, so the admin adjusts the exception rather than typing the norm.
 */
const DEFAULT_IN = "20:30";
const DEFAULT_OUT = "08:30";

export default function AdminEntryDialog({
	open,
	nightDate,
	initialUserId,
	people,
	existingFor,
	onClose,
	onSaved,
}: Props) {
	const [serverError, setServerError] = useState<string | null>(null);
	const [removing, setRemoving] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);

	const {
		register,
		handleSubmit,
		reset,
		control,
		formState: { errors, isSubmitting },
	} = useForm<AdminEntryInput>({
		resolver: zodResolver(adminEntrySchema),
		defaultValues: {
			userId: people[0]?.id ?? "",
			nightDate,
			signedIn: DEFAULT_IN,
			signedOut: DEFAULT_OUT,
			note: "",
		},
	});

	// `useWatch` rather than `watch()`: the latter returns a fresh function each
	// render, which React's lint rules correctly flag as unmemoizable.
	const selectedUser = useWatch({ control, name: "userId" });
	// The date is editable, so the form's own value wins over the prop it opened on.
	const watchedNight = useWatch({ control, name: "nightDate" });
	const formNight = isNightDate(watchedNight) ? watchedNight : nightDate;
	const existing = selectedUser ? existingFor(selectedUser, formNight) : null;

	/** Whatever is already on the register for this analyst and night. */
	const valuesFor = (userId: string, night: NightDate): AdminEntryInput => {
		const row = userId ? existingFor(userId, night) : null;
		return {
			userId,
			nightDate: night,
			signedIn: row ? formatLagosTime(new Date(row.signedInAt)) : DEFAULT_IN,
			// An existing row shows what is actually on the register: an open night
			// stays blank rather than being prefilled with a sign-out that never
			// happened. Only a brand-new entry gets the standard shift.
			signedOut: row ? (row.signedOutAt ? formatLagosTime(new Date(row.signedOutAt)) : "") : DEFAULT_OUT,
			note: row?.note ?? "",
		};
	};

	// Re-seed during render rather than in an effect (React's documented reset-on-
	// prop-change pattern) so no frame ever shows another night's times. Three
	// triggers: opening on a new night, switching analyst, and editing the date —
	// each must reveal the row that actually exists for that pair.
	const openKey = `${open}|${nightDate}|${initialUserId ?? ""}`;
	const [seed, setSeed] = useState(() => ({
		openKey,
		userId: initialUserId ?? people[0]?.id ?? "",
		night: nightDate,
	}));

	if (seed.openKey !== openKey) {
		const userId = initialUserId ?? people[0]?.id ?? "";
		setSeed({ openKey, userId, night: nightDate });
		reset(valuesFor(userId, nightDate));
		setServerError(null);
	} else if ((selectedUser && selectedUser !== seed.userId) || formNight !== seed.night) {
		const userId = selectedUser || seed.userId;
		setSeed({ openKey, userId, night: formNight });
		reset(valuesFor(userId, formNight));
		setServerError(null);
	}

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	const onSubmit = handleSubmit(async (values) => {
		setServerError(null);
		try {
			const res = await fetch("/api/attendance/entries", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const data = (await res.json()) as { ok: boolean; error?: string };
			if (!res.ok || !data.ok) {
				setServerError(data.error ?? "Couldn't save that night.");
				return;
			}
			onSaved();
			onClose();
		} catch {
			setServerError("Network error. Check your connection and try again.");
		}
	});

	const removeNight = async () => {
		if (!existing) return;
		setRemoving(true);
		setServerError(null);
		try {
			const params = new URLSearchParams({ userId: selectedUser, nightDate: formNight });
			const res = await fetch(`/api/attendance/entries?${params}`, { method: "DELETE" });
			const data = (await res.json()) as { ok: boolean; error?: string };
			if (!res.ok || !data.ok) {
				setServerError(data.error ?? "Couldn't remove that night.");
				return;
			}
			onSaved();
			onClose();
		} catch {
			setServerError("Network error. Check your connection and try again.");
		} finally {
			setRemoving(false);
		}
	};

	const field =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40";
	const errorText = "mt-1 text-xs text-red-600 dark:text-red-400";

	return (
		<div className="no-print fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
			<div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />

			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="admin-entry-title"
				className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
			>
				<div className="border-b border-border px-6 py-4">
					<h2 id="admin-entry-title" className="text-base font-bold text-foreground">
						{existing ? "Correct this night" : "Add a night"}
					</h2>
					<p className="mt-0.5 text-xs text-muted">
						{formatNightLabel(formNight)} · saved as an admin entry, stamped with your name
					</p>
				</div>

				<form onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5" noValidate>
					{serverError && (
						<div
							role="alert"
							className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
						>
							{serverError}
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="nightDate"
								className="mb-1 block text-sm font-medium text-foreground"
							>
								Night
							</label>
							<input id="nightDate" type="date" {...register("nightDate")} className={field} />
							{errors.nightDate && <p className={errorText}>{errors.nightDate.message}</p>}
						</div>
						<div />
					</div>

					<div>
						<label htmlFor="userId" className="mb-1 block text-sm font-medium text-foreground">
							Analyst
						</label>
						<select id="userId" {...register("userId")} className={field}>
							{people.map((person) => (
								<option key={person.id} value={person.id}>
									{personName(person)}
								</option>
							))}
						</select>
						{errors.userId && <p className={errorText}>{errors.userId.message}</p>}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label htmlFor="signedIn" className="mb-1 block text-sm font-medium text-foreground">
								Signed in
							</label>
							<input id="signedIn" type="time" {...register("signedIn")} className={field} />
							{errors.signedIn && <p className={errorText}>{errors.signedIn.message}</p>}
						</div>
						<div>
							<label htmlFor="signedOut" className="mb-1 block text-sm font-medium text-foreground">
								Signed out
							</label>
							<input id="signedOut" type="time" {...register("signedOut")} className={field} />
							{errors.signedOut && <p className={errorText}>{errors.signedOut.message}</p>}
						</div>
					</div>
					<p className="-mt-1 text-xs text-muted">
						Prefilled with a standard 20:30 → 08:30 shift — adjust either time if it was
						different. Clear sign-out to record the night as still open, which leaves the
						hours unknown rather than counting them as zero.
					</p>

					<div>
						<label htmlFor="note" className="mb-1 block text-sm font-medium text-foreground">
							Note <span className="font-normal text-muted">(optional)</span>
						</label>
						<input
							id="note"
							type="text"
							placeholder="Why this was added or changed"
							{...register("note")}
							className={field}
						/>
						{errors.note && <p className={errorText}>{errors.note.message}</p>}
					</div>
				</form>

				<div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
					{existing ? (
						<button
							type="button"
							onClick={removeNight}
							disabled={removing || isSubmitting}
							className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
						>
							{removing ? "Removing…" : "Remove night"}
						</button>
					) : (
						<span />
					)}

					<div className="flex gap-2">
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={onSubmit}
							disabled={isSubmitting || removing}
							className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
						>
							{isSubmitting ? "Saving…" : "Save night"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
