import { createEnv } from "@t3-oss/env-core"
import { createExtensionClientEnvSchema, isLocalOnlyEnabled, resolveExtensionEnv } from "./shared"

const shouldSkipRequiredProductionEnv = import.meta.env.WXT_SKIP_ENV_VALIDATION === "true"
const extensionClientEnvSchema = createExtensionClientEnvSchema(
  import.meta.env.PROD,
  shouldSkipRequiredProductionEnv,
  isLocalOnlyEnabled(import.meta.env),
)

export const env = createEnv({
  clientPrefix: "WXT_",
  client: extensionClientEnvSchema,
  runtimeEnv: resolveExtensionEnv(import.meta.env),
  emptyStringAsUndefined: true,
})
