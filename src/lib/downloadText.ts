/**
 * Save a text file in the browser with its bytes untouched (CRLF stays CRLF).
 * Revokes the object URL on the next frame, after the click has started the download.
 */
export function downloadText(fileName: string, text: string): void {
	const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	requestAnimationFrame(() => URL.revokeObjectURL(url));
}
