import { useState, useRef, useEffect } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import {
  X, Hash, Lock, Globe, CheckCircle2,
  AlignLeft, MessageSquare, Sparkles, AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/* ─── Animation variants ──────────────────────────────────────────── */
const overlay = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: .22 } },
  exit:    { opacity: 0, transition: { duration: .18 } },
}
const modal = {
  hidden:  { opacity: 0, scale: .96, y: 20 },
  visible: { opacity: 1, scale: 1,   y: 0,
    transition: { duration: .3, ease: [.22,1,.36,1] } },
  exit:    { opacity: 0, scale: .96, y: 14,
    transition: { duration: .2 } },
}
const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: .055, delayChildren: .1 } },
}
const item = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: .24, ease: [.22,1,.36,1] } },
}
const errorAnim = {
  hidden:  { opacity: 0, height: 0, marginBottom: 0 },
  visible: { opacity: 1, height: 'auto', marginBottom: 4,
    transition: { duration: .22, ease: [.22,1,.36,1] } },
  exit:    { opacity: 0, height: 0, marginBottom: 0,
    transition: { duration: .16 } },
}

/* ─── Field label ─────────────────────────────────────────────────── */
function FieldLabel({ children, hint, required }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline',
      justifyContent: 'space-between', marginBottom: 7,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.08em', color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {children}
        {required && <span style={{ color: 'var(--danger-color)', fontSize: 13, lineHeight: 1 }}>*</span>}
      </span>
      {hint && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)',
          fontStyle: 'italic', opacity: .7 }}>
          {hint}
        </span>
      )}
    </div>
  )
}

/* ─── Char counter ────────────────────────────────────────────────── */
function CharCount({ value, max }) {
  const pct  = value / max
  const warn = pct > .8
  const over = pct >= 1
  return (
    <AnimatePresence>
      {value > 0 && (
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: .16 }}
          style={{
            fontSize: 10, fontWeight: 600,
            color: over  ? 'var(--danger-color)'
                 : warn  ? 'var(--warning-color)'
                         : 'var(--text-muted)',
          }}
        >
          {value}/{max}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/* ─── Input wrapper ───────────────────────────────────────────────── */
function InputWrap({ children, focused, disabled }) {
  return (
    <div style={{
      position: 'relative',
      borderRadius: 'var(--radius-md)',
      transition: 'box-shadow 180ms ease',
      boxShadow: focused
        ? '0 0 0 3px color-mix(in srgb, var(--accent-color) 20%, transparent)'
        : 'none',
      opacity: disabled ? .5 : 1,
    }}>
      {children}
    </div>
  )
}

/* ─── Section divider ─────────────────────────────────────────────── */
function SectionDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      margin: '4px 0 2px',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.1em', color: 'var(--text-muted)', opacity: .6,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
    </div>
  )
}

/* ─── Channel preview pill ────────────────────────────────────────── */
// function ChannelPreview({ name, visibility, topic }) {
//   const slug = name
//     ? name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
//     : ''

//   return (
//     <motion.div
//       layout
//       style={{
//         padding: '10px 12px',
//         borderRadius: 'var(--radius-md)',
//         background: 'var(--bg-active)',
//         border: '1px solid var(--border-secondary)',
//         display: 'flex', alignItems: 'flex-start', gap: 10,
//       }}
//     >
//       <div style={{
//         width: 32, height: 32, borderRadius: 'var(--radius-sm)', flexShrink: 0,
//         background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)',
//         border: '1px solid color-mix(in srgb, var(--accent-color) 22%, transparent)',
//         display: 'flex', alignItems: 'center', justifyContent: 'center',
//         color: 'var(--accent-color)',
//       }}>
//         {visibility === 'private' ? <Lock size={13} /> : <Hash size={13} />}
//       </div>
//       {/* <div style={{ flex: 1, minWidth: 0 }}>
//         <AnimatePresence mode="wait">
//           <motion.p
//             key={slug || '__empty__'}
//             initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
//             exit={{ opacity: 0, y: -4 }} transition={{ duration: .15 }}
//             style={{
//               fontSize: 13, fontWeight: 700, lineHeight: 1.3,
//               color: slug ? 'var(--text-primary)' : 'var(--text-muted)',
//               fontStyle: slug ? 'normal' : 'italic',
//               whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
//             }}
//           >
//             {slug ? `#${slug}` : 'channel-preview'}
//           </motion.p>
//         </AnimatePresence>
//         <AnimatePresence mode="wait">
//           <motion.p
//             key={topic || '__no-topic__'}
//             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
//             transition={{ duration: .15 }}
//             style={{
//               fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4,
//               whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
//               fontStyle: topic ? 'normal' : 'italic',
//             }}
//           >
//             {topic || 'No topic set'}
//           </motion.p>
//         </AnimatePresence>
//       </div> */}
//       <span style={{
//         fontSize: 9, fontWeight: 700, padding: '2px 7px',
//         borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.06em',
//         background: visibility === 'private'
//           ? 'color-mix(in srgb, var(--accent-yellow) 14%, transparent)'
//           : 'color-mix(in srgb, var(--accent-green) 14%, transparent)',
//         color: visibility === 'private' ? 'var(--accent-yellow)' : 'var(--accent-green)',
//         border: `1px solid ${visibility === 'private'
//           ? 'color-mix(in srgb, var(--accent-yellow) 24%, transparent)'
//           : 'color-mix(in srgb, var(--accent-green) 24%, transparent)'}`,
//         flexShrink: 0, alignSelf: 'center',
//       }}>
//         {visibility}
//       </span>
//     </motion.div>
//   )
// }

/* ─── Main component ──────────────────────────────────────────────── */
export default function EditChannelModal({ channel, onClose }) {
  const { editChannel } = useChannelStore()

  const [name,         setName]         = useState(channel.name || '')
  const [description,  setDescription]  = useState(channel.description || '')
  const [topic,        setTopic]        = useState(channel.topic || '')
  const [visibility,   setVisibility]   = useState(channel.visibility || 'public')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error,        setError]        = useState('')
  const [focused,      setFocused]      = useState(null)

  const firstInputRef = useRef(null)
  useEffect(() => {
    const t = setTimeout(() => firstInputRef.current?.focus(), 320)
    return () => clearTimeout(t)
  }, [])

  const isSystem  = channel.type === 'system'
  const isProject = channel.type === 'project'
  const isLocked  = isSystem || isProject
  const isDirty   = name !== (channel.name || '')
    || description !== (channel.description || '')
    || topic !== (channel.topic || '')
    || visibility !== (channel.visibility || 'public')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isLocked && !name.trim()) { setError('Channel name is required'); return }
    setIsSubmitting(true)
    setError('')
    try {
      const data = { description: description.trim(), topic: topic.trim() }
      if (!isLocked) { data.name = name.trim(); data.visibility = visibility }
      await editChannel(channel._id, data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update channel')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '11px 13px',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    font: 'inherit', fontSize: 14, outline: 'none',
    transition: 'border-color 160ms ease, background 160ms ease',
  }
  const focusedBorder = { borderColor: 'var(--accent-color)' }

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        variants={overlay}
        initial="hidden" animate="visible" exit="exit"
        onClick={onClose}
      >
        <motion.div
          variants={modal}
          initial="hidden" animate="visible" exit="exit"
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xl)',
            width: 'min(500px, 94vw)',
            boxShadow: 'var(--shadow-modal)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'min(90vh, 720px)',
          }}
        >

          {/* ══ Header ══════════════════════════════════════════════ */}
          <div style={{
            padding: '18px 20px 16px',
            borderBottom: '1px solid var(--border-secondary)',
            background: 'var(--surface-secondary)',
            flexShrink: 0,
          }}>
            {/* Top row */}
            <div style={{
              display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 12, marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 'var(--radius-md)',
                  background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-color) 26%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent-color)', flexShrink: 0,
                  boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-color) 16%, transparent)',
                }}>
                  {visibility === 'private' ? <Lock size={16} /> : <Hash size={16} />}
                </div>
                <div>
                  <p style={{
                    fontSize: 15, fontWeight: 800, color: 'var(--text-primary)',
                    letterSpacing: '-.02em', lineHeight: 1.2,
                  }}>
                    Edit Channel
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    #{channel.name}
                    {isLocked && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, fontWeight: 700,
                        padding: '1px 5px', borderRadius: 999,
                        textTransform: 'uppercase', letterSpacing: '.06em',
                        background: 'color-mix(in srgb, var(--accent-yellow) 14%, transparent)',
                        color: 'var(--accent-yellow)',
                        border: '1px solid color-mix(in srgb, var(--accent-yellow) 22%, transparent)',
                      }}>
                        {isSystem ? 'System' : 'Project'}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="thread-panel__icon-btn thread-panel__close-btn"
                style={{ flexShrink: 0 }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Live preview
            <ChannelPreview name={name} visibility={visibility} topic={topic} /> */}
          </div>

          {/* ══ Form body (scrollable) ═══════════════════════════════ */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <motion.form
              onSubmit={handleSubmit}
              variants={stagger} initial="hidden" animate="visible"
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}
            >

              {/* ── Channel Name ── */}
              <motion.div variants={item}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                  justifyContent: 'space-between', marginBottom: 7 }}>
                  <FieldLabel required={!isLocked}>Channel Name</FieldLabel>
                  <CharCount value={name.length} max={50} />
                </div>
                <InputWrap focused={focused === 'name'} disabled={isLocked}>
                  <div style={{
                    position: 'absolute', left: 12, top: '50%',
                    transform: 'translateY(-50%)', pointerEvents: 'none',
                    color: focused === 'name' ? 'var(--accent-color)' : 'var(--text-muted)',
                    transition: 'color 160ms ease',
                    display: 'flex', alignItems: 'center',
                  }}>
                    {visibility === 'private' ? <Lock size={13} /> : <Hash size={13} />}
                  </div>
                  <input
                    ref={!isLocked ? firstInputRef : undefined}
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                    disabled={isLocked}
                    maxLength={50}
                    placeholder="channel-name"
                    style={{
                      ...inputStyle,
                      paddingLeft: 34,
                      ...(focused === 'name' ? focusedBorder : {}),
                      opacity: isLocked ? .5 : 1,
                      cursor: isLocked ? 'not-allowed' : 'text',
                    }}
                  />
                </InputWrap>
                {isLocked && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    marginTop: 6, fontSize: 11, color: 'var(--text-muted)',
                  }}>
                    <AlertTriangle size={11} style={{ flexShrink: 0, color: 'var(--accent-yellow)' }} />
                    {isSystem
                      ? 'System channel names cannot be modified'
                      : 'Project channel names are synced from FlowTask'}
                  </div>
                )}
              </motion.div>

              {/* ── Visibility ── */}
              {!isLocked && (
                <motion.div variants={item}>
                  <FieldLabel>Visibility</FieldLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { value: 'public',  Icon: Globe, label: 'Public',
                        sub: 'Anyone in the workspace can join' },
                      { value: 'private', Icon: Lock,  label: 'Private',
                        sub: 'Only invited members can access' },
                    ].map(({ value, Icon, label, sub }) => {
                      const active = visibility === value
                      return (
                        <motion.button
                          key={value}
                          type="button"
                          onClick={() => setVisibility(value)}
                          whileHover={active ? {} : { y: -1 }}
                          whileTap={{ scale: .97 }}
                          style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'flex-start', gap: 6,
                            padding: '12px 13px',
                            borderRadius: 'var(--radius-md)',
                            border: `1.5px solid ${active
                              ? 'var(--accent-color)'
                              : 'var(--border-color)'}`,
                            background: active
                              ? 'color-mix(in srgb, var(--accent-color) 9%, transparent)'
                              : 'var(--surface-secondary)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 180ms ease',
                            boxShadow: active
                              ? '0 0 0 1px var(--accent-color), 0 2px 12px color-mix(in srgb, var(--accent-color) 14%, transparent)'
                              : 'none',
                            position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {/* Active indicator glow */}
                          {active && (
                            <motion.div
                              layoutId="vis-glow"
                              style={{
                                position: 'absolute', inset: 0, pointerEvents: 'none',
                                background: 'radial-gradient(ellipse at top left, color-mix(in srgb, var(--accent-color) 12%, transparent), transparent 70%)',
                              }}
                            />
                          )}

                          <div style={{ display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', width: '100%', gap: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: active
                                ? 'color-mix(in srgb, var(--accent-color) 18%, transparent)'
                                : 'var(--surface-tertiary)',
                              color: active ? 'var(--accent-color)' : 'var(--text-muted)',
                              transition: 'all 180ms ease', flexShrink: 0,
                            }}>
                              <Icon size={13} />
                            </div>

                            <AnimatePresence>
                              {active && (
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  transition={{ duration: .22, ease: [.22,1,.36,1] }}
                                  style={{ color: 'var(--accent-color)' }}
                                >
                                  <CheckCircle2 size={14} />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          <div>
                            <p style={{
                              fontSize: 12.5, fontWeight: 700, lineHeight: 1.2,
                              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                              transition: 'color 180ms ease',
                            }}>
                              {label}
                            </p>
                            <p style={{
                              fontSize: 10.5, color: 'var(--text-muted)',
                              marginTop: 2, lineHeight: 1.4,
                            }}>
                              {sub}
                            </p>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              )}

              <SectionDivider label="Details" />

              {/* ── Topic ── */}
              <motion.div variants={item}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                  justifyContent: 'space-between', marginBottom: 7 }}>
                  <FieldLabel hint="optional">Topic</FieldLabel>
                  <CharCount value={topic.length} max={250} />
                </div>
                <InputWrap focused={focused === 'topic'}>
                  <div style={{
                    position: 'absolute', left: 12, top: '50%',
                    transform: 'translateY(-50%)', pointerEvents: 'none',
                    color: focused === 'topic' ? 'var(--accent-color)' : 'var(--text-muted)',
                    transition: 'color 160ms ease', display: 'flex', alignItems: 'center',
                  }}>
                    <MessageSquare size={13} />
                  </div>
                  <input
                    ref={isLocked ? firstInputRef : undefined}
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onFocus={() => setFocused('topic')}
                    onBlur={() => setFocused(null)}
                    placeholder="What is this channel currently about?"
                    maxLength={250}
                    style={{
                      ...inputStyle,
                      paddingLeft: 34,
                      ...(focused === 'topic' ? focusedBorder : {}),
                    }}
                  />
                </InputWrap>
              </motion.div>

              {/* ── Description ── */}
              <motion.div variants={item}>
                <div style={{ display: 'flex', alignItems: 'baseline',
                  justifyContent: 'space-between', marginBottom: 7 }}>
                  <FieldLabel hint="optional">Description</FieldLabel>
                  <CharCount value={description.length} max={250} />
                </div>
                <InputWrap focused={focused === 'description'}>
                  <div style={{
                    position: 'absolute', left: 12, top: 12, pointerEvents: 'none',
                    color: focused === 'description' ? 'var(--accent-color)' : 'var(--text-muted)',
                    transition: 'color 160ms ease', display: 'flex', alignItems: 'center',
                  }}>
                    <AlignLeft size={13} />
                  </div>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onFocus={() => setFocused('description')}
                    onBlur={() => setFocused(null)}
                    placeholder="Help others understand what this channel is for…"
                    rows={3}
                    maxLength={250}
                    style={{
                      ...inputStyle,
                      paddingLeft: 34,
                      resize: 'vertical',
                      lineHeight: 1.65,
                      minHeight: 80,
                      ...(focused === 'description' ? focusedBorder : {}),
                    }}
                  />
                </InputWrap>
              </motion.div>

              {/* ── Error ── */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    variants={errorAnim}
                    initial="hidden" animate="visible" exit="exit"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'color-mix(in srgb, var(--danger-color) 10%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--danger-color) 20%, transparent)',
                    }}
                  >
                    <AlertTriangle size={13} style={{
                      color: 'var(--danger-color)', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--danger-color)', fontWeight: 500 }}>
                      {error}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.form>
          </div>

          {/* ══ Footer ══════════════════════════════════════════════ */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--border-secondary)',
            background: 'var(--surface-secondary)',
            flexShrink: 0,
          }}>
            {/* Dirty indicator */}
            <AnimatePresence>
              {isDirty ? (
                <motion.div
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }} transition={{ duration: .18 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 11, color: 'var(--text-muted)',
                  }}
                >
                  <Sparkles size={11} style={{ color: 'var(--accent-color)' }} />
                  Unsaved changes
                </motion.div>
              ) : (
                <div />
              )}
            </AnimatePresence>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} className="btn-ghost"
                style={{ fontSize: 13 }}>
                Cancel
              </button>
              <motion.button
                type="submit"
                form=""
                onClick={handleSubmit}
                disabled={isSubmitting || (!isLocked && !name.trim())}
                className="btn-primary"
                whileHover={isSubmitting ? {} : { y: -1 }}
                whileTap={isSubmitting ? {} : { scale: .97 }}
                style={{ minWidth: 114, fontSize: 13, position: 'relative' }}
              >
                <AnimatePresence mode="wait">
                  {isSubmitting ? (
                    <motion.span key="loading"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                    >
                      <span style={{
                        width: 13, height: 13,
                        border: '2px solid rgba(255,255,255,.3)',
                        borderTopColor: '#fff', borderRadius: '50%',
                        animation: 'spin .8s linear infinite',
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      Saving…
                    </motion.span>
                  ) : (
                    <motion.span key="idle"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <CheckCircle2 size={13} />
                      Save Changes
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}