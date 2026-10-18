"use client";

import { useEffect, useState } from "react";

/** Dialogs carrying this attribute don't count (so a dialog can ignore itself). */
export const IGNORE_DIALOG_ATTR = "data-ignore-dialog-watch";

const SELECTOR = `[role="dialog"]:not([${IGNORE_DIALOG_ATTR}]), [role="alertdialog"]:not([${IGNORE_DIALOG_ATTR}])`;

/**
 * True while any other dialog (onboarding tour, admin form, command palette…)
 * is open, so a low-priority pop-up can wait its turn instead of stacking.
 */
export function useOtherDialogOpen(): boolean {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const check = () => setOpen(document.querySelector(SELECTOR) !== null);
		const observer = new MutationObserver(check);
		observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"] });
		// First reading after mount, outside the effect body.
		const id = requestAnimationFrame(check);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(id);
		};
	}, []);
	return open;
}
