"use client";

import NibbsSettings from "@/app/components/NibbsSettings";
import { useMaster } from "@/app/components/providers/MasterProvider";

// NIBBS Settings ("/settings"). Bridges the master provider to the (unchanged)
// prop-driven editor. `version` remounts the editor after a reset to defaults.
export default function SettingsPage() {
	const { master, version, updateMaster, resetMaster } = useMaster();
	return (
		<NibbsSettings
			key={version}
			master={master}
			onSave={updateMaster}
			onReset={resetMaster}
		/>
	);
}
