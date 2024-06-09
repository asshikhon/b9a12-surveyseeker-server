const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9ola8x0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const surveyCollection = client.db("surveyDb").collection("surveys");
    const usersCollection = client.db("surveyDb").collection("users");

    // JWT related API methods
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      if (!user || !user.email) {
        return res.status(400).send({ error: 'Invalid user data' });
      }

      try {
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: '2h',
        });
        res.send({ token });
      } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // Middleware to verify JWT token
    const verifyToken = (req, res, next) => {
      const authorizationHeader = req.headers.authorization;
      if (!authorizationHeader) {
        return res.status(401).send({ error: 'No token provided' });
      }
      const token = authorizationHeader.split(' ')[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ error: 'Invalid token' });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Get all surveys data methods
    app.get('/surveys', async (req, res) => {
      try {
        const result = await surveyCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching surveys:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });


    // get single survey data from db using _id
    app.get('/survey/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await surveyCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.error('Error fetching surveys:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });


    // Get all surveys data with pagination, sort, filter,reset, refresh and search 
    // app.get('/all-surveys', async (req, res) => {
    //   const size = parseInt(req.query.size);
    //   const page = parseInt(req.query.page) - 1;
    //   const filter = req.query.filter;
    //   const sort = req.query.sort;
    //   const search = req.query.search;

    //   let query = search ? { title: { $regex: search, $options: 'i' } } : {};
    //   if (filter) query.category = filter;

    //   let options = {};
    //   if (sort) options.sort = { deadline: sort === 'asc' ? 1 : -1 };

    //   try {
    //     const result = await surveyCollection
    //       .find(query, options)
    //       .skip(page * size)
    //       .limit(size)
    //       .toArray();
    //     res.send(result);
    //   } catch (error) {
    //     console.error('Error fetching surveys:', error);
    //     res.status(500).send({ error: 'Internal Server Error' });
    //   }
    // });

    app.get('/all-surveys', async (req, res) => {
      const size = parseInt(req.query.size) || 10;
      const page = parseInt(req.query.page) || 1; // Page 1-based indexing
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;

      // Build the query object
      let query = search ? { title: { $regex: search, $options: 'i' } } : {};
      if (filter) query.category = filter;

      // Build the sort options
      let sortOptions = {};
      if (sort) sortOptions.deadline = sort === 'asc' ? 1 : -1;

      try {
        // Fetch surveys and total count
        const [surveys, totalCount] = await Promise.all([
          surveyCollection.find(query).sort(sortOptions).skip((page - 1) * size).limit(size).toArray(),
          surveyCollection.countDocuments(query)
        ]);

        res.send({ surveys, totalCount });
      } catch (error) {
        console.error('Error fetching surveys:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });


    // Get all surveys data count from db
    app.get('/surveys-count', async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;

      // Build the query object
      let query = search ? { title: { $regex: search, $options: 'i' } } : {};
      if (filter) query.category = filter;

      try {
        const count = await surveyCollection.countDocuments(query);
        res.send({ count });
      } catch (error) {
        console.error('Error fetching survey count:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // for surveyor all functionality
    app.get('/users/surveyor/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        res.status(403).send({ message: 'forbidden access access' })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      let surveyor = false;
      if (user) {
        surveyor = user?.role === "surveyor"
      }
      res.send({ surveyor })
    });


    // proUser 

    app.get('/users/prouser/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        res.status(403).send({ message: 'forbidden access access' })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      let proUser = false;
      if (user) {
        proUser = user?.role === "pro-user"
      }
      res.send({ proUser })
    });


    // for admin all functionality
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        res.status(403).send({ message: 'forbidden access access' })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query)
      let admin = false;
      if (user) {
        admin = user?.role === "admin"
      }
      res.send({ admin })
    });

        // use verify admin after verify token
        const verifyAdmin = async (req, res, next) => {
          const email = req.decoded.email;
          const query = { email: email }
          const user = await usersCollection.findOne(query);
          const isAdmin = user?.role === 'admin';
          if (!isAdmin) {
              return res.status(403).send({ error: 'Invalid token' });
          }
          next();
      }

        // use verify surveyor after verify token
        const verifySurveyor = async (req, res, next) => {
          const email = req.decoded.email;
          const query = { email: email }
          const user = await usersCollection.findOne(query);
          const isSurveyor = user?.role === 'surveyor';
          if (!isSurveyor) {
              return res.status(403).send({ error: 'Invalid token' });
          }
          next();
      }



    app.put('/users', async (req, res) => {
      const user = req.body;

      const options = { upsert: true };
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null })
      }
      const updatedDoc = {
        $set: {
          ...user
        }
      }
      const result = await usersCollection.updateOne(query, updatedDoc, options);
      res.send(result);
    });


    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });


    // delete and patch

    app.patch('/users/role/:id', async (req, res) => {
      const id = req.params.id;
      const { role } = req.body; // Extract role from request body
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: role
        }
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });



    // Save survey data
    app.post('/surveys', async (req, res) => {
      try {
        const data = req.body;
        const result = await surveyCollection.insertOne(data);
        res.send(result);
      } catch (error) {
        console.error('Error saving survey:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // Confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error('Error during MongoDB connection or operation:', error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Welcome...');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
