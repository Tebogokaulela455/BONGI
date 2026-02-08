/**
 * server.js
 * Core logic for Policy Administration System
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000; // Represents your backend URL

// --- 1. Configuration ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key-change-in-prod',
    resave: false,
    saveUninitialized: false
}));

// File Upload Config (Death certs, etc.)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- 2. Database Setup (SQLite) ---
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // Users Table (Admin, Employee, Client)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        phone TEXT
    )`);

    // Policies Table
    db.run(`CREATE TABLE IF NOT EXISTS policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_number TEXT UNIQUE,
        user_id INTEGER, 
        holder_name TEXT,
        holder_phone TEXT,
        policy_type TEXT,
        beneficiary_name TEXT,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        claim_docs TEXT
    )`);

    // Create a default Admin (username: admin, password: password)
    const hash = bcrypt.hashSync('password', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, phone) VALUES ('admin', ?, 'admin', '0000000000')`, [hash]);
});

// --- 3. Helper Functions ---

// Feature 2: Allocation of unique policy numbers
function generatePolicyNumber() {
    return 'POL-' + Math.floor(100000 + Math.random() * 900000);
}

// Feature 4 & 11: Mock SMS Function (Integrate Twilio here in production)
function sendSMS(phone, message) {
    console.log(`[SMS SENT to ${phone}]: ${message}`);
    // In production: twilioClient.messages.create(...)
}

// Middleware to check login
function requireLogin(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/');
}

// --- 4. Routes ---

// Feature 16: Landing Page is Login
app.get('/', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = user;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: 'Invalid Credentials' });
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Dashboard (Main Hub)
app.get('/dashboard', requireLogin, (req, res) => {
    const user = req.session.user;
    let query = "SELECT * FROM policies WHERE status = 'Active'";
    
    // If client, only show their own policies
    if (user.role === 'client') {
        query += " AND user_id = " + user.id;
    }

    db.all(query, [], (err, policies) => {
        res.render('dashboard', { user, policies });
    });
});

// Feature 15: View Deactivated Policies
app.get('/deactivated', requireLogin, (req, res) => {
    if (req.session.user.role === 'client') return res.redirect('/dashboard');
    
    db.all("SELECT * FROM policies WHERE status = 'Deactivated'", [], (err, policies) => {
        res.render('dashboard', { user: req.session.user, policies, view: 'deactivated' });
    });
});

// Feature 1, 9, 12: Create Policy (Admin/Employee/Client)
app.get('/create-policy', requireLogin, (req, res) => {
    res.render('create_policy', { user: req.session.user });
});

app.post('/create-policy', requireLogin, (req, res) => {
    const { holder_name, holder_phone, policy_type, beneficiary_name } = req.body;
    const policyNum = generatePolicyNumber();
    const userId = req.session.user.id; // Who created it

    db.run(`INSERT INTO policies (policy_number, user_id, holder_name, holder_phone, policy_type, beneficiary_name) 
            VALUES (?, ?, ?, ?, ?, ?)`, 
            [policyNum, userId, holder_name, holder_phone, policy_type, beneficiary_name], 
            function(err) {
                if (err) return res.send("Error creating policy");
                
                // Feature 4: SMS Client
                sendSMS(holder_phone, `Welcome! Your policy ${policyNum} (${policy_type}) has been created.`);
                res.redirect('/dashboard');
            }
    );
});

// Feature 7, 13: View Policy Details
app.get('/policy/:id', requireLogin, (req, res) => {
    db.get("SELECT * FROM policies WHERE id = ?", [req.params.id], (err, policy) => {
        res.render('policy_details', { policy, user: req.session.user });
    });
});

// Feature 10, 14: Upload Claim / Death Cert / Deactivate
app.get('/claim/:id', requireLogin, (req, res) => {
    db.get("SELECT * FROM policies WHERE id = ?", [req.params.id], (err, policy) => {
        res.render('claim', { policy });
    });
});

app.post('/claim/:id', requireLogin, upload.array('documents', 5), (req, res) => {
    const fileNames = req.files.map(f => f.filename).join(',');
    
    // Update status to Deactivated and save file paths
    db.run("UPDATE policies SET status = 'Deactivated', claim_docs = ? WHERE id = ?", 
        [fileNames, req.params.id], (err) => {
            res.redirect('/dashboard');
    });
});

// Feature 3: Admin adds employees
app.get('/admin/users', requireLogin, (req, res) => {
    if(req.session.user.role !== 'admin') return res.redirect('/dashboard');
    db.all("SELECT * FROM users", [], (err, users) => {
        res.render('admin_users', { users });
    });
});

app.post('/admin/add-employee', requireLogin, (req, res) => {
    const { username, password, phone } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password, role, phone) VALUES (?, ?, 'employee', ?)", 
        [username, hash, phone], (err) => {
            res.redirect('/admin/users');
    });
});

// Feature 11: Send Payment Reminder
app.post('/remind-payment/:id', requireLogin, (req, res) => {
    db.get("SELECT * FROM policies WHERE id = ?", [req.params.id], (err, policy) => {
        sendSMS(policy.holder_phone, `REMINDER: Please pay your premium for policy ${policy.policy_number}.`);
        res.redirect('/policy/' + req.params.id);
    });
});

// Public Portal for Self-Registration (Feature 9)
app.get('/public-register', (req, res) => {
    res.render('create_policy', { user: { role: 'guest' } }); 
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});