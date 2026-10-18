import type { LocalNoteReviewGrade } from "@/utils/local-notes/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  LOCAL_NOTES_DUE_COUNT_QUERY_KEY,
  LOCAL_NOTES_QUERY_KEY,
} from "@/utils/local-notes/query-keys"
import {
  countDueLocalNotes,
  deleteAllLocalNotes,
  deleteLocalNote,
  listLocalNotes,
  reviewLocalNote,
} from "@/utils/local-notes/repository"

const LOCAL_NOTES_LIST_QUERY_KEY = [...LOCAL_NOTES_QUERY_KEY, "list"] as const

// The options page shares the extension's origin, so it reads the notes
// database directly instead of asking the background.

export function useLocalNotes() {
  return useQuery({ queryKey: LOCAL_NOTES_LIST_QUERY_KEY, queryFn: () => listLocalNotes() })
}

export function useDueLocalNotesCount() {
  return useQuery({
    queryKey: LOCAL_NOTES_DUE_COUNT_QUERY_KEY,
    queryFn: () => countDueLocalNotes(),
    // A learning card comes due within minutes; keep the count honest while the page is open.
    refetchInterval: 60_000,
  })
}

function useInvalidateLocalNotes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: LOCAL_NOTES_QUERY_KEY })
}

export function useDeleteLocalNote() {
  const invalidate = useInvalidateLocalNotes()
  return useMutation({ mutationFn: deleteLocalNote, onSettled: invalidate })
}

export function useDeleteAllLocalNotes() {
  const invalidate = useInvalidateLocalNotes()
  return useMutation({ mutationFn: deleteAllLocalNotes, onSettled: invalidate })
}

export function useReviewLocalNote() {
  const invalidate = useInvalidateLocalNotes()
  return useMutation({
    mutationFn: ({ id, grade }: { id: string; grade: LocalNoteReviewGrade }) =>
      reviewLocalNote(id, grade),
    onSettled: invalidate,
  })
}
