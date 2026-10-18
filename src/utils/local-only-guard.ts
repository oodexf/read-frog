import { installLocalOnlyFetchGuard } from "./local-only"

// Imported for its side effect at the top of every extension page (options,
// popup, side panel, translation hub, offscreen). Those pages reach Read Frog's
// API through the background's proxy, but some features fetch from the page
// itself — fetching a provider's model list sends its key straight from the
// options page — and a provider's base URL is whatever the user or an imported
// config says. The background installs the same guard from its own module.
installLocalOnlyFetchGuard()
