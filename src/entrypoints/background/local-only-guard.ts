import { installLocalOnlyFetchGuard } from "@/utils/local-only"

// Imported for its side effect ahead of every other background module, so the
// guard is in place before any client is created or any request is sent.
installLocalOnlyFetchGuard()
