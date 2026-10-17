"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatAmount } from "@/lib/escalation/parseRows";
import type { BankGroup } from "@/lib/escalation/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface UnmappedBannerProps {
	groups: BankGroup[];
	/** Persist a code -> name mapping; resolves once it is saved and applied. */
	onSave: (code: string, name: string) => Promise<void>;
}

/**
 * Surfaces bank codes the directory does not recognise and lets the analyst name
 * them on the spot.
 *
 * These rows are never dropped — they already have an `UNMAPPED-<code>` file
 * waiting. Naming a code here writes it to the database, so the next upload
 * routes it to a properly named bank without anyone re-doing this.
 */
export default function UnmappedBanner({ groups, onSave }: UnmappedBannerProps) {
	const [names, setNames] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});

	if (groups.length === 0) return null;

	const rows = groups.reduce((n, g) => n + g.rows.length, 0);
	const total = groups.reduce((n, g) => n + g.total, 0);

	const save = async (code: string) => {
		const name = (names[code] ?? "").trim();
		if (!name) {
			setErrors((e) => ({ ...e, [code]: "Enter the bank's name." }));
			return;
		}
		setSaving(code);
		setErrors((e) => ({ ...e, [code]: "" }));
		try {
			await onSave(code, name);
			setNames((n) => ({ ...n, [code]: "" }));
		} catch (err) {
			setErrors((e) => ({
				...e,
				[code]: err instanceof Error ? err.message : "Couldn't save that mapping.",
			}));
		} finally {
			setSaving(null);
		}
	};

	return (
		<Card className="border-warning/40 bg-warning/10 p-5">
			<h2 className="flex items-center gap-1.5 text-sm font-semibold text-warning">
				<AlertTriangle className="size-4" />
				{groups.length} unrecognised bank {groups.length === 1 ? "code" : "codes"} — {rows} transaction
				{rows === 1 ? "" : "s"}, {formatAmount(total)}
			</h2>
			<p className="mt-1 text-xs text-warning/80">
				These rows are still included, in an <code>UNMAPPED</code> file each. Name a code here and it applies to
				every future upload.
			</p>

			<div className="mt-4 space-y-3">
				{groups.map((group) => (
					<div key={group.code} className="flex flex-wrap items-start gap-2">
						<span className="mt-2 w-14 shrink-0 font-mono text-sm font-bold text-warning">
							{group.code}
						</span>
						<span className="mt-2 w-44 shrink-0 text-xs text-warning/80">
							{group.rows.length} txn{group.rows.length === 1 ? "" : "s"} · {formatAmount(group.total)}
						</span>
						<div className="min-w-[200px] flex-1">
							<Input
								value={names[group.code] ?? ""}
								onChange={(e) => setNames((n) => ({ ...n, [group.code]: e.target.value }))}
								onKeyDown={(e) => {
									if (e.key === "Enter") void save(group.code);
								}}
								placeholder="Bank name (e.g. NOMBA FS)"
								maxLength={120}
								aria-label={`Bank name for code ${group.code}`}
								className="border-warning/40 focus-visible:border-warning"
							/>
							{errors[group.code] && <p className="mt-1 text-xs font-medium text-destructive">{errors[group.code]}</p>}
						</div>
						<Button
							type="button"
							onClick={() => void save(group.code)}
							disabled={saving === group.code}
							className="bg-warning text-warning-foreground hover:bg-warning/90"
						>
							{saving === group.code && <Loader2 className="animate-spin" />}
							{saving === group.code ? "Saving…" : "Save mapping"}
						</Button>
					</div>
				))}
			</div>
		</Card>
	);
}
