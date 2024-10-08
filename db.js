const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://Admin:IMXshfqLgjgzNZwN@originalcluster.g2m81ys.mongodb.net/Capstone?retryWrites=true&w=majority';

const connectToDB = async () => {
    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB', error);
        throw error;
    }
};

module.exports = connectToDB;
