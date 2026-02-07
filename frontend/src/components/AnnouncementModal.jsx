import { Megaphone, AlarmClock, X } from 'lucide-react'
import { useState } from 'react'
import { useMissionStore } from '../store/useMissionStore'

export default function AnnouncementModal() {
  const isOpen = useMissionStore((state) => state.isAnnouncementOpen)
  const closeAnnouncement = useMissionStore((state) => state.closeAnnouncement)
  const broadcastAnnouncement = useMissionStore((state) => state.broadcastAnnouncement)
  
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('Normal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!message.trim()) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      await broadcastAnnouncement(title.trim() || null, message.trim(), priority)
      // Reset form on success
      setTitle('')
      setMessage('')
      setPriority('Normal')
    } catch (err) {
      setError('Failed to broadcast announcement')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setTitle('')
    setMessage('')
    setPriority('Normal')
    setError(null)
    closeAnnouncement()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeAnnouncement}>
      <div className="modal announcement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Megaphone size={20} />
            Squad Announcement
          </h2>
          <button className="icon-button" onClick={handleClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="modal-content">
          <label className="field">
            <span className="field-label">TITLE (OPTIONAL)</span>
            <input 
              type="text" 
              placeholder="Announcement title..." 
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </label>
          <label className="field">
            <span className="field-label">MESSAGE *</span>
            <textarea 
              placeholder="Enter your announcement message..." 
              rows={5} 
              className="field-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>
          <div className="field">
            <span className="field-label">PRIORITY</span>
            <div className="priority-toggle">
              <button
                type="button"
                className={`priority-btn ${priority === 'Normal' ? 'active' : ''}`}
                onClick={() => setPriority('Normal')}
                disabled={isSubmitting}
              >
                NORMAL
              </button>
              <button
                type="button"
                className={`priority-btn priority-btn--urgent ${priority === 'Urgent' ? 'active' : ''}`}
                onClick={() => setPriority('Urgent')}
                disabled={isSubmitting}
              >
                <AlarmClock size={14} />
                URGENT
              </button>
            </div>
          </div>
          
          {error && (
            <div className="error-message" style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}
          
          <div className="modal-actions">
            <button 
              className="cancel-button" 
              type="button" 
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              className={`broadcast-button ${isSubmitting ? 'button-loading' : ''}`}
              type="button"
              onClick={handleSubmit}
              disabled={!message.trim() || isSubmitting}
            >
              <Megaphone size={16} />
              {isSubmitting ? 'Broadcasting...' : 'Broadcast to Squad'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
