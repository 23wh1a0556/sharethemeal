const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');

const app = express();
const port = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function getConnection() {
    return mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root',
        database: 'sharemeal',
        port: 3306
    });
}

async function testConnection() {
    try {
        const connection = await getConnection();
        console.log('Database connection successful!');
        connection.end();
    } catch (error) {
        console.error('Database connection failed:', error);
    }
}

testConnection();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const orphanageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/orphanageUploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const orphanageUpload = multer({ storage: orphanageStorage });

const restaurantStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/restaurantUploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const restaurantUpload = multer({ storage: restaurantStorage });

app.post('/register', async (req, res) => {
    const { name, gender, phone, email, address, password, role } = req.body;
    try {
        const connection = await getConnection();
        const [existingUsers] = await connection.execute('SELECT email FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            connection.end();
            return res.status(400).json({ error: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await connection.execute(
            'INSERT INTO users (name, gender, phone, email, address, password_hash, registration_date, role) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)',
            [name, gender, phone, email, address, hashedPassword, role || 'user']
        );
        connection.end();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const connection = await getConnection();
        const [users] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        connection.end();
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (passwordMatch) {
            res.json({ message: 'Login successful', name: user.name, role: user.role });
        } else {
            res.status(401).json({ error: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/donate', upload.single('image'), async (req, res) => {
    const { foodName, quantity, type, location, mode } = req.body;
    const image = req.file ? req.file.filename : null;

    try {
        const connection = await getConnection();
        await connection.execute(
            'INSERT INTO donations (foodName, quantity, type, image, location, mode) VALUES (?, ?, ?, ?, ?, ?)',
            [foodName, quantity, type, image, location, mode]
        );
        connection.end();
        res.send('Donation submitted successfully!');
    } catch (error) {
        console.error('Donation error:', error);
        res.status(500).send('An error occurred.');
    }
});

app.post('/registerOrphanage', orphanageUpload.array('images', 10), async (req, res) => {
    const { 'orphan-name': orphanName, address, 'num-people': numPeople } = req.body;
    const images = req.files ? req.files.map(file => file.filename).join(',') : null;

    try {
        const connection = await getConnection();
        await connection.execute(
            'INSERT INTO orphanages (orphan_name, address, num_people, images) VALUES (?, ?, ?, ?)',
            [orphanName, address, numPeople, images]
        );
        connection.end();
        res.send('Orphanage registered successfully!');
    } catch (error) {
        console.error('Orphanage registration error:', error);
        res.status(500).send('An error occurred.');
    }
});

app.get('/getOrphanages', async (req, res) => {
    try {
        const connection = await getConnection();
        const [orphanages] = await connection.execute('SELECT id, orphan_name, address FROM orphanages');
        connection.end();
        res.json(orphanages);
    } catch (error) {
        console.error('Error fetching orphanages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/donateToOrphanage', upload.single('image'), async (req, res) => {
    const { orphanageId, foodName, quantity, location } = req.body;
    const image = req.file ? req.file.filename : null;

    console.log("Received data:", req.body, req.file);

    try {
        const connection = await getConnection();
        await connection.execute(
            'INSERT INTO orphanage_donations (orphanage_id, food_name, quantity, image, location) VALUES (?, ?, ?, ?, ?)',
            [orphanageId, foodName, quantity, image, location]
        );
        connection.end();
        res.send('Donation submitted successfully!');
    } catch (error) {
        console.error('Donation error:', error);
        res.status(500).send('An error occurred.');
    }
});

app.post('/registerRestaurant', restaurantUpload.array('images', 10), async (req, res) => {
    const { 'restaurant-name': restaurantName, address, 'contact-number': contactNumber, 'ready-to-donate': readyToDonate } = req.body;
    const images = req.files ? req.files.map(file => file.filename).join(',') : null;
    const isReadyToDonate = readyToDonate === 'true';

    try {
        const connection = await getConnection();
        await connection.execute(
            'INSERT INTO restaurants (restaurant_name, address, contact_number, images, donate_to_orphanage) VALUES (?, ?, ?, ?, ?)',
            [restaurantName, address, contactNumber, images, isReadyToDonate]
        );
        connection.end();
        res.send('Restaurant registered successfully!');
    } catch (error) {
        console.error('Restaurant registration error:', error);
        res.status(500).send('An error occurred.');
    }
});

app.get('/getRestaurants', async (req, res) => {
    try {
        const connection = await getConnection();
        const [restaurants] = await connection.execute('SELECT id, restaurant_name, address FROM restaurants');
        connection.end();
        res.json(restaurants);
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/getDonatingRestaurants', async (req, res) => {
    try {
        const connection = await getConnection();
        const [restaurants] = await connection.execute('SELECT id, restaurant_name, address FROM restaurants WHERE donate_to_orphanage = TRUE');
        connection.end();
        res.json(restaurants);
    } catch (error) {
        console.error('Error fetching donating restaurants:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/shareMealSubmit', async (req, res) => {
    console.log("shareMealSubmit route triggered");
    console.log("Request body:", req.body);
    const { sharerName, foodDescription, location, contactInfo } = req.body;
    console.log("sharerName:", sharerName);
    console.log("foodDescription:", foodDescription);
    console.log("location:", location);
    console.log("contactInfo:", contactInfo);
    try {
        const connection = await getConnection();
        const sql = 'INSERT INTO shared_meals (sharer_name, food_description, location, contact_info, claimed) VALUES (?, ?, ?, ?, FALSE)';
        const values = [sharerName, foodDescription, location, contactInfo];
        console.log("SQL:", sql, values);
        await connection.execute(sql, values);
        connection.end();
        res.send('Meal shared successfully!');
    } catch (error) {
        console.error('Error sharing meal:', error);
        res.status(500).send('An error occurred.');
    }
});

app.get('/getSharedMeals', async (req, res) => {
    try {
        const connection = await getConnection();
        const [meals] = await connection.execute('SELECT id, sharer_name, food_description, location, contact_info FROM shared_meals WHERE claimed = FALSE');
        connection.end();
        res.json(meals);
    } catch (error) {
        console.error('Error fetching shared meals:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/claimMeal', async (req, res) => {
    const { mealId } = req.body;
    console.log("claimMeal route called for mealId:", mealId);
    try {
        const connection = await getConnection();
        const [result] = await connection.execute('UPDATE shared_meals SET claimed = TRUE WHERE id = ?', [mealId]);
        console.log("claimMeal result:", result);
        if (result.affectedRows > 0) {
            connection.end();
            res.send('Meal claimed successfully!');
        } else {
            connection.end();
            res.status(404).send('Meal not found or already claimed.');
        }
    } catch (error) {
        console.error('Error claiming meal:', error);
        res.status(500).send('An error occurred.');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
