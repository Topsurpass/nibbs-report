"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clampStep } from "@/lib/onboarding/tourState";

export interface TourStep {
	/** Short heading, e.g. "Confirm the bank column". */
	title: string;
	/** One or two sentences. Keep it to what the analyst must actually do. */
	body: ReactNode;
	/** Optional inline mock of the UI being described. */
	visual?: ReactNode;
	/** Emoji shown in the step chip. */
	icon: string;
}

interface TourModalProps {
	open: boolean;
	title: string;
	steps: TourStep[];
	/** Finished or dismissed — the caller records it as seen either way. */
	onDone: () => void;
}

/**
 * A stepped walkthrough dialog.
 *
 * Deliberately self-contained rather than a spotlight over live DOM: most of
 * this feature's UI (bank table, column picker, unmapped banner) only exists
 * after a file is uploaded, so anchoring to real elements would leave a
 * first-time visitor pointing at nothing. Each step carries its own small mock
 * instead, which also keeps the tour readable on mobile.
 *
 * Generic on purpose — it takes `steps` and knows nothing about escalations, so
 * the next feature gets a walkthrough by writing content, not components.
 */
export default function TourModal({ open, title, steps, onDone }: TourModalProps) {
	const [index, setIndex] = useState(0);
	const dialogRef = useRef<HTMLDivElement>(null);
	const nextRef = useRef<HTMLButtonElement>(null);
	const previouslyFocused = useRef<Element | null>(null);

	const total = steps.length;
	const step = clampStep(index, total);
	const isLast = step === total - 1;
	const isFirst = step === 0;

	const go = useCallback((to: number) => setIndex(clampStep(to, total)), [total]);
	const next = useCallback(() => setIndex((i) => clampStep(i + 1, total)), [total]);
	const back = useCallback(() => setIndex((i) => clampStep(i - 1, total)), [total]);

	// Restart at step 1 each time it opens. Adjusting state during render (rather
	// than in an effect) is React's documented way to reset on a prop change — it
	// re-renders before painting, so no intermediate frame shows the old step.
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setIndex(0);
	}

	// Park focus on the primary action so the tour is immediately keyboard-driven.
	useEffect(() => {
		if (!open) return;
		previouslyFocused.current = document.activeElement;
		const id = requestAnimationFrame(() => nextRef.current?.focus());
		return () => cancelAnimationFrame(id);
	}, [open]);

	// Return focus where it came from, so dismissing does not dump the user at
	// the top of the page.
	useEffect(() => {
		if (open) return;
		const el = previouslyFocused.current;
		if (el instanceof HTMLElement) el.focus();
	}, [open]);

	// The page behind a modal must not scroll.
	useEffect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open]);

	// Keyboard: arrows to move, Escape to dismiss, Tab trapped inside.
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onDone();
				return;
			}
			if (e.key === "ArrowRight") {
				e.preventDefault();
				next();
				return;
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				back();
				return;
			}
			if (e.key !== "Tab") return;

			const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			);
			if (!focusable || focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, next, back, onDone]);

	if (!open || total === 0) return null;

	const current = steps[step];

	return (
		<div className="no-print fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
			{/* Backdrop. Clicking it dismisses, same as Skip. */}
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onDone}
				aria-hidden
			/>

			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="tour-title"
				aria-describedby="tour-body"
				className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
			>
				<div className="hero-gradient px-6 py-5 text-white">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
								{title}
							</p>
							<h2 id="tour-title" className="mt-1 text-lg font-bold leading-tight">
								<span className="mr-1.5" aria-hidden>
									{current.icon}
								</span>
								{current.title}
							</h2>
						</div>
						<button
							type="button"
							onClick={onDone}
							aria-label="Skip the walkthrough"
							className="shrink-0 rounded-lg px-2 py-1 text-sm text-white/80 transition-colors hover:bg-white/15 hover:text-white"
						>
							Skip
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-6 py-5">
					<div id="tour-body" className="text-sm leading-relaxed text-foreground">
						{current.body}
					</div>
					{current.visual && <div className="mt-4">{current.visual}</div>}
				</div>

				<div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
					{/* Dots double as direct navigation. */}
					<div className="flex items-center gap-1.5" role="tablist" aria-label="Walkthrough steps">
						{steps.map((s, i) => (
							<button
								key={s.title}
								type="button"
								role="tab"
								aria-selected={i === step}
								aria-label={`Step ${i + 1}: ${s.title}`}
								onClick={() => go(i)}
								className={`h-2 rounded-full transition-all ${
									i === step
										? "w-5 bg-indigo-600 dark:bg-indigo-400"
										: "w-2 bg-border hover:bg-muted"
								}`}
							/>
						))}
						<span className="ml-2 text-xs tabular-nums text-muted">
							{step + 1} of {total}
						</span>
					</div>

					<div className="flex shrink-0 gap-2">
						{!isFirst && (
							<button
								type="button"
								onClick={back}
								className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
							>
								Back
							</button>
						)}
						<button
							ref={nextRef}
							type="button"
							onClick={isLast ? onDone : next}
							className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
						>
							{isLast ? "Done" : "Next"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
