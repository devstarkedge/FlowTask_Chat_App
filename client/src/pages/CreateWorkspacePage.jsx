import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { MessageSquare, ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CreateWorkspacePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedPlan = searchParams.get('plan') || 'free'
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Workspace name is required')
      return
    }
    setIsSubmitting(true)
    try {
      const workspace = await createWorkspace({ name: name.trim(), description: description.trim(), plan: selectedPlan })
      toast.success(`Workspace "${workspace.name}" created!`)
      navigate(`/workspace/${workspace._id}`)
    } catch {
      // Error handled in store
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ background: '#0a0a0f', color: '#e5e7eb', minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10, 10, 15, 0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageSquare size={18} color="white" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>FlowTask Chat</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Form */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'white', marginBottom: 8, textAlign: 'center' }}>
          Create your workspace
        </h1>
        <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: 15, marginBottom: 40 }}>
          A workspace is where your team communicates. You can invite members after creation.
        </p>

        {selectedPlan !== 'free' && (
          <div style={{
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 14, color: '#a5b4fc',
            textAlign: 'center',
          }}>
            Selected plan: <strong style={{ color: 'white', textTransform: 'capitalize' }}>{selectedPlan}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#d1d5db', marginBottom: 6 }}>
              Workspace Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              maxLength={50}
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 15, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {slug && (
              <p style={{ fontSize: 12, color: '#71717a', marginTop: 6 }}>
                Workspace URL: <span style={{ color: '#a5b4fc' }}>.../{slug}</span>
              </p>
            )}
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#d1d5db', marginBottom: 6 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this workspace for?"
              maxLength={200}
              rows={3}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 15, outline: 'none',
                resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white', fontSize: 16, fontWeight: 600, cursor: isSubmitting ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: isSubmitting || !name.trim() ? 0.6 : 1,
            }}
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {isSubmitting ? 'Creating...' : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
