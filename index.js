const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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
    // await client.connect();
    const surveyCollection = client.db("surveyDb").collection("surveys");
    const usersCollection = client.db("surveyDb").collection("users");
    const reportsCollection = client.db("surveyDb").collection("reports");
    const votesCollection = client.db("surveyDb").collection("votes");
    const paymentCollection = client.db("surveyDb").collection("payment");

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

    // for payments
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })

    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result)

    })

    app.get('/payments/:email', async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })


    app.post('/payments', async (req, res) => {
      const payment = req.body;

      try {
        const paymentResult = await paymentCollection.insertOne(payment);
        console.log("Payment Info", payment);
        const userUpdateResult = await usersCollection.updateOne(
          { email: payment?.email },
          {
            $set: { role: 'pro-user' }
          }
        );

        res.send({ paymentResult, userUpdateResult });
      } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).send({ message: 'Internal server error' });
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
    // app.get('/surveys', async (req, res) => {
    //   try {
    //     const result = await surveyCollection.find().toArray();
    //     res.send(result);
    //   } catch (error) {
    //     console.error('Error fetching surveys:', error);
    //     res.status(500).send({ error: 'Internal Server Error' });
    //   }
    // });

    // Get all surveys data methods
    app.get('/surveys', async (req, res) => {
      let sortQuery = { voteCount: 1 };
      let sortQuery1 = { timestamp: 1 };
      const { sort } = req.query;
      if (sort === 'voteCount_DESC') {
        sortQuery = { voteCount: -1 };
      }
      if (sort === 'timestamp_DESC') {
        sortQuery = { timestamp: -1 };
      }

      try {
        const result = await surveyCollection.find({}).sort(sortQuery, sortQuery1).limit(6).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching top foods:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // email method on data get
    app.get('/surveys/:email', verifyToken, async (req, res) => {
      const userEmail = req.params.email
      const result = await surveyCollection.find({ 'surveyor.email': userEmail }).toArray();
      res.send(result);
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
      if (sort) sortOptions.voteCount = sort === 'asc' ? 1 : -1;

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

    // proUser 

    app.get('/users/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        res.status(403).send({ message: 'forbidden access access' })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      let User = false;
      if (user) {
        User = user?.role === "user"
      }
      res.send({ User })
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

    // use verify surveyor after verify token
    const verifyProUSer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const isProUSer = user?.role === 'pro-user';
      if (!isProUSer) {
        return res.status(403).send({ error: 'Invalid token' });
      }
      next();
    }

    // use verify user after verify token
    const verifyUSer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const isUser = user?.role === 'user';
      if (!isUser) {
        return res.status(403).send({ error: 'Invalid token' });
      }
      next();
    }



    app.put('/users',  async (req, res) => {
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

    app.patch('/users/role/:id',verifyToken, verifyAdmin, async (req, res) => {
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

    app.delete('/users/:id', verifyToken, verifySurveyor, async (req, res) => {
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


    // Save user or proUser reports data
    app.post('/reports', async (req, res) => {
      try {
        const data = req.body;
        const result = await reportsCollection.insertOne(data);
        res.send(result);
      } catch (error) {
        console.error('Error saving survey:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // for vote methods
    app.get('/reports', async (req, res) => {
      const result = await reportsCollection.find().toArray();
      res.send(result);
    });

    // email method on data get
    app.get('/reported/:email', verifyToken, async (req, res) => {
      const userEmails = req.params.email
      const result = await reportsCollection.find({ userEmail: userEmails }).toArray();
      res.send(result);
    });

    // for single vote data
    app.get('/report/:id', verifyToken, async (req, res) => {
      if (req.user.email) {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await reportsCollection.findOne(query);
        res.send(result);
      }
    });





    // for vote methods
    app.get('/votes', async (req, res) => {
      const result = await votesCollection.find().toArray();
      res.send(result);
    });

    // email method on data get
    app.get('/comments/:email', async (req, res) => {
      const userEmail = req.params.email
      const result = await votesCollection.find({ 'voter.voter_email': userEmail }).toArray();
      res.send(result);
    });

    // email method on data get
    app.get('/votes/:email', async (req, res) => {
      const surveyorEmail = req.params.email
      const result = await votesCollection.find({ 'surveyor.email': surveyorEmail }).toArray();
      res.send(result);
    });

    // for single vote data
    // app.get('/vote/:id', async (req, res) => {
    //   if (req.user.email) {
    //     const id = req.params.id;
    //     const query = { _id: new ObjectId(id) };
    //     const result = await votesCollection.findOne(query);
    //     res.send(result);
    //   }
    // });
    app.get('/vote/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await votesCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.error('Error fetching surveys:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });


    // for vote survey
    app.post('/votes', async (req, res) => {
      const voteSurvey = req.body;
      const voteId = voteSurvey.voteId;
      const result = await votesCollection.insertOne(voteSurvey);
      const updateDoc = {
        $inc: { voteCount: 1 },
      }
      const voteQuery = { _id: new ObjectId(voteId) }
      const updateVoteCount = await surveyCollection.updateOne(voteQuery, updateDoc)

      res.send(result);
    });


    // delete method
    app.delete('/survey/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollection.deleteOne(query);
      res.send(result);

    })

    app.put('/surveys/:id', async (req, res) => {
      const id = req.params.id;
      const survey = req.body;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const updateSurvey = {
        $set: {
          ...survey
        }
      }
      const result = await surveyCollection.updateOne(filter, updateSurvey, options);
      res.send(result);
    })

    // status change
    app.get('/allSurveys', async (req, res) => {
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });
    // update status 
    app.put('/surveys/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status, feedback } = req.body;
      try {
        await surveyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, feedback } }
        );
        res.status(200).send({ message: 'Survey status updated successfully' });
      } catch (error) {
        console.error('Failed to update survey status', error);
        res.status(500).send({ error: 'Failed to update survey status' });
      }
    });




    // Confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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
