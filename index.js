const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    try {
        const token = req?.headers?.token;
        console.log('from headers', token)
        if (!token) {
            return res?.status(401)?.send({ message: 'forbidden access' })
        }
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).send({ message: 'forbidden access' })
            }
            else {
                req.decoded = decoded;
                next();
            }
        });
    } catch (error) {
        console.log(error)
    }
}
// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mf3nl9y.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // >>>>>>collections<<<<<<<<<<
        const database = client.db("commerceDB");
        const userCollection = database.collection("users");
        // >>>>>>collections<<<<<<<<<<

        //  >>>>>>>>>>>>>>>>>>>>>>JWT related api<<<<<<<<<<<<<<
        app.post('/jwt', async (req, res) => {
            try {
                const user = req.body;
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' });
                res.send({ token })
            } catch (error) {
                console.log(error)
            }
        })
        //  >>>>>>>>>>>>>>>>>>>>>>JWT related api<<<<<<<<<<<<<<

        //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<
        app.post('/users', async (req, res) => {
            try {
                const userInfo = req?.body;
                const email = userInfo?.email;
                const filter = { email: email };
                const isExist = await userCollection.findOne(filter);
                if (isExist) {
                    return res.send({ message: 'user is already exist', insertedId: null })
                }
                const result = await userCollection.insertOne(userInfo);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })
        //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    try {
        res.send('Commerce book server running!')
    } catch (error) {
        console.log(error)
    }
})

app.listen(port, () => {
    console.log(`Commerce book app listening on port ${port}`)
})