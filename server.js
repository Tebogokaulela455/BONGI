const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS) from the root folder
app.use(express.static(path.join(__dirname, '/')));

// Database Configuration
const dbConfig = {
    host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    user: '46EdNwRpTQ544FS.root',
    password: 'Y0XC4KmZTFDkB8qy',
    database: 'test',
    port: 4000,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
};

// Twilio Configuration
const twilioClient = twilio('AC436631126d064a1d640bbd3414d33a1f', '8ddff8e098fa17e5862f0845821a631c');

// --- ROUTES ---

// 1. Landing Page (Render will show login.html first)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 2. Staff Login (Admin/Employee)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const db = await mysql.createConnection(dbConfig);
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        
        if (rows.length > 0) {
            const token = jwt.sign(
                { id: rows[0].id, role: rows[0].role }, 
                '2eaed983fac39b286b3ff3da09dfbf0e', 
                { expiresIn: '24h' }
            );
            res.json({ success: true, token, role: rows[0].role });
        } else {
            res.status(401).json({ success: false, message: "Invalid username or password" });
        }
        await db.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Online Policy Creation (Public Link - No Login Required)
app.post('/public-policy', async (req, res) => {
    const { name, phone, type, b_name, b_relation } = req.body;
    const policyNum = 'BT-' + Date.now().toString().slice(-6); // Unique Policy Number
    
    try {
        const db = await mysql.createConnection(dbConfig);
        
        // Create Policy
        const [result] = await db.execute(
            'INSERT INTO policies (policy_number, client_name, client_phone, policy_type) VALUES (?, ?, ?, ?)', 
            [policyNum, name, phone, type]
        );
        
        // Add Beneficiary
        await db.execute(
            'INSERT INTO beneficiaries (policy_id, name, relation) VALUES (?, ?, ?)', 
            [result.insertId, b_name, b_relation]
        );

        // Send SMS via Twilio
        await twilioClient.messages.create({
            body: `BONGI TRADE: Hello ${name}, your ${type} policy (${policyNum}) is now active. Contact 0715916053 for queries.`,
            from: '+16508442140',
            to: phone
        });

        res.json({ success: true, policyNum });
        await db.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Admin: Add Employee
app.post('/add-employee', async (req, res) => {
    const { name, username, password } = req.body;
    try {
        const db = await mysql.createConnection(dbConfig);
        await db.execute(
            'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, "employee")', 
            [name, username, password]
        );
        res.json({ success: true, message: "Employee added successfully" });
        await db.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. File Upload Setup (for Death Certificates)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

app.post('/upload-claim', upload.array('docs', 5), async (req, res) => {
    try {
        // Log files to console (In real app, save req.files paths to DB)
        console.log("Uploaded files:", req.files);
        res.json({ success: true, message: "Documents uploaded successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => {
    console.log(`BONGI TRADE server active on port ${PORT}`);
});