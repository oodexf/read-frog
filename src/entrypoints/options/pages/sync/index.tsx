import { i18n } from "@/utils/i18n"
import { ConfigNavItem } from "../../components/config-nav-item"
import { ConfigSection } from "../../components/config-section"
import { PageLayout } from "../../components/page-layout"
import { GoogleDriveSyncConfigItem } from "../preference/config/google-drive-sync"
import { ManualConfigSyncConfigItems } from "../preference/config/manual-config-sync"

// Every way the config leaves this browser, gathered from the Preference page.
// Google Drive and manual sync stay in preference/config, where upstream keeps them.
export function SyncPage() {
  return (
    <PageLayout
      title={i18n.t("syncSettings.title")}
      description={i18n.t("syncSettings.pageDescription")}
      innerClassName="flex flex-col gap-10"
    >
      <ConfigSection title={i18n.t("syncSettings.cloud.title")}>
        <GoogleDriveSyncConfigItem />
        <ConfigNavItem
          to="/sync/webdav-backup"
          title={i18n.t("options.preference.config.webdav.title")}
          description={i18n.t("options.preference.config.webdav.navDescription")}
        />
      </ConfigSection>
      <ConfigSection title={i18n.t("syncSettings.manual.title")}>
        <ManualConfigSyncConfigItems />
      </ConfigSection>
    </PageLayout>
  )
}
