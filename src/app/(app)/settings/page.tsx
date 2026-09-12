"use client";

import NibbsSettings from "@/app/components/NibbsSettings";
import { useMaster } from "@/app/components/providers/MasterProvider";
import { useAuthUser } from "@/app/components/providers/SessionProvider";
import { canEditMasterBanks } from "@/lib/permissions";

// NIBBS Settings ("/settings"). Bridges the master provider to the (unchanged)
// prop-driven editor. `version` remounts the editor after a reset to defaults.
//
// Everyone may open this screen; only an admin may change it. The flag decides
// what renders, and /api/banks re-checks the same rule before any write.
export default function SettingsPage() {
	const { master, version, updateMaster, resetMaster } = useMaster();
	const user = useAuthUser();

	return (
		<NibbsSettings
			key={version}
			master={master}
			canEdit={canEditMasterBanks(user.role)}
			onSave={updateMaster}
			onReset={resetMaster}
		/>
	);
}
