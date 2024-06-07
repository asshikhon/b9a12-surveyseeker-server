const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9ola8x0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // await client.connect();


    const surveyCollection = client.db("surveyDb").collection("surveys");


    // jwt related api methods    
    app.post('/jwt', async (req, res) => {
      try {
        const user = req.body;
        if (!user || !user.email) {
          return res.status(400).send({ error: 'Invalid user data' });
        }

        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: '2h'
        });

        res.send({ token });
      } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });


    // middleware 
    const verifyToken = (req, res, next) => {
        console.log('inside verifyToken', req.headers.authorization);
        if (!req.headers.authorization) {
            return res.status(401).send({ error: 'No token provided' });
        }
        const token = req.headers.authorization.split(' ')[1];
        // if(!token){
        //     return res.status(401).send({ error: 'No token provided' });
        // }

        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).send({ error: 'Invalid token' });
            }
            req.decoded = decoded;
            next();
        })
    }

    // save survey data 
    app.post('/survey', async (req, res) => {
      const data = req.body;
      const result = await surveyCollection.insertOne(data);
      res.send(result);

    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Welcome...');
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
})