import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { ArrowRight, Loader2, MessageSquare, ShieldCheck, Sparkles, Users } from 'lucide-react'
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
      const workspace = await createWorkspace({
        name: name.trim(),
        description: description.trim(),
        plan: selectedPlan,
      })
      toast.success(`Workspace "${workspace.name}" created`)
      navigate(`/workspace/${workspace._id}`)
    } catch {
      // Error handled in store
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="create-workspace-page">
      <nav className="create-workspace-nav">
        <Link to="/" className="create-workspace-brand">
          <span>
            <MessageSquare size={18} />
          </span>
          <strong>FlowTask Chat</strong>
        </Link>
      </nav>

      <section className="create-workspace-shell">
        <div className="create-workspace-copy">
          <div className="create-workspace-kicker">
            <Sparkles size={15} />
            Team collaboration, ready in minutes
          </div>
          <h1>Create your workspace</h1>
          <p>
            Bring channels, direct messages, files, tasks, and activity into one focused place for your team.
          </p>
          <div className="create-workspace-benefits">
            <span><Users size={16} /> Organized team spaces</span>
            <span><ShieldCheck size={16} /> Secure by default</span>
          </div>
        </div>

        <form className="create-workspace-card" onSubmit={handleSubmit}>
          {selectedPlan !== 'free' && (
            <div className="create-workspace-plan">
              Selected plan: <strong>{selectedPlan}</strong>
            </div>
          )}

          <label htmlFor="workspace-name">
            <span>Workspace name</span>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              maxLength={50}
              autoFocus
            />
          </label>

          {slug && (
            <p className="create-workspace-slug">
              Workspace URL: <strong>.../{slug}</strong>
            </p>
          )}

          <label htmlFor="workspace-description">
            <span>Description</span>
            <textarea
              id="workspace-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will your team use this workspace for?"
              maxLength={200}
              rows={4}
            />
          </label>

          <button
            type="submit"
            className="create-workspace-submit"
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {isSubmitting ? 'Creating...' : 'Create workspace'}
          </button>
        </form>
      </section>
    </main>
  )
}
