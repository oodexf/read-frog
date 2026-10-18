import { env } from "@/env"
import { i18n } from "@/utils/i18n"
import { ConfigSection } from "../../../components/config-section"
import { AnalyticsItem } from "./analytics"
import { BetaExperienceItem } from "./beta-experience"

export function UserExperienceSection() {
  return (
    <ConfigSection title={i18n.t("options.preference.userExperience.title")}>
      <BetaExperienceItem />
      {/* A local-only build never starts analytics, so there is nothing to opt out of. */}
      {!env.WXT_LOCAL_ONLY && <AnalyticsItem />}
    </ConfigSection>
  )
}
