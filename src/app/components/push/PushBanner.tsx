"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePush } from "../providers/PushProvider";
import { PUSH_HELP, PUSH_PITCH } from "./pushCopy";

const DISMISS_KEY = "nibbs:push-banner-dismissed";

/**
 * Duty Register nudge to turn notifications on, until it's on or dismissed.
 * Permission is only ever asked from the button, never on page load.
 */
export default function PushBanner() {
	const { state, busy, error, enable } = usePush();
	const [dismissed, setDismissed] = useState(true);

	useEffect(() => {
		try {
			/* eslint-disable-next-line react-hooks/set-state-in-effect */
			setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
		} catch {
			setDismissed(false);
		}
	}, []);

	if (dismissed || state === "on" || state === "loading" || state === "unsupported" || state === "unavailable") return null;

	const close = () => {
		setDismissed(true);
		try {
			window.localStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// Storage blocked: it just shows again next time.
		}
	};

	return (
		<div className="no-print flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
			<div className="flex items-start gap-3">
				<div className="hero-gradient flex size-10 shrink-0 items-center justify-center rounded-lg text-white">
					<BellRing className="size-5" />
				</div>
				<div className="space-y-0.5">
					<p className="text-sm font-semibold text-foreground">Never miss a sign-in or sign-out</p>
					<p className="text-xs text-muted-foreground">{state === "off" ? PUSH_PITCH : PUSH_HELP[state]}</p>
					{error && <p className="text-xs font-medium text-destructive">{error}</p>}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1 sm:ml-auto">
				{state === "off" && (
					<Button onClick={() => void enable()} disabled={busy}>
						{busy ? <Loader2 className="animate-spin" /> : <BellRing className="size-4" />}
						Turn on notifications
					</Button>
				)}
				<Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={close}>
					<X className="size-4" />
				</Button>
			</div>
		</div>
	);
}
