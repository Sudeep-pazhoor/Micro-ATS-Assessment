const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('Mongo error:', err));


const InterviewerSchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const CandidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const InterviewSlotSchema = new mongoose.Schema({
  interviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },  
  status: { type: String,
    enum: ['Applied', 'Technical Round', 'Offered', 'Rejected'],
    default: 'Technical Round',
  },
});

const Interviewer = mongoose.model('Interviewer', InterviewerSchema);
const Candidate = mongoose.model('Candidate', CandidateSchema);
const InterviewSlot = mongoose.model('InterviewSlot', InterviewSlotSchema);

app.get('/api/interviewers', async (req, res) => {
  const interviewers = await Interviewer.find();
  res.json(interviewers);
});

app.get('/api/candidates', async (req, res) => {
  const candidates = await Candidate.find();
  res.json(candidates);
});

// new candi add
app.post('/api/candidates', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const candidate = await Candidate.create({ name });
    res.status(201).json(candidate);
  } catch (err) {
    res.status(500).json({ message: 'Failed to add candidate' });
  }
});

// Get all slots for a specific interviewer 
app.get('/api/interviewers/:id/slots', async (req, res) => {
  const slots = await InterviewSlot.find({ interviewerId: req.params.id }).populate(
    'candidateId',
    'name'
  );
  res.json(slots);
});

// interview book overlap detection
app.post('/api/schedule', async (req, res) => {
  const { candidateId, interviewerId, startTime, endTime } = req.body;

  if (!candidateId || !interviewerId || !startTime || !endTime) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const start = new Date(startTime); // converts ISO string → UTC Date
  const end = new Date(endTime);

  if (start >= end) {
    return res.status(400).json({ message: 'End time must be after start time' });
  }

  // slot overlap check
  const overlapping = await InterviewSlot.findOne({
    interviewerId,
    startTime: { $lt: end },
    endTime: { $gt: start },
  }).populate('candidateId', 'name');

  if (overlapping) {
    return res.status(409).json({
      message: 'Scheduling conflict detected',
      conflictingCandidate: overlapping.candidateId?.name || 'Unknown',
    });
  }

  const slot = await InterviewSlot.create({
    interviewerId,
    candidateId,
    startTime: start,
    endTime: end,
  });

  const populated = await slot.populate('candidateId', 'name');
  res.status(201).json({ message: 'Scheduled successfully', slot: populated });
});

// slot statusUpdate
app.patch('/api/slots/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['Applied', 'Technical Round', 'Offered', 'Rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  const slot = await InterviewSlot.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  ).populate('candidateId', 'name');
  if (!slot) return res.status(404).json({ message: 'Slot not found' });
  res.json(slot);
});

// delete a slot
app.delete('/api/slots/:id', async (req, res) => {
  await InterviewSlot.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted successfully' });
});

// Seed demo data (GET so it's easy to trigger from browser)
app.get('/api/seed', async (req, res) => {
  await Promise.all([
    Candidate.deleteMany({}),
    Interviewer.deleteMany({}),
    InterviewSlot.deleteMany({}),
  ]);

  const [arjun, ramya] = await Interviewer.insertMany([
    { name: 'Arjun' },
    { name: 'Ramya' },
  ]);

  const [c1, c2, c3] = await Candidate.insertMany([
    { name: 'Arun' },
    { name: 'Priya' },
    { name: 'Ranjith' },
  ]);

  // Create a slot 
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(11, 0, 0, 0);

  await InterviewSlot.create({
    interviewerId: arjun._id,
    candidateId: c1._id,
    startTime: tomorrow,
    endTime: tomorrowEnd,
    status: 'Technical Round',
  });

  res.json({
    message: 'Demo data seeded',
    interviewers: [Arjun, bob],
    candidates: [c1, c2, c3],
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
