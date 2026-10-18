import type { Config } from "@/types/config/config"
import { describe, expect, it, vi } from "vitest"
import { configSchema } from "@/types/config/config"
import {
  buildFreshDefaultConfig,
  createDefaultDictionaryAction,
  DEFAULT_CONFIG,
} from "@/utils/constants/config"
import {
  BUILT_IN_AI_ADVANCE_PROVIDER_ID,
  BUILT_IN_AI_PROVIDER_ID,
  DEFAULT_BUILT_IN_ACTION_PROVIDER_ID,
} from "@/utils/constants/provider-ids"
import {
  DEFAULT_PROVIDER_CONFIG,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
import {
  getProviderIdsForCapability,
  getSelectableProvidersForCapability,
  resolveProviderRefForCapability,
} from "@/utils/providers/provider-registry"
import { replaceBuiltInAiProviders } from "../local-only"

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>()
  return { env: { ...actual.env, WXT_LOCAL_ONLY: true } }
})

const OPENAI_ID = DEFAULT_PROVIDER_CONFIG.openai.id

function configOnBuiltInAi(): Config {
  const config = structuredClone(DEFAULT_CONFIG)
  config.pageTranslation.providerId = BUILT_IN_AI_PROVIDER_ID
  config.videoSubtitles.providerId = BUILT_IN_AI_ADVANCE_PROVIDER_ID
  config.selectionToolbar.features.translate.providerId = BUILT_IN_AI_PROVIDER_ID
  config.inputTranslation.providerId = BUILT_IN_AI_PROVIDER_ID
  config.selectionToolbar.noteSuggestion.providerId = BUILT_IN_AI_PROVIDER_ID
  config.selectionToolbar.builtInActions.dictionary.providerId = BUILT_IN_AI_PROVIDER_ID
  config.selectionToolbar.builtInActions.sentenceAnalysis.providerId =
    BUILT_IN_AI_ADVANCE_PROVIDER_ID
  config.selectionToolbar.builtInActions.improveWriting.providerId = BUILT_IN_AI_PROVIDER_ID
  config.languageDetection = { mode: "llm", providerId: BUILT_IN_AI_PROVIDER_ID }
  return config
}

describe("provider registry in a local-only build", () => {
  it("never offers or resolves the built-in AI providers", () => {
    const providersConfig = DEFAULT_CONFIG.providersConfig

    expect(
      getSelectableProvidersForCapability("customAction", providersConfig).map((p) => p.id),
    ).not.toContain(BUILT_IN_AI_PROVIDER_ID)
    expect(getProviderIdsForCapability("pageTranslation", providersConfig)).not.toContain(
      BUILT_IN_AI_ADVANCE_PROVIDER_ID,
    )
    expect(
      resolveProviderRefForCapability("customAction", providersConfig, BUILT_IN_AI_PROVIDER_ID),
    ).toBeNull()
  })

  it("rejects a config that still points at the built-in AI", () => {
    expect(configSchema.safeParse(configOnBuiltInAi()).success).toBe(false)
  })
})

describe("default config in a local-only build", () => {
  it("starts the built-in actions on the OpenAI default provider", () => {
    expect(DEFAULT_BUILT_IN_ACTION_PROVIDER_ID).toBe(OPENAI_ID)
    for (const config of [DEFAULT_CONFIG, buildFreshDefaultConfig()]) {
      const { builtInActions } = config.selectionToolbar
      expect(builtInActions.dictionary.providerId).toBe(OPENAI_ID)
      expect(builtInActions.sentenceAnalysis.providerId).toBe(OPENAI_ID)
      expect(builtInActions.improveWriting.providerId).toBe(OPENAI_ID)
      expect(configSchema.safeParse(config).success).toBe(true)
    }
  })
})

describe("replaceBuiltInAiProviders", () => {
  it("moves every built-in AI slot onto a local provider, leaving a valid config", () => {
    const config = configOnBuiltInAi()
    config.selectionToolbar.customActions = [
      { ...createDefaultDictionaryAction(), id: "custom-1", providerId: BUILT_IN_AI_PROVIDER_ID },
    ]

    const result = replaceBuiltInAiProviders(config)

    expect(result.pageTranslation.providerId).toBe(MICROSOFT_TRANSLATE_PROVIDER_ID)
    expect(result.videoSubtitles.providerId).toBe(MICROSOFT_TRANSLATE_PROVIDER_ID)
    expect(result.selectionToolbar.features.translate.providerId).toBe(
      MICROSOFT_TRANSLATE_PROVIDER_ID,
    )
    expect(result.inputTranslation.providerId).toBe(MICROSOFT_TRANSLATE_PROVIDER_ID)
    expect(result.selectionToolbar.noteSuggestion.providerId).toBe(OPENAI_ID)
    expect(result.selectionToolbar.builtInActions.dictionary.providerId).toBe(OPENAI_ID)
    expect(result.selectionToolbar.builtInActions.sentenceAnalysis.providerId).toBe(OPENAI_ID)
    expect(result.selectionToolbar.builtInActions.improveWriting.providerId).toBe(OPENAI_ID)
    expect(result.selectionToolbar.customActions[0]?.providerId).toBe(OPENAI_ID)
    expect(result.languageDetection).toEqual({ mode: "llm", providerId: OPENAI_ID })
    expect(configSchema.safeParse(result).success).toBe(true)
    // The input is left as it was.
    expect(config.pageTranslation.providerId).toBe(BUILT_IN_AI_PROVIDER_ID)
  })

  it("falls back to another enabled provider when the preferred one is off", () => {
    const config = configOnBuiltInAi()
    config.providersConfig = config.providersConfig.map((provider) =>
      provider.id === OPENAI_ID || provider.id === MICROSOFT_TRANSLATE_PROVIDER_ID
        ? { ...provider, enabled: false }
        : provider,
    )

    const result = replaceBuiltInAiProviders(config)

    const llmId = result.selectionToolbar.builtInActions.dictionary.providerId
    expect(llmId).not.toBe(OPENAI_ID)
    expect(
      getProviderIdsForCapability("customAction", config.providersConfig, { requireEnable: true }),
    ).toContain(llmId)
    expect(result.pageTranslation.providerId).not.toBe(MICROSOFT_TRANSLATE_PROVIDER_ID)
  })

  it("drops LLM language detection to basic when no LLM provider is enabled", () => {
    const config = configOnBuiltInAi()
    config.providersConfig = config.providersConfig.map((provider) =>
      getProviderIdsForCapability("languageDetection", [provider]).length > 0
        ? { ...provider, enabled: false }
        : provider,
    )

    expect(replaceBuiltInAiProviders(config).languageDetection).toEqual({ mode: "basic" })
  })

  it("returns the same object when nothing points at the built-in AI", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    expect(replaceBuiltInAiProviders(config)).toBe(config)
  })

  it("returns a config it cannot walk unchanged", () => {
    const malformed = { providersConfig: [] } as unknown as Config
    expect(replaceBuiltInAiProviders(malformed)).toBe(malformed)
  })
})
