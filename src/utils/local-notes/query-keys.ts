export const LOCAL_NOTES_QUERY_KEY = ["local-notes"] as const

/** Under `LOCAL_NOTES_QUERY_KEY`, so invalidating the notes also refreshes the count. */
export const LOCAL_NOTES_DUE_COUNT_QUERY_KEY = [...LOCAL_NOTES_QUERY_KEY, "due-count"] as const
