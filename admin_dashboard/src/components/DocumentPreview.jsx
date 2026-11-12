import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import { DOC_TYPE, label } from '../utils/format'

/**
 * Loads one uploaded document with the admin token (an <img src> could not send it)
 * and shows images inline; PDFs open in a new tab.
 */
export function DocumentPreview({ doc }) {
  const [file, setFile] = useState({ id: null, url: null, error: null })

  useEffect(() => {
    if (!doc.hasFile) return undefined
    let url = null
    let cancelled = false
    api.get(`/admin/documents/${doc.documentId}`, { responseType: 'blob' }).then(
      (res) => {
        url = URL.createObjectURL(res.data)
        if (cancelled) URL.revokeObjectURL(url)
        else setFile({ id: doc.documentId, url, error: null })
      },
      (err) => { if (!cancelled) setFile({ id: doc.documentId, url: null, error: errorMessage(err) }) },
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [doc.documentId, doc.hasFile])

  const title = label(DOC_TYPE, doc.docType)
  const isPdf = doc.mimeType === 'application/pdf'
  const ready = file.id === doc.documentId

  return (
    <figure className="doc">
      <div className="doc-frame">
        {!doc.hasFile && <span className="muted small">Seeded record: no file uploaded</span>}
        {doc.hasFile && !ready && <span className="muted small">Loading…</span>}
        {ready && file.error && <span className="error-text small">{file.error}</span>}
        {ready && file.url && !isPdf && (
          <a href={file.url} target="_blank" rel="noreferrer" title="Open full size">
            <img src={file.url} alt={title} />
          </a>
        )}
        {ready && file.url && isPdf && (
          <a className="btn small" href={file.url} target="_blank" rel="noreferrer">Open PDF</a>
        )}
      </div>
      <figcaption>{title}</figcaption>
    </figure>
  )
}
