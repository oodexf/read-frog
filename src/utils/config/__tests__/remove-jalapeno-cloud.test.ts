import type { Config } from "@/types/config/config"
import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { removeUnusedJalapenoCloudProviders } from "../remove-jalapeno-cloud"

const SEEDED_JALAPENO = {
  id: "jalapenocloud-default",
  name: "Jalapeno Cloud",
  enabled: true,
  provider: "jalapenocloud",
  baseURL: "https://api.jalapeno-cloud.ai/v1",
  model: { model: "GLM-5.2", isCustomModel: false, customModel: null },
} as const

function configWith(jalapeno: Record<string, unknown> = SEEDED_JALAPENO): Config {
  return {
    ...structuredClone(DEFAULT_CONFIG),
    providersConfig: [...structuredClone(DEFAULT_CONFIG.providersConfig), jalapeno],
  } as Config
}

describe("removeUnusedJalapenoCloudProviders", () => {
  it("drops the seeded provider the user never set up", () => {
    const result = removeUnusedJalapenoCloudProviders(configWith())

    expect(result.providersConfig.map((provider) => provider.id)).toEqual(
      DEFAULT_CONFIG.providersConfig.map((provider) => provider.id),
    )
    expect(configSchema.safeParse(result).success).toBe(true)
  })

  it("keeps a provider that has an API key", () => {
    const config = configWith({ ...SEEDED_JALAPENO, apiKey: "sk-test" })

    expect(removeUnusedJalapenoCloudProviders(config)).toBe(config)
  })

  it("keeps a provider a feature still points at", () => {
    const config = configWith()
    config.selectionToolbar.builtInActions.dictionary.providerId = SEEDED_JALAPENO.id

    expect(removeUnusedJalapenoCloudProviders(config)).toBe(config)
  })

  it("keeps a provider language detection still points at", () => {
    const config = configWith()
    config.languageDetection = { mode: "llm", providerId: SEEDED_JALAPENO.id }

    expect(removeUnusedJalapenoCloudProviders(config)).toBe(config)
  })

  it("returns the same object when there is nothing to remove", () => {
    const config = structuredClone(DEFAULT_CONFIG)

    expect(removeUnusedJalapenoCloudProviders(config)).toBe(config)
  })
})
