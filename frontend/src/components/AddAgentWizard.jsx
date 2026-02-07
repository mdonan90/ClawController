import { useState } from 'react'
import { useMissionStore } from '../store/useMissionStore'

const STEPS = {
  DESCRIBE: 1,
  LOADING: 2,
  REVIEW: 3,
}

export default function AddAgentWizard() {
  const availableModels = useMissionStore((s) => s.availableModels)
  const loading = useMissionStore((s) => s.loadingAgentManagement)
  const closeAddAgentWizard = useMissionStore((s) => s.closeAddAgentWizard)
  const generateAgentConfig = useMissionStore((s) => s.generateAgentConfig)
  const createAgent = useMissionStore((s) => s.createAgent)
  
  const [step, setStep] = useState(STEPS.DESCRIBE)
  const [description, setDescription] = useState('')
  const [previousDescription, setPreviousDescription] = useState('')
  
  // Generated config state
  const [agentId, setAgentId] = useState('')
  const [agentName, setAgentName] = useState('')
  const [agentEmoji, setAgentEmoji] = useState('🤖')
  const [agentModel, setAgentModel] = useState('')
  const [agentSoul, setAgentSoul] = useState('')
  const [agentTools, setAgentTools] = useState('')
  const [agentsMd, setAgentsMd] = useState('')
  
  const [error, setError] = useState('')
  
  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please describe what the agent should do')
      return
    }
    
    setError('')
    setPreviousDescription(description)
    setStep(STEPS.LOADING)
    
    try {
      const config = await generateAgentConfig(description)
      setAgentId(config.id || '')
      setAgentName(config.name || '')
      setAgentEmoji(config.emoji || '🤖')
      setAgentModel(config.model || '')
      setAgentSoul(config.soul || '')
      setAgentTools(config.tools || '')
      setAgentsMd(config.agentsMd || '')
      setStep(STEPS.REVIEW)
    } catch (err) {
      setError('Failed to generate config. Please try again.')
      setStep(STEPS.DESCRIBE)
    }
  }
  
  const handleRefine = () => {
    // Go back to describe with context
    setDescription(previousDescription + '\n\n[Refinement]: ')
    setStep(STEPS.DESCRIBE)
  }
  
  const handleCreate = async () => {
    if (!agentId.trim()) {
      setError('Agent ID is required')
      return
    }
    
    // Validate ID format
    const idRegex = /^[a-z0-9-]+$/
    if (!idRegex.test(agentId)) {
      setError('Agent ID can only contain lowercase letters, numbers, and hyphens')
      return
    }
    
    setError('')
    
    try {
      await createAgent({
        id: agentId,
        name: agentName,
        emoji: agentEmoji,
        model: agentModel,
        soul: agentSoul,
        tools: agentTools,
        agentsMd: agentsMd,
      })
    } catch (err) {
      setError(err.message || 'Failed to create agent')
    }
  }
  
  return (
    <div className="modal-overlay agent-wizard-overlay" onClick={closeAddAgentWizard}>
      <div className="modal add-agent-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-label">
              {step === STEPS.DESCRIBE && 'Step 1 of 2'}
              {step === STEPS.LOADING && 'Generating...'}
              {step === STEPS.REVIEW && 'Step 2 of 2'}
            </span>
            <h2>
              {step === STEPS.DESCRIBE && '✨ Create New Agent'}
              {step === STEPS.LOADING && '🔄 Generating Config'}
              {step === STEPS.REVIEW && '📝 Review & Create'}
            </h2>
          </div>
          <button className="icon-button" onClick={closeAddAgentWizard}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="modal-content">
          {error && (
            <div className="wizard-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}
          
          {step === STEPS.DESCRIBE && (
            <div className="wizard-step">
              <p className="wizard-instruction">
                Describe what this agent should do. Be specific about its role, capabilities, and any special requirements.
              </p>
              <div className="field">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Example: A development agent that specializes in React and TypeScript. It should follow best practices, write tests, and document code thoroughly..."
                  rows={8}
                  className="wizard-textarea"
                  autoFocus
                />
              </div>
              <div className="wizard-examples">
                <span>Examples:</span>
                <button onClick={() => setDescription('A coding agent specialized in Python backend development with FastAPI and PostgreSQL')}>
                  Backend Dev
                </button>
                <button onClick={() => setDescription('A sales agent that handles lead qualification, outreach emails, and CRM management')}>
                  Sales Agent
                </button>
                <button onClick={() => setDescription('A research agent that investigates topics deeply, synthesizes findings, and creates detailed reports')}>
                  Researcher
                </button>
              </div>
            </div>
          )}
          
          {step === STEPS.LOADING && (
            <div className="wizard-loading">
              <div className="loading-spinner large" />
              <p>Generating agent configuration...</p>
            </div>
          )}
          
          {step === STEPS.REVIEW && (
            <div className="wizard-step wizard-review">
              <div className="wizard-review-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Agent ID *</label>
                  <input
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="my-agent"
                  />
                  <span className="field-hint">Lowercase, hyphens allowed</span>
                </div>
                <div className="field" style={{ width: '80px' }}>
                  <label>Emoji</label>
                  <input
                    type="text"
                    value={agentEmoji}
                    onChange={(e) => setAgentEmoji(e.target.value)}
                    placeholder="🤖"
                  />
                </div>
              </div>
              
              <div className="wizard-review-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Agent Name"
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Model</label>
                  <select
                    value={agentModel}
                    onChange={(e) => setAgentModel(e.target.value)}
                    className="wizard-select"
                  >
                    <option value="">Select model...</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.alias} - {m.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="field">
                <label>SOUL.md</label>
                <textarea
                  value={agentSoul}
                  onChange={(e) => setAgentSoul(e.target.value)}
                  rows={10}
                  className="wizard-textarea wizard-textarea--code"
                />
              </div>
              
              <div className="field">
                <label>TOOLS.md</label>
                <textarea
                  value={agentTools}
                  onChange={(e) => setAgentTools(e.target.value)}
                  rows={6}
                  className="wizard-textarea wizard-textarea--code"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-actions">
          {step === STEPS.DESCRIBE && (
            <>
              <button className="secondary-button" onClick={closeAddAgentWizard}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={handleGenerate}
                disabled={!description.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                </svg>
                Generate Config
              </button>
            </>
          )}
          
          {step === STEPS.REVIEW && (
            <>
              <button className="secondary-button" onClick={handleRefine}>
                ← Refine
              </button>
              <div style={{ flex: 1 }} />
              <button className="secondary-button" onClick={closeAddAgentWizard}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={handleCreate}
                disabled={loading || !agentId.trim()}
              >
                {loading ? 'Creating...' : '🚀 Create Agent'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
