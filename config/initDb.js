const db = require('./db');

const initDb = async () => {
    try {
        // 1. Users Table (Admin, Employees, Clients)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'employee', 'client') DEFAULT 'client',
                phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Policies Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS policies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                policy_number VARCHAR(50) UNIQUE NOT NULL,
                user_id INT,
                policy_type VARCHAR(100) NOT NULL,
                premium_amount DECIMAL(10, 2) NOT NULL,
                status ENUM('active', 'inactive', 'pending', 'claimed') DEFAULT 'pending',
                start_date DATE,
                payment_due_date DATE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // 3. Beneficiaries Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS beneficiaries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                policy_id INT,
                name VARCHAR(255) NOT NULL,
                relation VARCHAR(100),
                id_number VARCHAR(50),
                FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
            )
        `);

        // 4. Claims Table (Stores document paths)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS claims (
                id INT AUTO_INCREMENT PRIMARY KEY,
                policy_id INT,
                reason TEXT,
                document_path VARCHAR(255),
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (policy_id) REFERENCES policies(id)
            )
        `);

        console.log("✅ All tables initialized successfully via TiDB.");
    } catch (error) {
        console.error("❌ Database initialization failed:", error);
    }
};

module.exports = initDb;