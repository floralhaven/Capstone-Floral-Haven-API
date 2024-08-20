const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectToDB = require('./db');

const app = express();
const PORT = 3000;
const HTTPS_PORT = 3443; 

const saltRounds = 10;

connectToDB();

const sslOptions = {
    key: fs.readFileSync('/etc/ssl/private/selfsigned.key'),
    cert: fs.readFileSync('/etc/ssl/certs/selfsigned.crt')
};

// Define User and Layout Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    favorites: [
        {
            plantId: String,
            commonName: String,
            scientificName: String,
            safety: {
                cats: String,
                dogs: String
            },
            image: String,
            collection: String
        }
    ]
});

const layoutSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    layoutName: { type: String, required: true },
    grid: { type: Array, required: true }
});

const commentSchema = new mongoose.Schema({
    layoutOwner: { type: String, required: true },
    layoutName: { type: String, required: true },
    username: { type: String, required: true }, // User who made the comment
    commentText: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Layout = mongoose.model('Layout', layoutSchema);
const Comments = mongoose.model('Comments', commentSchema);

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '..')));

// Handle sign-up POST request
app.post('/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({
            email,
            username,
            password: hashedPassword
        });

        await newUser.save();
        res.json({ message: 'User signed up successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Error saving user data' });
    }
});

// Handle login POST request
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        res.json({ message: 'Login successful', username });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Handle logout
app.post('/logout', (req, res) => {
    res.json({ message: 'Logout successful' });
});

// Handle saving a layout
app.post('/user/layout', async (req, res) => {
    const { layoutName, layout, username } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const newLayout = new Layout({
            userId: user._id,
            username: user.username,
            layoutName,
            grid: layout // Store the layout including the image URLs
        });

        await newLayout.save();

        res.status(201).json({ message: 'Layout saved successfully!', layout: newLayout });
    } catch (error) {
        console.error('Error saving layout:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Handle fetching layouts for a user
app.get('/user/:username/layouts', async (req, res) => {
    const { username } = req.params;

    try {
        const layouts = await Layout.find({ username });

        if (!layouts) {
            return res.status(404).json({ message: 'No layouts found' });
        }

        res.json(layouts);
    } catch (error) {
        console.error('Error fetching layouts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/user/:username/favorites', async (req, res) => {
    const { username } = req.params;
    const { plantId, favorited, commonName, scientificName, image, collection } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (favorited) {
            // Add to favorites
            if (!user.favorites.some(fav => fav.plantId === plantId)) {
                user.favorites.push({ plantId, commonName, scientificName, image, collection });
            }
        } else {
            // Remove from favorites
            user.favorites = user.favorites.filter(fav => fav.plantId !== plantId);
        }

        await user.save();

        res.status(200).json({ message: 'Favorite status updated', favorites: user.favorites });
    } catch (error) {
        console.error('Error updating favorite status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/user/:username/favorites', async (req, res) => {
    try {
        const username = req.params.username;
        const user = await User.findOne({ username }).select('favorites').lean();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'An error occurred' });
    }
});

// DELETE Favorite
app.delete('/user/:username/favorites/:plantId', async (req, res) => {
    const { username, plantId } = req.params;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove the plant from the favorites array
        user.favorites = user.favorites.filter(fav => fav.plantId !== plantId);
        await user.save();

        res.status(200).json({ message: 'Plant removed from favorites' });
    } catch (error) {
        console.error('Error removing favorite plant:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Endpoint to get data from a specific collection
app.get('/data/:collectionName', async (req, res) => {
    const { collectionName } = req.params;
    const { commonName } = req.query;

    try {
        const collection = mongoose.connection.collection(collectionName);

        let data;
        if (commonName) {
            data = await collection.find({ commonName }).toArray();
        } else {
            data = await collection.find().toArray();
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ message: `Error fetching data from collection: ${collectionName}` });
    }
});

// Handle fetching all layouts
app.get('/layouts', async (req, res) => {
    try {
        const layouts = await Layout.find();
        res.json(layouts);
    } catch (error) {
        console.error('Error fetching layouts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

//Comments
app.post('/comments', async (req, res) => {
    const { layoutOwner, layoutName, username, commentText } = req.body;

    if (!layoutOwner || !layoutName || !username || !commentText) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        const newComment = new Comments({
            layoutOwner,
            layoutName,
            username,
            commentText
        });

        await newComment.save();
        res.status(201).json(newComment);
    } catch (error) {
        console.error('Error saving comment:', error);
        res.status(500).json({ message: 'Error saving comment' });
    }
});

app.get('/comments', async (req, res) => {
    const { layoutOwner, layoutName } = req.query;

    try {
        const comments = await Comments.find({ layoutOwner, layoutName });
        res.status(200).json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Error fetching comments' });
    }
});

// Handle password change
app.post('/change-password', async (req, res) => {
    const { oldpassword, newpassword, username } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordMatch = await bcrypt.compare(oldpassword, user.password);

        if (!passwordMatch) {
            return res.status(400).json({ message: 'Old password is incorrect' });
        }

        const hashedNewPassword = await bcrypt.hash(newpassword, saltRounds);

        user.password = hashedNewPassword;
        await user.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Redirect HTTP to HTTPS
app.use((req, res, next) => {
    if (req.secure) {
        // Request was via https, so do no special handling
        next();
    } else {
        // Redirect to https
        res.redirect(`https://${req.headers.host}${req.url}`);
    }
});

// Start the HTTP server
app.listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}`);
});

// Start the HTTPS server
https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
    console.log(`HTTPS server running on https://localhost:${HTTPS_PORT}`);
});