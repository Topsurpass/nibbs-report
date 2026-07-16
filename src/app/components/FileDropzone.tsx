"use client";

import { useCallback, useRef, useState } from "react";

interface FileDropzoneProps {
  title: string;
  subtitle: string;
  accept: string;
  file: File | null;
  summary?: string;
  error?: string;
  accent: "teal" | "indigo";
  onSelect: (file: File) => void;
}

const ACCENT: Record<string, string> = {
  teal: "from-teal-500/15 to-teal-500/5 ring-teal-500/30 text-teal-600 dark:text-teal-300",
  indigo:
    "from-indigo-500/15 to-indigo-500/5 ring-indigo-500/30 text-indigo-600 dark:text-indigo-300",
};

export default function FileDropzone({
  title,
  subtitle,
  accept,
  file,
  summary,
  error,
  accent,
  onSelect,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) onSelect(files[0]);
    },
    [onSelect],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`group relative cursor-pointer rounded-2xl border border-dashed bg-gradient-to-br p-6 ring-1 ring-inset transition-all ${
        ACCENT[accent]
      } ${
        dragging
          ? "border-transparent scale-[1.01] shadow-lg"
          : "border-border hover:shadow-md"
      } ${file ? "bg-surface" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/70 text-2xl shadow-sm ring-1 ring-inset ring-black/5 dark:bg-white/10 ${ACCENT[accent]}`}
        >
          {file ? "✓" : "⬆"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          {file ? (
            <div className="mt-3">
              <p className="truncate text-sm font-medium text-foreground" title={file.name}>
                {file.name}
              </p>
              {summary && <p className="mt-0.5 text-xs text-muted">{summary}</p>}
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium">
              Drag &amp; drop or <span className="underline">browse</span>
            </p>
          )}
          {error && (
            <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
