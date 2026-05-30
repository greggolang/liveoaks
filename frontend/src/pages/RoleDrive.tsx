import { useEffect, useState } from 'react'
import { api, DriveFile } from '../api/client'

interface Crumb { id: string; name: string }

const GOOGLE_MIME_ICONS: Record<string, string> = {
  'application/vnd.google-apps.folder':       '📁',
  'application/vnd.google-apps.document':     '📝',
  'application/vnd.google-apps.spreadsheet':  '📊',
  'application/vnd.google-apps.presentation': '📽',
  'application/vnd.google-apps.form':         '📋',
  'application/pdf':                          '📄',
  'image/jpeg':                               '🖼',
  'image/png':                                '🖼',
  'video/mp4':                                '🎬',
  'audio/mpeg':                               '🎵',
}
function fileIcon(mimeType: string): string {
  return GOOGLE_MIME_ICONS[mimeType] ?? (mimeType.startsWith('image/') ? '🖼' : '📄')
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function RoleDrive() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [mailbox, setMailbox] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([{ id: '', name: 'My Drive' }])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')

  const currentFolder = breadcrumbs[breadcrumbs.length - 1]

  const load = async (folderId: string, pageToken = '') => {
    setLoading(true); setError('')
    try {
      const res = await api.google.drive.listFiles(folderId || undefined, pageToken || undefined)
      setFiles(prev => pageToken ? [...prev, ...res.files] : res.files)
      setNextPage(res.next_page_token || null)
      setMailbox(res.mailbox)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load Drive')
    } finally {
      setLoading(false) }
  }

  useEffect(() => { load(currentFolder.id) }, [currentFolder.id])

  const openFolder = (file: DriveFile) => {
    setFiles([])
    setNextPage(null)
    setSearch('')
    setBreadcrumbs(b => [...b, { id: file.id, name: file.name }])
  }

  const navigateTo = (idx: number) => {
    setFiles([])
    setNextPage(null)
    setSearch('')
    setBreadcrumbs(b => b.slice(0, idx + 1))
  }

  const openFile = (file: DriveFile) => {
    if (file.web_view_link) window.open(file.web_view_link, '_blank', 'noopener')
  }

  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  const folders = filtered.filter(f => f.is_folder)
  const docs    = filtered.filter(f => !f.is_folder)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Drive</h1>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter files…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-48" />
          <button onClick={() => setView('grid')}
            className={`p-1.5 rounded-lg transition ${view === 'grid' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-100'}`} title="Grid">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button onClick={() => setView('list')}
            className={`p-1.5 rounded-lg transition ${view === 'list' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-100'}`} title="List">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm mb-4 flex-wrap">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">/</span>}
            {i < breadcrumbs.length - 1 ? (
              <button onClick={() => navigateTo(i)}
                className="text-green-700 hover:underline font-medium">{crumb.name}</button>
            ) : (
              <span className="text-gray-600 font-medium">{crumb.name}</span>
            )}
          </span>
        ))}
        {mailbox && <span className="ml-2 text-xs text-gray-400">({mailbox})</span>}
      </nav>

      {/* Error */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
          <p className="font-semibold text-amber-800 text-sm mb-1">Not configured</p>
          <p className="text-amber-700 text-xs">{error}</p>
        </div>
      )}

      {/* Content */}
      {loading && files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : filtered.length === 0 && !loading ? (
        <div className="text-center py-16 text-gray-400">
          {search ? 'No files match your filter' : 'This folder is empty'}
        </div>
      ) : view === 'grid' ? (
        <div className="space-y-6">
          {folders.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {folders.map(f => (
                  <button key={f.id} onClick={() => openFolder(f)}
                    className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-green-300 hover:shadow-md transition group">
                    <div className="text-3xl mb-2">{fileIcon(f.mime_type)}</div>
                    <div className="text-xs font-medium text-gray-700 truncate group-hover:text-green-700">{f.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {docs.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Files</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {docs.map(f => (
                  <button key={f.id} onClick={() => openFile(f)}
                    className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-green-300 hover:shadow-md transition group">
                    <div className="text-3xl mb-2">{fileIcon(f.mime_type)}</div>
                    <div className="text-xs font-medium text-gray-700 truncate group-hover:text-green-700">{f.name}</div>
                    {f.size ? <div className="text-xs text-gray-400 mt-0.5">{formatSize(f.size)}</div> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Modified</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Size</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}
                  onClick={() => f.is_folder ? openFolder(f) : openFile(f)}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{fileIcon(f.mime_type)}</span>
                      <span className={`font-medium truncate max-w-xs ${f.is_folder ? 'text-gray-800' : 'text-gray-700'}`}>
                        {f.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {formatDate(f.modified_time)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                    {f.is_folder ? '—' : formatSize(f.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextPage && !search && (
        <div className="mt-4 text-center">
          <button onClick={() => load(currentFolder.id, nextPage)}
            className="px-5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
