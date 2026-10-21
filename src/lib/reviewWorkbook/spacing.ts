// Make tabs and spaces visible to a non-developer, and name a spacing mistake
// in plain words. Used by every review workbook and on-screen fix list.

/**
 * "702 [SPACE] 2026/07/02 [TAB] …" so a non-developer can see the separators.
 * The spaces around each marker are only there so Excel can wrap long lines.
 */
export function showSpacing(line: string): string {
	return line
		.split(/(\t| )/)
		.map((part) => (part === "\t" ? "[TAB]" : part === " " ? "[SPACE]" : part))
		.filter((part) => part !== "")
		.join(" ");
}

const GAPS = ["702 and the date", "the date and the bank code", "the bank code and the amount"];

/** "Space instead of TAB between 702 and the date", in plain words. */
export function spacingProblem(line: string): string {
	if (/^\s/.test(line)) return "Space or TAB before 702 at the start";
	if (/[ \t]$/.test(line)) return "Space or TAB after the amount at the end";
	const seps = line.match(/\s+/g) ?? [];
	const at = seps.findIndex((sep) => sep !== "\t");
	if (at === -1) return "Wrong spacing";
	const gap = GAPS[at] ? ` between ${GAPS[at]}` : "";
	return seps[at].includes(" ") ? `Space instead of TAB${gap}` : `Extra TAB${gap}`;
}
