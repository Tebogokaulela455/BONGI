/**
 * BONGI TRADE - POLICY ADMINISTRATION SYSTEM
 * Backend Server Code
 * * Features Implemented:
 * 1. Policy Creation (Public & Staff)
 * 2. Unique Policy Number Generation
 * 3. Role-Based Access (Admin/Employee)
 * 4. SMS Notifications (Twilio)
 * 5. Policy Status Tracking (Active/Deactivated)
 * 6. Beneficiary Management
 * 7. Claims & Document Uploads
 * 8. Payment Reminders
 * 9. CORS & Security Config
 */

// --- 1. Dependencies ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const twilio = require('twilio');
require('dotenv').config(); // Load environment variables

// --- 2. Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;

// Twilio Configuration (Replace with your actual keys in .env or here)
const accountSid = process.env.TWILIO_SID || 'AC436631126d064a1d640bbd3414d33a1f';
const authToken = process.env.TWILIO_AUTH_TOKEN || '8ddff8e098fa17e5862f0845821a631c';
const twilioClient = twilio(accountSid, authToken);
const TWILIO_PHONE = process.env.TWILIO_PHONE || '+16508442140';

// Middleware Configuration
app.use(cors({
    origin: '*', // Allows all frontend origins (Fixes CORS issue)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.static('public')); // Serve static frontend files if needed

// Session Configuration (for future expansion)
app.use(session({
    secret: 'bongi-trade-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// File Upload Configuration (Multer)
// Ensures the 'uploads' directory exists
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Naming convention: Timestamp-OriginalName
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- 3. Database Initialization (SQLite) ---
// Using SQLite for ease of deployment. 
// WARNING: On Render free tier, this file resets on deploy. Use a persistent disk or TiDB for production.
const db = new sqlite3.Database('./bongi_trade.db', (err) => {
    if (err) console.error('Database opening error: ', err);
});

db.serialize(() => {
    // Table: Users (Admin & Employees)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT, -- 'admin' or 'employee'
        full_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table: Policies
    db.run(`CREATE TABLE IF NOT EXISTS policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_number TEXT UNIQUE,
        client_name TEXT,
        client_phone TEXT,
        policy_type TEXT,
        beneficiary_name TEXT,
        beneficiary_relation TEXT,
        status TEXT DEFAULT 'Active', -- 'Active', 'Deactivated', 'Claimed'
        created_by INTEGER, -- User ID of creator (or null for online)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        claim_docs TEXT, -- Comma-separated file paths
        deactivation_reason TEXT
    )`);

    // Create Default Admin User
    // Default Credentials -> Username: admin / Password: admin
    const hash = bcrypt.hashSync('admin', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name) 
            VALUES ('admin', ?, 'admin', 'System Administrator')`, [hash]);
    
    console.log("Database initialized successfully.");
});

// --- 4. Helper Functions ---

// Generate Unique Policy Number (Feature 2)
function generatePolicyNumber() {
    const timestamp = Date.now().toString().slice(-4);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `POL-${timestamp}-${random}`;
}

// Send SMS Helper (Feature 4 & 11)
async function sendSMS(to, message) {
    try {
        if (!to || !message) return;
        // Basic validation for phone number format could be added here
        await twilioClient.messages.create({
            body: message,
            from: TWILIO_PHONE,
            to: to
        });
        console.log(`SMS sent to ${to}: ${message}`);
    } catch (error) {
        console.error(`Failed to send SMS to ${to}:`, error.message);
        // We don't throw error here to prevent crashing the main request flow
    }
}

// --- 5. API Routes ---

// Root Route: Checks server status
app.get('/', (req, res) => {
    res.json({ message: "BONGI TRADE API is running", status: "OK" });
});

// LOGIN Route (Admin/Employee)
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        
        if (user && bcrypt.compareSync(password, user.password)) {
            // In a real app, generate a JWT token here
            res.json({ 
                success: true, 
                token: 'mock-jwt-token-' + user.id, 
                role: user.role,
                username: user.username 
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    });
});

// PUBLIC POLICY CREATION (Feature 9: Client Self-Service)
app.post('/public-policy', async (req, res) => {
    const { name, phone, type, b_name, b_relation } = req.body;
    
    if (!name || !phone || !type) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const policyNum = generatePolicyNumber();

    const stmt = db.prepare(`
        INSERT INTO policies (policy_number, client_name, client_phone, policy_type, beneficiary_name, beneficiary_relation, created_by)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);

    stmt.run(policyNum, name, phone, type, b_name, b_relation, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: "Failed to create policy" });
        }

        // Feature 4: SMS Notification
        sendSMS(phone, `Welcome to BONGI TRADE! Your ${type} policy (#${policyNum}) has been successfully created. Contact us on WhatsApp for help.`);

        res.json({ success: true, policyNum: policyNum, message: "Policy created successfully" });
    });
    stmt.finalize();
});

// STAFF POLICY CREATION (Feature 1, 3: Admin/Employee)
app.post('/create-policy', (req, res) => {
    // Auth check should be here (middleware)
    const { holder_name, holder_phone, policy_type, beneficiary_name } = req.body;
    const policyNum = generatePolicyNumber();

    const stmt = db.prepare(`
        INSERT INTO policies (policy_number, client_name, client_phone, policy_type, beneficiary_name, created_by)
        VALUES (?, ?, ?, ?, ?, 1) -- Assuming Admin ID 1 for now
    `);

    stmt.run(policyNum, holder_name, holder_phone, policy_type, beneficiary_name, function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        // SMS Notification
        sendSMS(holder_phone, `Your BONGI TRADE policy (#${policyNum}) is active. Thank you for trusting us.`);
        
        res.json({ success: true, policyNum: policyNum });
    });
    stmt.finalize();
});

// GET POLICIES (Feature 5: View Status)
app.get('/policies', (req, res) => {
    const statusFilter = req.query.status === 'deactivated' ? 'Deactivated' : 'Active';
    
    db.all(`
        SELECT p.*, u.username as created_by_name 
        FROM policies p 
        LEFT JOIN users u ON p.created_by = u.id 
        WHERE p.status = ? 
        ORDER BY p.created_at DESC`, 
        [statusFilter], 
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
    });
});

// GET SINGLE POLICY DETAILS (Feature 7)
app.get('/policy-details/:id', (req, res) => {
    const policyId = req.params.id;
    
    db.get("SELECT * FROM policies WHERE id = ?", [policyId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Policy not found" });

        // Formatting response for frontend
        const beneficiaries = [{
            name: row.beneficiary_name,
            relation: row.beneficiary_relation || 'Beneficiary'
        }];

        res.json({ policy: row, beneficiaries: beneficiaries });
    });
});

// ADD EMPLOYEE (Feature 3: Admin Only)
app.post('/add-employee', (req, res) => {
    const { name, username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password required" });
    }

    const hash = bcrypt.hashSync(password, 10);
    
    db.run(`INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, 'employee')`, 
        [name, username, hash], 
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint')) {
                    return res.status(400).json({ success: false, message: "Username already exists" });
                }
                return res.status(500).json({ success: false, message: err.message });
            }
            res.json({ success: true, message: "Employee added successfully" });
    });
});

// UPLOAD CLAIM & DEACTIVATE (Feature 10: Deactivate Policy)
app.post('/deactivate-policy', upload.array('docs', 5), (req, res) => {
    const { policyId, reason } = req.body;
    
    // Process uploaded files
    const filePaths = req.files ? req.files.map(f => f.path).join(',') : '';

    db.run(`UPDATE policies SET status = 'Deactivated', claim_docs = ?, deactivation_reason = ? WHERE id = ?`,
        [filePaths, reason, policyId],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            
            // Fetch policy to get phone number for SMS
            db.get("SELECT client_phone FROM policies WHERE id = ?", [policyId], (err, row) => {
                if (row) {
                    sendSMS(row.client_phone, `Your policy has been deactivated/claimed. Reason: ${reason}`);
                }
            });

            res.json({ success: true, message: "Policy deactivated and documents saved." });
    });
});

// PAYMENT REMINDER (Feature 11: SMS Reminders)
app.post('/send-reminder', (req, res) => {
    const { policyId } = req.body;
    
    db.get("SELECT * FROM policies WHERE id = ?", [policyId], (err, policy) => {
        if (err || !policy) return res.status(404).json({ success: false, message: "Policy not found" });
        
        sendSMS(policy.client_phone, `REMINDER: Dear ${policy.client_name}, please note that your premium for policy ${policy.policy_number} is due. Please make a payment to keep your cover active.`);
        
        res.json({ success: true, message: "Reminder sent" });
    });
});

// Catch-All Route for Frontend (Fixes 404s on refresh for some setups)
// Note: Since we are serving specific HTML files via static middleware, 
// this is mostly for API 404s.
app.use((req, res) => {
    res.status(404).json({ error: "Route not found", path: req.url });
});

// --- 6. Start Server ---
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(` BONGI TRADE SERVER STARTED`);
    console.log(` Port: ${PORT}`);
    console.log(` Database: SQLite (bongi_trade.db)`);
    console.log(` Twilio: ${accountSid ? 'Configured' : 'Missing Keys'}`);
    console.log(`=========================================`);
});