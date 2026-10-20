import type { Config } from "@/types/config/config"
import { logger } from "@/utils/logger"

const JALAPENO_CLOUD_PROVIDER_TYPE = "jalapenocloud"

/**
 * This fork does not ship the Jalapeno Cloud sponsorship, but the v097 → v098 migration seeded a
 * Jalapeno Cloud provider into every existing profile. This drops each one the user never set
 * up: no API key, and no feature, action or detection slot pointing at it. One with a key, or one
 * still in use, is left alone — removing it would lose the user's setup or leave a dangling
 * provider id, which fails validation and resets the whole config.
 *
 * Runs before schema parsing, on stored, imported and synced configs alike.
 */
export function removeUnusedJalapenoCloudProviders(config: Config): Config {
  try {
    const providersConfig = config.providersConfig ?? []
    const removable = providersConfig.filter((provider) => {
      if (provider.provider !== JALAPENO_CLOUD_PROVIDER_TYPE) return false
      if ("apiKey" in provider && provider.apiKey) return false

      const rest = { ...config, providersConfig: providersConfig.filter((p) => p !== provider) }
      return !JSON.stringify(rest).includes(JSON.stringify(provider.id))
    })
    if (removable.length === 0) return config

    return {
      ...config,
      providersConfig: providersConfig.filter((provider) => !removable.includes(provider)),
    }
  } catch (error) {
    // A config too malformed to walk is validation's to reject, not this pass's.
    logger.warn("[Config] Could not remove unused Jalapeno Cloud providers", error)
    return config
  }
}
