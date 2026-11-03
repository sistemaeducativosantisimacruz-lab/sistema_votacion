import { getSystemVotingModeAction } from "@/app/actions/apafa";
import StudentLoginClient from "./StudentLoginClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const modeRes = await getSystemVotingModeAction();
  const defaultMode = modeRes?.modo || "escolar";

  return <StudentLoginClient initialVotingMode={defaultMode} />;
}
