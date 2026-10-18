import type { Config } from "@/types/config/config"
import type { ProviderCapability } from "@/utils/providers/provider-registry"
import { dequal } from "dequal"
import { env } from "@/env"
import { BUILT_IN_ACTION_IDS, BUILT_IN_ACTION_KEYS } from "@/utils/constants/custom-action"
import { FEATURE_KEYS, FEATURE_PROVIDER_DEFS } from "@/utils/constants/feature-providers"
import {
  DEFAULT_PROVIDER_CONFIG,
  DEFAULT_PROVIDER_CONFIG_LIST,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
import { logger } from "@/utils/logger"
import {
  getProviderIdsForCapability,
  isBuiltInAiProviderId,
  isLocalProviderConfigCompatibleWithCapability,
} from "@/utils/providers/provider-registry"

// The same providers a fresh config starts on, so a replaced slot lands where a
// new install would have put it whenever the user still has that provider.
const PREFERRED_TRANSLATE_PROVIDER_ID = MICROSOFT_TRANSLATE_PROVIDER_ID
const PREFERRED_LLM_PROVIDER_ID = DEFAULT_PROVIDER_CONFIG.openai.id

function setAtPath(target: Record<string, unknown>, path: readonly string[], value: string) {
  let current = target
  for (const key of path.slice(0, -1)) {
    current = current[key] as Record<string, unknown>
  }
  current[path[path.length - 1]!] = value
}

function isLlmCapability(capability: ProviderCapability) {
  return (
    capability === "customAction" ||
    capability === "languageDetection" ||
    capability === "noteSuggestion"
  )
}

/**
 * A provider that can run `capability`, made usable if it has to be: the
 * preferred one among those already enabled; else a disabled one turned back
 * on; else the default provider added. Validation only accepts enabled
 * providers, and a slot left on the built-in AI resets the WHOLE config, so a
 * provider that still needs its API key is the far smaller loss.
 */
function ensureProviderFor(config: Config, capability: ProviderCapability): string | undefined {
  const preferred = isLlmCapability(capability)
    ? PREFERRED_LLM_PROVIDER_ID
    : PREFERRED_TRANSLATE_PROVIDER_ID
  const pick = (ids: string[]) => (ids.includes(preferred) ? preferred : ids[0])

  const enabled = getProviderIdsForCapability(capability, config.providersConfig, {
    requireEnable: true,
  })
  if (enabled.length > 0) return pick(enabled)

  const disabledId = pick(getProviderIdsForCapability(capability, config.providersConfig))
  const disabled = config.providersConfig.find((provider) => provider.id === disabledId)
  if (disabled) {
    disabled.enabled = true
    return disabled.id
  }

  const fallback = [
    ...DEFAULT_PROVIDER_CONFIG_LIST.filter((provider) => provider.id === preferred),
    ...DEFAULT_PROVIDER_CONFIG_LIST,
  ].find((provider) => isLocalProviderConfigCompatibleWithCapability(capability, provider))
  if (!fallback) return undefined
  config.providersConfig.push({ ...structuredClone(fallback), enabled: true })
  return fallback.id
}

/**
 * A local-only build has no built-in AI, so a config that still points at it —
 * carried over from the official extension, restored from a backup or pulled
 * from Google Drive — would fail validation and be reset wholesale. This moves
 * every such slot onto a local provider that can run it instead, enabling or
 * adding one when none is on (see `ensureProviderFor`). LLM language detection
 * is the exception: with no LLM provider already enabled it falls back to basic
 * detection rather than turning one on for a background feature.
 *
 * Runs before schema parsing, so it must cope with what parsing would fill in:
 * a built-in action state the schema defaults is skipped, not dereferenced.
 */
export function replaceBuiltInAiProviders(config: Config): Config {
  if (!env.WXT_LOCAL_ONLY) return config

  try {
    const next = structuredClone(config)

    // First, so it sees which LLM providers the user had on, not ones the
    // slots below turn on.
    const languageDetectionProviderId = next.languageDetection?.providerId
    if (languageDetectionProviderId && isBuiltInAiProviderId(languageDetectionProviderId)) {
      const enabled = getProviderIdsForCapability("languageDetection", next.providersConfig, {
        requireEnable: true,
      })
      const replacement = enabled.includes(PREFERRED_LLM_PROVIDER_ID)
        ? PREFERRED_LLM_PROVIDER_ID
        : enabled[0]
      next.languageDetection = replacement
        ? { ...next.languageDetection, providerId: replacement }
        : { mode: "basic" }
    }

    const pickProvider = (capability: ProviderCapability, providerId: string) =>
      isBuiltInAiProviderId(providerId)
        ? (ensureProviderFor(next, capability) ?? providerId)
        : providerId

    for (const featureKey of FEATURE_KEYS) {
      const def = FEATURE_PROVIDER_DEFS[featureKey]
      const providerId = def.getProviderId(next)
      const replacement = pickProvider(featureKey, providerId)
      if (replacement !== providerId) {
        setAtPath(next, def.configPath, replacement)
      }
    }

    const builtInActions = next.selectionToolbar.builtInActions as Partial<
      Config["selectionToolbar"]["builtInActions"]
    >
    for (const actionId of BUILT_IN_ACTION_IDS) {
      const state = builtInActions[BUILT_IN_ACTION_KEYS[actionId]]
      if (state) {
        state.providerId = pickProvider("customAction", state.providerId)
      }
    }
    for (const action of next.selectionToolbar.customActions ?? []) {
      action.providerId = pickProvider("customAction", action.providerId)
    }

    // The same object back when nothing moved, so callers can tell nothing changed.
    return dequal(next, config) ? config : next
  } catch (error) {
    // A config too malformed to walk is validation's to reject, not this pass's.
    logger.warn("[Config] Could not replace Built-in AI providers", error)
    return config
  }
}
