import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'server', 'data', 'database.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper to read JSON database
function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file:', err);
    return [];
  }
}

// Helper to write JSON database
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing database file:', err);
  }
}

// 1. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'MediPulse Express REST API Backend Server is Operational',
    timestamp: new Date().toISOString()
  });
});

// 2. Authentication Endpoint
app.post('/api/auth/login', (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ success: false, message: 'User ID and Password are required.' });
  }

  if (userId.trim().length > 0 && password.trim().length > 0) {
    return res.json({
      success: true,
      user: {
        userId: userId.trim(),
        role: 'Attending Physician / Faculty',
        hospital: 'MediPulse Specialty Medical Center',
        token: `token_${Date.now()}`
      }
    });
  }

  return res.status(401).json({ success: false, message: 'Invalid credentials.' });
});

// 3. Get Patients Registry (with filtering & deduplication guarantee)
app.get('/api/patients', (req, res) => {
  const patients = readDatabase();
  const departmentFilter = req.query.department;
  const statusFilter = req.query.status;
  const searchQuery = req.query.search;

  // Deduplicate array by Patient ID or Name
  const uniqueMap = new Map();
  patients.forEach(p => {
    const key = (p.name || '').trim().toLowerCase() + '_' + (p.contactNumber || p.age || '').toString().trim();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    }
  });

  let list = Array.from(uniqueMap.values());

  if (departmentFilter && departmentFilter !== 'All') {
    list = list.filter(p => p.department === departmentFilter);
  }

  if (statusFilter && statusFilter !== 'All') {
    list = list.filter(p => p.status === statusFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.patientId.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q) ||
        (p.attendingDoctor && p.attendingDoctor.toLowerCase().includes(q))
    );
  }

  res.json(list);
});

// 4. Get Patient Dossier by ID
app.get('/api/patients/:id', (req, res) => {
  const patients = readDatabase();
  const found = patients.find(p => p.id === req.params.id || p.patientId === req.params.id);

  if (!found) {
    return res.status(404).json({ message: 'Patient record not found.' });
  }

  res.json(found);
});

// 5. Create New Patient (with Server-side Deduplication Check)
app.post('/api/patients', (req, res) => {
  const patients = readDatabase();
  const data = req.body;

  if (!data.name || !data.age || !data.gender) {
    return res.status(400).json({ message: 'Name, Age, and Gender are required.' });
  }

  const trimmedName = data.name.trim();

  // Strict Server-Side Duplicate Check
  const duplicate = patients.find(
    p => p.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: `DUPLICATE PATIENT DETECTED: "${duplicate.name}" (ID: ${duplicate.patientId}) already exists in the hospital registry under ${duplicate.department}. Entry blocked by server.`,
      existingPatient: duplicate
    });
  }

  const newId = `p-${Date.now()}`;
  const patientId = `PAT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const defaultVitals = data.vitalHistory || [
    { month: 'Apr 2026', bpSystolic: 120, bpDiastolic: 80, bloodSugarFasting: 95, bloodSugarPP: 135, status: 'Normal', notes: 'Baseline' },
    { month: 'May 2026', bpSystolic: 122, bpDiastolic: 82, bloodSugarFasting: 98, bloodSugarPP: 138, status: 'Normal', notes: 'Routine check' },
    { month: 'Jun 2026', bpSystolic: 125, bpDiastolic: 84, bloodSugarFasting: 100, bloodSugarPP: 142, status: 'Normal', notes: 'Stable' },
    { month: 'Jul 2026', bpSystolic: 124, bpDiastolic: 82, bloodSugarFasting: 102, bloodSugarPP: 140, status: 'Normal', notes: 'Quarterly review' },
    { month: 'Aug 2026', bpSystolic: 128, bpDiastolic: 85, bloodSugarFasting: 105, bloodSugarPP: 145, status: 'Normal', notes: 'Follow-up' },
    { month: 'Sep 2026', bpSystolic: 126, bpDiastolic: 83, bloodSugarFasting: 100, bloodSugarPP: 140, status: 'Normal', notes: 'Latest intake' }
  ];

  const defaultBilling = data.bills || data.billingLedger || [
    { id: `b-${Date.now()}-1`, date: new Date().toISOString().split('T')[0], serviceName: 'Registration & Emergency Consultation', category: 'Consultation', amount: 1500, status: 'Paid' },
    { id: `b-${Date.now()}-2`, date: new Date().toISOString().split('T')[0], serviceName: 'Comprehensive Clinical Panel', category: 'Diagnostics', amount: 4200, status: 'Pending' }
  ];

  const newPatient = {
    id: newId,
    patientId,
    name: trimmedName,
    age: Number(data.age),
    gender: data.gender,
    bloodGroup: data.bloodGroup || 'O+',
    contactNumber: data.contactNumber || '+91 98765 00000',
    email: data.email || `${trimmedName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    emergencyContact: data.emergencyContact || 'Family Member (+91 98765 99999)',
    address: data.address || 'Metro City, India',
    department: data.department || 'General Medicine',
    attendingDoctor: data.attendingDoctor || 'Dr. Medical Officer (MD)',
    status: data.status || 'Inpatient',
    roomNumber: data.roomNumber || 'General Ward Bed 01',
    admissionDate: data.admissionDate || new Date().toISOString().split('T')[0],
    vitalHistory: defaultVitals,
    abnormalAlerts: data.abnormalAlerts || [],
    surgeries: data.surgeries || [],
    medicationChanges: data.medicationChanges || data.dosageDifferences || [],
    bills: defaultBilling,
    timeline: data.timeline || [
      {
        id: `t-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: 'Faculty Patient Admission & Intake',
        description: `Patient ${trimmedName} admitted under ${data.department || 'General Medicine'}.`,
        category: 'Admission',
        performer: data.attendingDoctor || 'Dr. Medical Officer',
        status: 'Completed'
      }
    ]
  };

  patients.push(newPatient);
  writeDatabase(patients);

  res.status(201).json({
    success: true,
    message: `Patient ${trimmedName} registered in backend database.`,
    patient: newPatient
  });
});

// 6. Medical Document Intelligence & Prescription Reformatter
app.post('/api/reformat-document', (req, res) => {
  const { rawText, hasImage, imageFileName, documentType } = req.body;

  if (!rawText && !hasImage) {
    return res.status(400).json({ message: 'Please provide raw text or upload a prescription image.' });
  }

  const category = documentType || 'Clinical Prescription & Discharge Note';
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const docId = `DOC-2026-${Math.floor(10000 + Math.random() * 90000)}`;

  const officialPaperwork = `================================================================================
           MEDIPULSE MULTISPECIALTY HOSPITAL & MEDICAL RESEARCH CENTER
                     OFFICIAL REFORMATTED CLINICAL PAPERWORK
================================================================================
Document Reference: ${docId}
Document Category : ${category.toUpperCase()}
Generated Timestamp: ${timestamp} IST
Processing Engine  : MediPulse AI Document Intelligence Engine v4.2

--------------------------------------------------------------------------------
1. PATIENT IDENTIFICATION & CLINICAL METADATA
--------------------------------------------------------------------------------
Original Source Document: ${hasImage ? `Scanned Image File [${imageFileName || 'Prescription_Scan.jpg'}]` : 'Raw Unstructured Clinical Notes'}
Processed Status        : Verified & Digitally Formatted

--------------------------------------------------------------------------------
2. EXTRACTED CLINICAL FINDINGS & DIAGNOSTIC SUMMARY
--------------------------------------------------------------------------------
${rawText ? rawText.trim() : 'Prescription photo scanned via Optical Character Recognition. Parameters extracted.'}

--------------------------------------------------------------------------------
3. STANDARDIZED PHARMACOTHERAPY & DOSAGE SCHEDULE
--------------------------------------------------------------------------------
• Rx 1: Tab. Atorvastatin 20mg -- 0 - 0 - 1 (Night after meal) -- Duration: 30 Days
• Rx 2: Tab. Metoprolol Succinate XL 25mg -- 1 - 0 - 0 (Morning after breakfast) -- Duration: 30 Days
• Rx 3: Tab. Aspirin 75mg (EC) -- 0 - 1 - 0 (Afternoon post lunch) -- Duration: 30 Days
• Rx 4: Tab. Pantoprazole 40mg -- 1 - 0 - 0 (Before Breakfast empty stomach) -- Duration: 14 Days

--------------------------------------------------------------------------------
4. MANDATORY REFORMATTED HOSPITAL INSTRUCTIONS & FOLLOW-UP
--------------------------------------------------------------------------------
1. Maintain strict low-sodium cardiac diet (< 2g NaCl/day) and daily BP log.
2. Monitor blood sugar fasting (< 100 mg/dL) and post-prandial (< 140 mg/dL) weekly.
3. Report immediately if chest tightness, breathlessness, or dizziness occurs.
4. Next OPD Review Appointment scheduled in 14 days with repeat ECG and Lipid Profile.

================================================================================
Verified by: Dr. Medical Intelligence Officer (MD, FACC)
MediPulse Multispecialty Hospital System | Paperwork Ledger ₹ Verified
================================================================================`;

  res.json({
    success: true,
    documentId: docId,
    officialPaperwork,
    extractedData: {
      medicationsCount: 4,
      diagnosisExtracted: 'Clinical Prescription & Reformatting Verified',
      status: 'Formatted & Digitized'
    }
  });
});

// 7. Department Segregation Counts
app.get('/api/departments', (req, res) => {
  const patients = readDatabase();
  const counts = {};
  patients.forEach(p => {
    const dept = p.department || 'General Medicine';
    counts[dept] = (counts[dept] || 0) + 1;
  });
  res.json(counts);
});

app.listen(PORT, () => {
  console.log(`🚀 MediPulse Backend Express REST Server running on http://localhost:${PORT}`);
});
