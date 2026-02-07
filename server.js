const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const multer = require('multer');
const app = express();
app.use(express.json());

const dbConfig = {
    host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    user: '46EdNwRpTQ544FS.root',
    password: 'Y0XC4KmZTFDkB8qy',
    database: 'test',
    port: 4000,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
};

const twilioClient = twilio('AC436631126d064a1d640bbd3414d33a1f', '8ddff8e098fa17e5862f0845821a631c');

// 1. Staff Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const db = await mysql.createConnection(dbConfig);
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (rows.length > 0) {
        const token = jwt.sign({ id: rows[0].id, role: rows[0].role }, '2eaed983fac39b286b3ff3da09dfbf0e');
        res.json({ success: true, token });
    } else { res.status(401).json({ success: false }); }
});

// 2. Public Policy Creation (Shared Link)
app.post('/public-policy', async (req, res) => {
    const { name, phone, type, b_name, b_relation } = req.body;
    const policyNum = 'BT-' + Math.floor(Math.random() * 1000000);
    const db = await mysql.createConnection(dbConfig);
    
    const [result] = await db.execute('INSERT INTO policies (policy_number, client_name, client_phone, policy_type) VALUES (?, ?, ?, ?)', [policyNum, name, phone, type]);
    await db.execute('INSERT INTO beneficiaries (policy_id, name, relation) VALUES (?, ?, ?)', [result.insertId, b_name, b_relation]);

    // 4. SMS via Twilio
    await twilioClient.messages.create({
        body: `BONGI TRADE: Hi ${name}, your ${type} policy ${policyNum} is active.`,
        from: '+16508442140',
        to: phone
    });

    res.json({ success: true, policyNum });
});

// 10. Claim Document Upload
const upload = multer({ dest: 'uploads/' });
app.post('/upload-claim', upload.array('docs'), async (req, res) => {
    // Logic to save file paths to database
    res.json({ success: true });
});

app.listen(5000, () => console.log("BONGI TRADE Server running on Port 5000"));