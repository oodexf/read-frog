import { env } from "@/env"

// Keep the persisted provider ID stable so existing user configurations continue to work.
export const BUILT_IN_AI_PROVIDER_ID = "read-frog-free-ai"
export const BUILT_IN_AI_ADVANCE_PROVIDER_ID = "read-frog-advance-ai"

export const BUILT_IN_AI_PROVIDER_IDS = [
  BUILT_IN_AI_PROVIDER_ID,
  BUILT_IN_AI_ADVANCE_PROVIDER_ID,
] as const

export type BuiltInAiProviderId = (typeof BUILT_IN_AI_PROVIDER_IDS)[number]

/**
 * Where the built-in selection actions (Dictionary, Sentence Analysis, Improve
 * Writing) start. A local-only build has no hosted AI, so they start on the
 * OpenAI default provider instead, as note suggestions already do, and work
 * once the user adds a key.
 */
export const DEFAULT_BUILT_IN_ACTION_PROVIDER_ID = env.WXT_LOCAL_ONLY
  ? "openai-default"
  : BUILT_IN_AI_PROVIDER_ID
// Re-exported from the contract so a tier added server-side surfaces here.
export type { HostedAiModelTier } from "@read-frog/api-contract"
