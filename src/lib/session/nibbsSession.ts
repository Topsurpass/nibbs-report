// NIBBS settlement session mapping.
//
// Each settlement cycle is encoded two ways in the uploaded filenames:
//   - the HTML file ends in a letter:   "2026-07-22 B.html"      → B
//   - the eTranzact txt ends in _<n>:   "ETRANZACT_22072026_2.txt" → 2
// Both encode the same session. We map each to a human label and, when both are
// present, require them to agree — a mismatch means the wrong pair of files was
// uploaded together, which must be surfaced, not guessed past.

/** The four daily NIBBS sessions, in cycle order (index 0 = first cycle). */
export const SESSION_LABELS = ["8am", "11am", "2pm", "5pm"] as const;
export type SessionLabel = (typeof SESSION_LABELS)[number];

/** HTML suffix letters A..D → session, derived from the ordered list. */
export const SESSION_BY_LETTER: Record<string, SessionLabel> = {
	A: SESSION_LABELS[0],
	B: SESSION_LABELS[1],
	C: SESSION_LABELS[2],
	D: SESSION_LABELS[3],
};

/** txt sequence "1".."4" → session, derived from the same ordered list. */
export const SESSION_BY_SEQ: Record<string, SessionLabel> = {
	"1": SESSION_LABELS[0],
	"2": SESSION_LABELS[1],
	"3": SESSION_LABELS[2],
	"4": SESSION_LABELS[3],
};

export interface SessionResolution {
	/** The agreed session label, or undefined when unresolved/mismatched. */
	label?: SessionLabel;
	/** Label implied by the HTML filename letter, if parseable. */
	htmlLabel?: SessionLabel;
	/** Label implied by the txt sequence, if parseable. */
	txtLabel?: SessionLabel;
	/** True only when both sources are present and agree. */
	match: boolean;
	/** Human-readable reason when there is no confident label. */
	error?: string;
}

/** The HTML letter is the last token of the basename, e.g. "2026-07-22 B". */
const HTML_LETTER_RE = /(?:^|[\s._-])([A-Da-d])$/;

function stripHtmlExt(name: string): string {
	return name.replace(/\.html?$/i, "").trim();
}

/** Parse the trailing A..D letter from an HTML filename → session label. */
export function sessionFromHtmlName(name: string): SessionLabel | undefined {
	const base = stripHtmlExt(name);
	const m = base.match(HTML_LETTER_RE);
	if (!m) return undefined;
	return SESSION_BY_LETTER[m[1].toUpperCase()];
}

/** Map the eTranzact txt sequence ("1".."4") → session label. */
export function sessionFromTxtSequence(seq: string | undefined): SessionLabel | undefined {
	if (!seq) return undefined;
	return SESSION_BY_SEQ[seq.trim()];
}

/**
 * Resolve the settlement session from both filenames. Both present and matching →
 * confident label. One present → use it. Present-but-disagreeing → error, no label.
 */
export function resolveSession(
	htmlName: string | undefined,
	txtSeq: string | undefined,
): SessionResolution {
	const htmlLabel = htmlName ? sessionFromHtmlName(htmlName) : undefined;
	const txtLabel = sessionFromTxtSequence(txtSeq);

	if (htmlLabel && txtLabel) {
		if (htmlLabel === txtLabel) {
			return { label: htmlLabel, htmlLabel, txtLabel, match: true };
		}
		return {
			htmlLabel,
			txtLabel,
			match: false,
			error: `Session mismatch: HTML says ${htmlLabel}, eTranzact says ${txtLabel}`,
		};
	}

	if (htmlLabel) {
		return {
			label: htmlLabel,
			htmlLabel,
			match: false,
			error: "eTranzact sequence didn't resolve to a session; using the HTML letter.",
		};
	}
	if (txtLabel) {
		return {
			label: txtLabel,
			txtLabel,
			match: false,
			error: "HTML filename letter didn't resolve to a session; using the eTranzact sequence.",
		};
	}

	return {
		match: false,
		error: "No NIBBS session — HTML name needs a trailing A/B/C/D and the txt an _1.._4 sequence.",
	};
}

/** "11am" → "11am NIBBS". Central so UI/rows/checks phrase it identically. */
export function sessionRowLabel(label: SessionLabel): string {
	return `${label} NIBBS`;
}
