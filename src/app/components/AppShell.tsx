"use client";

import { useEffect, useState } from "react";
import SettlementAuditor from "./SettlementAuditor";
import NibbsSettings from "./NibbsSettings";
import {
	DEFAULT_MASTER,
	loadMaster,
	resetMaster,
	saveMaster,
	type MasterBank,
} from "@/lib/master";

type ViewId = "audit" | "settings";

interface NavItem {
	id: ViewId | string;
	label: string;
	icon: string;
	soon?: boolean;
}

const REPORTS: NavItem[] = [
	{ id: "audit", label: "Settlement Audit", icon: "🧾" },
	{ id: "lien", label: "Lien Safe", icon: "🔒", soon: true },
	{ id: "bucket", label: "Fraud Bucket", icon: "🪣", soon: true },
];

const CONFIG: NavItem[] = [
	{ id: "settings", label: "NIBBS Settings", icon: "⚙️" },
];

export default function AppShell() {
	const [view, setView] = useState<ViewId>("audit");
	const [mobileOpen, setMobileOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const [master, setMaster] = useState<MasterBank[]>(DEFAULT_MASTER);
	const [masterVersion, setMasterVersion] = useState(0);

	// Load persisted master once on mount (server renders defaults).
	useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect */
		setMaster(loadMaster());
		setMasterVersion((v) => v + 1);
		/* eslint-enable react-hooks/set-state-in-effect */
	}, []);

	const updateMaster = (list: MasterBank[]) => {
		setMaster(list);
		saveMaster(list);
	};
	const handleReset = () => {
		setMaster(resetMaster());
		setMasterVersion((v) => v + 1); // remount settings with fresh defaults
	};

	const go = (id: ViewId) => {
		setView(id);
		setMobileOpen(false);
	};

	const navGroup = (title: string, items: NavItem[], mini: boolean) => (
		<div className="mb-6">
			{mini ? (
				<div className="mx-3 mb-2 border-t border-border" />
			) : (
				<p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
					{title}
				</p>
			)}
			<nav className="space-y-1">
				{items.map((item) => {
					const active = item.id === view && !item.soon;
					return (
						<button
							key={item.id}
							disabled={item.soon}
							title={
								mini
									? item.label + (item.soon ? " (soon)" : "")
									: undefined
							}
							onClick={() => !item.soon && go(item.id as ViewId)}
							className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${
								mini
									? "justify-center px-0 py-2.5"
									: "gap-3 px-3 py-2"
							} ${
								active
									? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
									: item.soon
										? "cursor-not-allowed text-muted/60"
										: "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
							}`}
						>
							<span className="text-base" aria-hidden>
								{item.icon}
							</span>
							{!mini && (
								<>
									<span className="flex-1 text-left">
										{item.label}
									</span>
									{active && (
										<span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
									)}
									{item.soon && (
										<span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted dark:bg-white/10">
											Soon
										</span>
									)}
								</>
							)}
						</button>
					);
				})}
			</nav>
		</div>
	);

	const renderSidebar = (mini: boolean, showToggle: boolean) => (
		<div className="flex h-full flex-col">
			<div
				className={`flex items-center py-5 ${mini ? "justify-center px-2" : "gap-3 px-4"}`}
			>
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-lg text-white shadow-sm">
					🏦
				</div>
				{!mini && (
					<div className="min-w-0">
						<p className="truncate text-sm font-bold leading-tight text-foreground">
							NIBBS Reports
						</p>
						<p className="text-[11px] text-muted">
							Settlement toolkit
						</p>
					</div>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-3 py-2">
				{navGroup("Reports", REPORTS, mini)}
				{navGroup("Configuration", CONFIG, mini)}
			</div>
			<div className="border-t border-border px-3 py-3">
				{showToggle && (
					<button
						onClick={() => setCollapsed((c) => !c)}
						title={mini ? "Expand sidebar" : "Collapse sidebar"}
						className={`flex w-full items-center rounded-lg py-2 text-sm font-medium text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
							mini ? "justify-center px-0" : "gap-2 px-3"
						}`}
					>
						<span aria-hidden>{mini ? "»" : "«"}</span>
						{!mini && <span>Collapse</span>}
					</button>
				)}
				{!mini && (
					<p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
						Data stays in your browser. More reports coming soon.
					</p>
				)}
			</div>
		</div>
	);

	return (
		<div className="flex min-h-full">
			{/* Desktop sidebar (collapsible to icons) */}
			<aside
				className={`no-print sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface/70 backdrop-blur transition-[width] duration-200 ease-in-out md:block ${
					collapsed ? "w-16" : "w-64"
				}`}
			>
				{renderSidebar(collapsed, true)}
			</aside>

			{/* Mobile drawer (always full) */}
			{mobileOpen && (
				<div className="no-print fixed inset-0 z-40 md:hidden">
					<div
						className="absolute inset-0 bg-black/40"
						onClick={() => setMobileOpen(false)}
					/>
					<aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface shadow-xl">
						{renderSidebar(false, false)}
					</aside>
				</div>
			)}

			{/* Content column */}
			<div className="min-w-0 flex-1">
				{/* Mobile top bar */}
				<div className="no-print flex items-center gap-3 border-b border-border bg-surface/70 px-4 py-3 backdrop-blur md:hidden">
					<button
						onClick={() => setMobileOpen(true)}
						className="rounded-lg border border-border px-3 py-1.5 text-lg leading-none"
						aria-label="Open menu"
					>
						☰
					</button>
					<span className="text-sm font-bold text-foreground">
						NIBBS Reports
					</span>
				</div>

				{/* Views (kept mounted to preserve in-progress work) */}
				<div className={view === "audit" ? "block" : "hidden"}>
					<SettlementAuditor master={master} />
				</div>
				<div className={view === "settings" ? "block" : "hidden"}>
					<NibbsSettings
						key={masterVersion}
						master={master}
						onSave={updateMaster}
						onReset={handleReset}
					/>
				</div>
			</div>
		</div>
	);
}
