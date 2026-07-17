import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import './App.css';

const API = '/api';
const STATUSES = ['Applied', 'Technical Round', 'Offered', 'Rejected'];

function formatLocal(iso) {
  if (!iso) return '—';
  return DateTime.fromISO(iso).toLocal().toFormat('dd MMM yyyy, h:mm a');
}

function Toast({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' ? '✓' : '✕'} {t.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [interviewers, setInterviewers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [slots, setSlots] = useState([]);
  const [interviewerId, setInterviewerId] = useState('');
  const [form, setForm] = useState({ candidateId: '', startTime: '', endTime: '' });
  const [newCandidate, setNewCandidate] = useState({ name: '' });
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  // Load interviewers + Candidates
  useEffect(() => {
    Promise.all([axios.get(`${API}/interviewers`), axios.get(`${API}/candidates`)])
      .then(([iv, c]) => {
        setInterviewers(iv.data);
        setCandidates(c.data);
        if (iv.data.length > 0) setInterviewerId(iv.data[0]._id);
      })
      .catch(() => toast('Could not connect to backend.', 'error'));
  }, [toast]);

  // Reload slots when selected interviewer changes
  useEffect(() => {
    if (!interviewerId) return;
    axios.get(`${API}/interviewers/${interviewerId}/slots`)
      .then(r => setSlots(r.data))
      .catch(() => setSlots([]));
  }, [interviewerId]);

  const refreshSlots = () =>
    axios.get(`${API}/interviewers/${interviewerId}/slots`).then(r => setSlots(r.data));

  const schedule = async () => {
    const { candidateId, startTime, endTime } = form;
    if (!candidateId || !startTime || !endTime) return toast('Fill in all fields.', 'error');
    if (new Date(startTime) >= new Date(endTime)) return toast('End must be after start.', 'error');
    setLoading(true);
    try {
      await axios.post(`${API}/schedule`, {
        candidateId,
        interviewerId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });
      toast('Interview scheduled!');
      setForm({ candidateId: '', startTime: '', endTime: '' });
      refreshSlots();
    } catch (err) {
      if (err.response?.status === 409)
        toast(`Conflict with ${err.response.data.conflictingCandidate}`, 'error');
      else
        toast('Failed to schedule.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (slotId, status) => {
    const { data } = await axios.patch(`${API}/slots/${slotId}/status`, { status });
    setSlots(p => p.map(s => s._id === slotId ? data : s));
    toast(`Status set to "${status}"`);
  };

  const deleteSlot = async (slotId) => {
    if (!window.confirm('Remove this slot?')) return;
    await axios.delete(`${API}/slots/${slotId}`);
    setSlots(p => p.filter(s => s._id !== slotId));
    toast('Slot removed.');
  };

  const addCandidate = async () => {
    const { name } = newCandidate;
    if (!name.trim()) return toast('Name is required.', 'error');
    const { data } = await axios.post(`${API}/candidates`, { name, email: '' });
    setCandidates(p => [...p, data]);
    setNewCandidate({ name: '' });
    toast(`${data.name} added.`);
  };

  const currentInterviewer = interviewers.find(i => i._id === interviewerId);

  return (
    <div className="app">
      <Toast toasts={toasts} />

      <div className="topbar">
        <span className="topbar-title">Micro-ATS</span>
      </div>

      <div className="layout">

        {/* Schedule form */}
        <div className="panel">
          <div className="panel-head">Schedule Interview</div>
          <div className="panel-body">

            <label>Interviewer</label>
            <select value={interviewerId} onChange={e => setInterviewerId(e.target.value)}>
              {interviewers.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
            </select>

            <label>Candidate</label>
            <select value={form.candidateId} onChange={e => setForm({ ...form, candidateId: e.target.value })}>
              <option value="">Select a candidate</option>
              {candidates.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>

            <div className="row2">
              <div>
                <label>Start Time</label>
                <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label>End Time</label>
                <input type="datetime-local" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>

            <p className="hint"></p>

            <button className="btn-primary" onClick={schedule} disabled={loading}>
              {loading ? 'Checking...' : 'Schedule Interview'}
            </button>
          </div>
        </div>

        {/* add candidate */}
        <div className="panel">
          <div className="panel-head">Add Candidate</div>
          <div className="panel-body">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="e.g. Jane Doe"
              value={newCandidate.name}
              onChange={e => setNewCandidate({ name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addCandidate()}
            />
            <button className="btn-add" onClick={addCandidate}>
              ➕ Add Candidate
            </button>
          </div>
        </div>

        {/* Schedule panel */}
        <div className="panel">
          <div className="panel-head">
            <span>{currentInterviewer ? `${currentInterviewer.name}'s Schedule` : 'Interview Schedule'}</span>
          </div>
          <div className="panel-body">
            {slots.length === 0 ? (
              <div className="empty">
                <p>No interviews scheduled</p>
                <small>Use the form on the left to book a slot.</small>
              </div>
            ) : (
              slots
                .slice()
                .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                .map(slot => (
                  <div key={slot._id} className="slot-row">
                    <div className="slot-info">
                      <strong>{slot.candidateId?.name || 'Unknown'}</strong>
                      <span>{formatLocal(slot.startTime)} — {formatLocal(slot.endTime)}</span>
                    </div>
                    <div className="slot-actions">
                      <select
                        className={`status-pill status-${slot.status.replace(' ', '-')}`}
                        value={slot.status}
                        onChange={e => updateStatus(slot._id, e.target.value)}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="btn-delete" onClick={() => deleteSlot(slot._id)} title="Remove">🗑️</button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
