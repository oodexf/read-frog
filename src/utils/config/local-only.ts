import type { Config } from "@/types/config/config"
import type { ProviderCapability } from "@/utils/providers/provider-registry"
import { dequal } from "dequal"
import { env } from "@/env"
import { BUILT_IN_ACTION_IDS, BUILT_IN_ACTION_KEYS } from "@/utils/constants/custom-action"
import { FEATURE_KEYS, FEATURE_PROVIDER_DEFS } from "@/utils/constants/feature-providers"
import {
  DEFAULT_PROVIDER_CONFIG,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
import { logger } from "@/utils/logger"
import {
  getProviderIdsForCapability,
  isBuiltInAiProviderId,
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

/**
 * A local-only build has no built-in AI, so a config that still points at it —
 * carried over from the official extension, restored from a backup or pulled
 * from Google Drive — would fail validation and be reset wholesale. This moves
 * every such slot onto an enabled local provider that can run it instead. A slot
 * with no such provider is left alone for validation to reject, as before;
 * LLM language detection without one falls back to basic detection.
 */
export function replaceBuiltInAiProviders(config: Config): Config {
  if (!env.WXT_LOCAL_ONLY) return config

  try {
    const next = structuredClone(config)
    const pickProvider = (capability: ProviderCapability, providerId: string) => {
      if (!isBuiltInAiProviderId(providerId)) return providerId
      const candidates = getProviderIdsForCapability(capability, next.providersConfig, {
        requireEnable: true,
      })
      const preferred =
        capability === "customAction" ||
        capability === "languageDetection" ||
        capability === "noteSuggestion"
          ? PREFERRED_LLM_PROVIDER_ID
          : PREFERRED_TRANSLATE_PROVIDER_ID
      return candidates.includes(preferred) ? preferred : (candidates[0] ?? providerId)
    }

    for (const featureKey of FEATURE_KEYS) {
      const def = FEATURE_PROVIDER_DEFS[featureKey]
      const providerId = def.getProviderId(next)
      const replacement = pickProvider(featureKey, providerId)
      if (replacement !== providerId) {
        setAtPath(next, def.configPath, replacement)
      }
    }

    for (const actionId of BUILT_IN_ACTION_IDS) {
      const state = next.selectionToolbar.builtInActions[BUILT_IN_ACTION_KEYS[actionId]]
      state.providerId = pickProvider("customAction", state.providerId)
    }
    for (const action of next.selectionToolbar.customActions) {
      action.providerId = pickProvider("customAction", action.providerId)
    }

    const languageDetectionProviderId = next.languageDetection.providerId
    if (languageDetectionProviderId && isBuiltInAiProviderId(languageDetectionProviderId)) {
      const replacement = pickProvider("languageDetection", languageDetectionProviderId)
      next.languageDetection = isBuiltInAiProviderId(replacement)
        ? { mode: "basic" }
        : { ...next.languageDetection, providerId: replacement }
    }

    // The same object back when nothing moved, so callers can tell nothing changed.
    return dequal(next, config) ? config : next
  } catch (error) {
    // A config too malformed to walk is validation's to reject, not this pass's.
    logger.warn("[Config] Could not replace Built-in AI providers", error)
    return config
  }
}
