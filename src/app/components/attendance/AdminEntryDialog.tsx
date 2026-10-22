"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { adminEntrySchema, type AdminEntryInput } from "@/lib/validators/attendance";
import {
	formatLagosTime,
	formatNightLabel,
	isNightDate,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { SHIFT_META, shiftEndClock, shiftHoursSummary, shiftStartClock, type Shift } from "@/lib/attendance/shifts";
import { personName } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";
import { requestNightRemoval } from "./removeNight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";

/**
 * Admin correction for one night or afternoon.
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
	/** Which register this dialog edits: nights or afternoons. */
	shift: Shift;
	nightDate: NightDate;
	/** Preselect an analyst, when opened from an existing row rather than a day. */
	initialUserId?: string;
	people: AttendancePerson[];
	/** The row already on the register for the chosen analyst, if any. */
	existingFor: (userId: string, nightDate: NightDate) => AttendanceEntry | null;
	onClose: () => void;
	onSaved: () => void;
}

/*
 * A full standard shift is prefilled (20:00 → 08:00 for a night; 12:00 or, at
 * weekends, 14:00 → 20:00 for an afternoon). Almost every correction is the
 * standard shift, so the admin adjusts the exception rather than typing the norm.
 */

export default function AdminEntryDialog({
	open,
	shift,
	nightDate,
	initialUserId,
	people,
	existingFor,
	onClose,
	onSaved,
}: Props) {
	const [serverError, setServerError] = useState<string | null>(null);
	const [removing, setRemoving] = useState(false);
	const meta = SHIFT_META[shift];

	const {
		register,
		handleSubmit,
		reset,
		control,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<AdminEntryInput>({
		resolver: zodResolver(adminEntrySchema),
		defaultValues: {
			userId: people[0]?.id ?? "",
			nightDate,
			shift,
			signedIn: shiftStartClock(shift, nightDate),
			signedOut: shiftEndClock(shift),
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
			shift,
			signedIn: row ? formatLagosTime(new Date(row.signedInAt)) : shiftStartClock(shift, night),
			// An existing row shows what is actually on the register: an open night
			// stays blank rather than being prefilled with a sign-out that never
			// happened. Only a brand-new entry gets the standard shift.
			signedOut: row ? (row.signedOutAt ? formatLagosTime(new Date(row.signedOutAt)) : "") : shiftEndClock(shift),
			note: row?.note ?? "",
		};
	};

	// Re-seed during render rather than in an effect (React's documented reset-on-
	// prop-change pattern) so no frame ever shows another night's times. Three
	// triggers: opening on a new night, switching analyst, and editing the date —
	// each must reveal the row that actually exists for that pair.
	const openKey = `${open}|${shift}|${nightDate}|${initialUserId ?? ""}`;
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
				setServerError(data.error ?? `Couldn't save that ${meta.noun}.`);
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
		const who = people.find((p) => p.id === selectedUser);
		// Deleting a night is not reversible from the UI, and the row it removes is
		// somebody's attendance record. Name both before doing it.
		if (
			!window.confirm(
				`Remove ${who ? personName(who) : "this analyst"}'s ${meta.noun} of ${formatNightLabel(formNight)}? This cannot be undone.`,
			)
		) {
			return;
		}

		setRemoving(true);
		setServerError(null);
		try {
			await requestNightRemoval(selectedUser, formNight, shift);
			onSaved();
			onClose();
		} catch (err) {
			setServerError(err instanceof Error ? err.message : `Couldn't remove that ${meta.noun}.`);
		} finally {
			setRemoving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="no-print sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{existing ? `Correct this ${meta.noun}` : `Add ${shift === "afternoon" ? "an" : "a"} ${meta.noun}`}</DialogTitle>
					<DialogDescription>
						{formatNightLabel(formNight)} · saved as an admin entry, stamped with your name
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4" noValidate>
					{serverError && (
						<Alert variant="destructive" role="alert">
							<AlertDescription>{serverError}</AlertDescription>
						</Alert>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="nightDate">{shift === "night" ? "Night" : "Date"}</Label>
						<Input id="nightDate" type="date" aria-invalid={!!errors.nightDate} {...register("nightDate")} />
						{errors.nightDate && <p className="text-xs text-destructive">{errors.nightDate.message}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="userId">Analyst</Label>
						<Select
							value={selectedUser}
							onValueChange={(v) => v && setValue("userId", v, { shouldDirty: true, shouldValidate: true })}
						>
							<SelectTrigger id="userId" className="w-full"><SelectValue /></SelectTrigger>
							<SelectContent>
								{people.map((person) => (
									<SelectItem key={person.id} value={person.id}>
										{personName(person)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{errors.userId && <p className="text-xs text-destructive">{errors.userId.message}</p>}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="signedIn">Signed in</Label>
							<Input id="signedIn" type="time" aria-invalid={!!errors.signedIn} {...register("signedIn")} />
							{errors.signedIn && <p className="text-xs text-destructive">{errors.signedIn.message}</p>}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="signedOut">Signed out</Label>
							<Input id="signedOut" type="time" aria-invalid={!!errors.signedOut} {...register("signedOut")} />
							{errors.signedOut && <p className="text-xs text-destructive">{errors.signedOut.message}</p>}
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						Prefilled with the standard {meta.noun} shift ({shiftHoursSummary(shift)}). Adjust either time if
						it was different. Clear sign-out to record the {meta.noun} as still open, which leaves the hours
						unknown rather than counting them as zero.
					</p>

					<div className="space-y-1.5">
						<Label htmlFor="note">
							Note <span className="font-normal text-muted-foreground">(optional)</span>
						</Label>
						<Input id="note" type="text" placeholder="Why this was added or changed" {...register("note")} />
						{errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
					</div>
				</form>

				<DialogFooter className="sm:justify-between">
					{existing ? (
						<Button
							type="button"
							variant="outline"
							onClick={removeNight}
							disabled={removing || isSubmitting}
							className="border-destructive/40 text-destructive hover:bg-destructive/10"
						>
							{removing && <Loader2 className="animate-spin" />}
							{removing ? "Removing…" : `Remove ${meta.noun}`}
						</Button>
					) : (
						<span />
					)}

					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="button" onClick={onSubmit} disabled={isSubmitting || removing}>
							{isSubmitting && <Loader2 className="animate-spin" />}
							{isSubmitting ? "Saving…" : `Save ${meta.noun}`}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
