import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { errorMessage } from '../api/client'

/**
 * Loads data whenever `key` changes (or reload() is called).
 * `loader` returns a promise of the data. The previous data stays visible while
 * the next request runs, so tables don't flash empty.
 */
export function useApi(loader, key) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ requestId: null, data: null, error: null })
  const requestId = `${key}|${version}`
  const load = useEffectEvent(() => loader())

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => { if (!cancelled) setState({ requestId, data, error: null }) },
      (err) => { if (!cancelled) setState((s) => ({ ...s, requestId, error: errorMessage(err) })) },
    )
    return () => { cancelled = true }
  }, [requestId])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data: state.data, error: state.error, loading: state.requestId !== requestId, reload }
}
