const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  try {
    const token = req?.headers?.token;
    console.log("from headers", token);
    if (!token) {
      return res?.status(401)?.send({ message: "forbidden access" });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "forbidden access" });
      } else {
        req.decoded = decoded;
        next();
      }
    });
  } catch (error) {
    console.log(error);
  }
};
// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mf3nl9y.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // >>>>>>collections<<<<<<<<<<
    const database = client.db("commerceDB");
    const userCollection = database.collection("users");
    const productCollection = database.collection("products");
    const cartCollection = database.collection("carts");
    // >>>>>>collections<<<<<<<<<<

    // >>>>>>role verification<<<<<<<<<<
    const verifySeller = async (req, res, next) => {
      try {
        const email = req?.decoded?.email;
        const filter = { email: email };
        const user = await userCollection.findOne(filter);
        if (user?.role !== "seller") {
          return res.status(403).send({ message: "unauthorized access" });
        }
        next();
      } catch (error) {
        console.log(error);
      }
    };
    // >>>>>>role verification<<<<<<<<<<

    //  >>>>>>>>>>>>>>>>>>>>>>JWT related api<<<<<<<<<<<<<<
    app.post("/jwt", async (req, res) => {
      try {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "24h",
        });
        res.send({ token });
      } catch (error) {
        console.log(error);
      }
    });
    //  >>>>>>>>>>>>>>>>>>>>>>JWT related api<<<<<<<<<<<<<<

    //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<
    app.post("/users", async (req, res) => {
      try {
        const userInfo = req?.body;
        const email = userInfo?.email;
        const filter = { email: email };
        const isExist = await userCollection.findOne(filter);
        if (isExist) {
          return res.send({
            message: "user is already exist",
            insertedId: null,
          });
        }
        const result = await userCollection.insertOne(userInfo);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/userRole/:email", async (req, res) => {
      try {
        const email = req?.params?.email;
        const filter = { email: email };
        const user = await userCollection.findOne(filter);
        const role = user?.role;
        res.send({ role });
      } catch (error) {
        console.log(error);
      }
    });
    //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<

    //  >>>>>>>>>>>>>>>>>>>>>>product related api<<<<<<<<<<<<<<
    app.post("/products", verifyToken, verifySeller, async (req, res) => {
      try {
        const product = req?.body;
        const email = req?.body?.ownerEmail;
        const decodedEmail = req?.decoded?.email;
        if (email !== decodedEmail) {
          return res.status(401).send({ message: "forbidden access" });
        }

        const result = await productCollection.insertOne(product);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/productCount", async (req, res) => {
      try {
        const productCount = await productCollection.estimatedDocumentCount();
        res?.send({ productCount });
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/products", async (req, res) => {
      try {
        const searchText = req?.query?.searchText;
        const page = Number.parseFloat(req?.query?.page) || 1;
        const size = Number.parseFloat(req?.query?.size) || 10;
        const skip = (page - 1) * size;

        if (searchText) {
          const query = {
            $or: [
              { name: { $regex: searchText, $options: "i" } },
              { ownerName: { $regex: searchText, $options: "i" } },
            ],
          };
          const result =
            (await productCollection
              .find(query)
              .skip(skip)
              .limit(size)
              .toArray()) || [];
          return res.send(result);
        }

        let cursor = productCollection.find();
        const result = (await cursor.skip(skip).limit(size).toArray()) || [];
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/singleProduct/:id", async (req, res) => {
      try {
        const id = req?.params?.id;
        const filter = { _id: new ObjectId(id) };
        const result = await productCollection.findOne(filter);
        res?.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    // like functionality
    app.put("/like/:id", verifyToken, async (req, res) => {
      try {
        const id = req?.params?.id;
        const email = req?.query?.email;
        console.log(email);
        const filter = { _id: new ObjectId(id) };
        const product = await productCollection.findOne(filter);

        // const isExist = product?.likes.find((email) => email);
        // if (!isExist) {
        // }
        product?.likes.push(email);
        const updateDoc = {
          $set: {
            ...product,
          },
        };
        const result = await productCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });
    app.put("/disLike/:id", verifyToken, async (req, res) => {
      try {
        const id = req?.params?.id;
        const email = req?.query?.email;
        const filter = { _id: new ObjectId(id) };
        const product = await productCollection.findOne(filter);

        const newLikes = product?.likes?.filter(
          (likedEmail) => likedEmail !== email
        );
        product?.likes.splice(0, product?.likes.length, ...newLikes);

        const updateDoc = {
          $set: {
            ...product,
          },
        };
        const result = await productCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    // comment functionality
    app.put("/comment/:id", verifyToken, async (req, res) => {
      try {
        const id = req?.params?.id;
        const comment = req?.body;
        const filter = { _id: new ObjectId(id) };
        const product = await productCollection.findOne(filter);
        product?.comments.push(comment);
        // console.log(comment, product);
        const updateDoc = {
          $set: {
            ...product,
          },
        };
        const result = await productCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.delete("/deleteComments/:id", verifyToken, async (req, res) => {
      try {
        const id = req?.params?.id;
        const email = req?.query?.email;

        if (req?.decoded?.email !== email) {
          return res?.status(401)?.send({ message: "forbidden access" });
        }

        const filter = { _id: new ObjectId(id) };
        const product = await productCollection.findOne(filter);

        const newComment = product?.comments?.filter(
          (user) => user?.email !== email
        );
        product?.comments.splice(0, product?.comments?.length, ...newComment);
        const updateDoc = {
          $set: {
            ...product,
          },
        };
        const result = await productCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });
    //  >>>>>>>>>>>>>>>>>>>>>>product related api<<<<<<<<<<<<<<

    //  >>>>>>>>>>>>>>>>>>>>>>cart related api<<<<<<<<<<<<<<
    app.put("/addTocart", verifyToken, async (req, res) => {
      try {
        const cartProduct = req?.body;
        const result = await cartCollection.insertOne(cartProduct);

        // // update quantity after sell
        const id = req?.body?.productId;
        const filter = { _id: new ObjectId(id) };
        const product = await productCollection.findOne(filter);
        const updateDoc = {
          $set: {
            quantity: product?.quantity - 1,
          },
        };
        await productCollection.updateOne(filter, updateDoc);

        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/cartnumber", verifyToken, async (req, res) => {
      try {
        const email = req?.query?.email;
        const filter = { email: email };
        const cartCount = await cartCollection.find(filter).toArray();
        res?.send({ cartCount: cartCount?.length });
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/myCart/:email", verifyToken, async (req, res) => {
      try {
        const email = req?.params?.email;
        const filter = { email: email };
        const result = await cartCollection.find(filter).toArray();
        res?.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.delete("/removeCart", verifyToken, async (req, res) => {
      try {
        const cartId = req?.query?.cartId;
        const productId = req?.query?.productId;

        const cartFilter = { _id: new ObjectId(cartId) };
        const result = await cartCollection.deleteOne(cartFilter);

        const prodFilter = { _id: new ObjectId(productId) };
        const product = await productCollection.findOne(prodFilter);
        const updateDoc = {
          $set: {
            quantity: product?.quantity + 1,
          },
        };
        await productCollection.updateOne(prodFilter, updateDoc);

        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });
    //  >>>>>>>>>>>>>>>>>>>>>>cart related api<<<<<<<<<<<<<<

    // >>>>>>>>>>>>>>>>PAYMENT INTENT<<<<<<<<<<<<<<<<<<
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req?.body;
        const amount = parseInt(price * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,

          // don't forget to add it
          payment_method_types: ["card"],

          currency: "usd",
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.log(error);
      }
    });
    // >>>>>>>>>>>>>>>>PAYMENT INTENT<<<<<<<<<<<<<<<<<<

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  try {
    res.send("Commerce book server running!");
  } catch (error) {
    console.log(error);
  }
});

app.listen(port, () => {
  console.log(`Commerce book app listening on port ${port}`);
});
