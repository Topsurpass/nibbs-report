"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MasterBank } from "@/lib/master";

/**
 * Holds the master bank list for the whole authed app. Mounted in the persistent
 * (app) layout so the list — and any unsaved edits made through it — survive
 * navigation between routes. Reads seed from the server; writes go to the DB via
 * the banks API. `version` bumps on reset so the settings editor can remount with
 * the fresh list (its draft is seeded once from the prop).
 */

interface MasterContextValue {
	master: MasterBank[];
	version: number;
	updateMaster: (list: MasterBank[]) => Promise<MasterBank[]>;
	resetMaster: () => Promise<MasterBank[]>;
}

const MasterContext = createContext<MasterContextValue | null>(null);

export function MasterProvider({
	initialMaster,
	children,
}: {
	initialMaster: MasterBank[];
	children: ReactNode;
}) {
	const [master, setMaster] = useState<MasterBank[]>(initialMaster);
	const [version, setVersion] = useState(0);

	const updateMaster = async (list: MasterBank[]): Promise<MasterBank[]> => {
		const res = await fetch("/api/banks", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(list),
		});
		const data = await res.json();
		if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save banks.");
		setMaster(data.banks);
		return data.banks;
	};

	const resetMaster = async (): Promise<MasterBank[]> => {
		const res = await fetch("/api/banks/reset", { method: "POST" });
		const data = await res.json();
		if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't reset banks.");
		setMaster(data.banks);
		setVersion((v) => v + 1);
		return data.banks;
	};

	return (
		<MasterContext.Provider value={{ master, version, updateMaster, resetMaster }}>
			{children}
		</MasterContext.Provider>
	);
}

export function useMaster(): MasterContextValue {
	const ctx = useContext(MasterContext);
	if (!ctx) throw new Error("useMaster must be used within MasterProvider");
	return ctx;
}
