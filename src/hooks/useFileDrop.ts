"use client";

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface UseFileDropOptions {
	accept?: string;
	multiple?: boolean;
}

/**
 * Drag-and-drop + file-picker wiring for any element. Tracks enter/leave depth
 * so hovering over child elements doesn't flicker the drop state, and reports
 * how many files are being dragged so the UI can say "Drop 8 files".
 */
export function useFileDrop(onFiles: (files: File[]) => void, { accept, multiple = true }: UseFileDropOptions = {}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const depth = useRef(0);
	const [dragging, setDragging] = useState(false);
	const [dragCount, setDragCount] = useState(0);

	const open = useCallback(() => inputRef.current?.click(), []);

	const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

	const dropProps = {
		onDragEnter: (e: DragEvent<HTMLElement>) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			depth.current += 1;
			setDragging(true);
			setDragCount(e.dataTransfer.items.length);
		},
		onDragOver: (e: DragEvent<HTMLElement>) => {
			if (hasFiles(e)) e.preventDefault();
		},
		onDragLeave: () => {
			depth.current = Math.max(0, depth.current - 1);
			if (depth.current === 0) setDragging(false);
		},
		onDrop: (e: DragEvent<HTMLElement>) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			depth.current = 0;
			setDragging(false);
			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
		},
	};

	const inputProps = {
		ref: inputRef,
		type: "file" as const,
		accept,
		multiple,
		hidden: true,
		onChange: (e: ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files ?? []);
			if (files.length > 0) onFiles(files);
			// Let the same file be picked again after it's been fixed.
			e.target.value = "";
		},
	};

	return { dragging, dragCount, open, dropProps, inputProps };
}
