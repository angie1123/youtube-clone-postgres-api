



const express = require("express");

//to load environment variable from .env file into process.env
require("dotenv").config();

const { Pool } = require("pg");
const { DATABASE_URL } = process.env;

const app = express();
module.exports = app
const cors = require("cors");
const path = require("path");
//This library allows you to interact with Firebase services from a backend environment (like a server), instead of just from client applications (like web or mobile apps).
const admin = require("firebase-admin");
const PORT = process.env.PORT || 3000;


app.use(express.json());


app.use(
  cors({
    origin: "http://localhost:3000", // Replace with your frontend's URL
    methods: "GET,POST,PUT,DELETE",
    credentials: true, // Allow cookies if needed
  }),
);


//express.json() is a built in middleware function in express that parses incoming request with JSON payloads
//json payload is the data pass from the request

/*Middleware (express.json()) Converts JSON to a JavaScript Object:

1. The Client Sends JSON Data:
When a client (like a browser or mobile app) sends data to a server, it sends the data in the body of the HTTP request as a JSON string. For example, the client might send:

json
Copy code
{
  "name": "John",
  "age": 30,
  "email": "john@example.com"
}

2. The Request Reaches the Server:
The server receives the HTTP request with the JSON string in the body.

Example HTTP Request:
http
Copy code
POST /users HTTP/1.1
Content-Type: application/json
Host: example.com

{
  "name": "John",
  "age": 30,
  "email": "john@example.com"
}

3.3. Middleware (express.json()) Converts JSON to a JavaScript Object:

If the client sends { "name": "John", "age": 30 }, then req.body will be the JavaScript object:
js
Copy code
{
  name: "John",
  age: 30
}
*/


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
app.options("*", cors());


const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    require: true,
  },
});

app.post("/saveUser", async (req, res) => {
  const client = await pool.connect();
  const { userUID, email } = req.body;
  console.log(req.body);
  try {
    const userExist = await client.query(
      "SELECT * from users WHERE firebase_uid=$1",
      [userUID],
    );
    console.log("76", userExist);
    if (userExist.rows.length === 0) {
      const result = await client.query(
        "INSERT INTO users(firebase_uid,email) VALUES($1,$2) RETURNING *",
        [userUID, email],
      );
      res.status(200).json({ user: result.rows[0] });
    } else {
      res.status(409).json({ message: "User already exists" });
    }
  } catch (error) {
    res.status(500).send("Server Error");
  } finally {
    client.release();
  }
});

app.post("/addVideo/:videoId", async (req, res) => {
  const client = await pool.connect();
  const { videoId } = req.params;
  const { videoTitle } = req.body;

  console.log(req.body);
  console.log(req.params);

  try {
    const videoExists = await client.query(
      "SELECT * FROM videos WHERE videoId=$1",
      [videoId],
    );
    console.log("110", videoExists);

    if (videoExists.rows.length === 0) {
      const result = await client.query(
        "INSERT INTO videos (videoId,title) VALUES($1,$2) RETURNING *",
        [videoId, videoTitle],
      );
      res.status(200).json({
        messages: "video successfully added",
        video: result.rows[0],
      });
    }
    return res.status(403).json({ messages: "Video already exists" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messages: error });
  } finally {
    client.release();
  }
});

app.post("/comment", async (req, res) => {
  const client = await pool.connect();
  // const {token,videoId,comment}=req.body

  const { comment, videoId, userUID } = req.body;

  try {
    if (!comment || !videoId || !userUID) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    /* verifyIdToken()
    It is a function provided by the admin.auth() service in the   Firebase Admin SDK.
    It decodes and verifies a Firebase ID token (JWT) sent by the client (e.g., a mobile app or frontend web app) to ensure the token is valid and issued by Firebase.
    This is typically used in server-side code to authenticate users in a secure manner before granting access to server resources.
    */
    // const decodedToken=await admin.auth().verifyIdToken(token)
    // const uid=decodedToken.uid

    //users collection ,uid doc
    const userRef = admin.firestore().collection("users").doc(userUID);
    console.log("139", userRef);
    //fetch the dcument's data
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User not found" });
    }
    //access data in the document
    const userData = userDoc.data();
    const username = userData.username;
    //get the photo from postgres users
    // const userProfileImg=await client.query("SELECT firebase_uid from users     WHERE firebase_uid=$1 RETURNING firebase_profileImg",[uid])

    //check whether is exist in postgres users
    const userExist = await client.query(
      "SELECT * from users WHERE firebase_uid=$1",
      [userUID],
    );
    if (userExist.rows.length > 0) {
      //insert into comments
      const response = await client.query(
        "INSERT INTO comments(user_uid,username,comment,video_id) VALUES($1,$2,$3,$4) RETURNING *",
        [userUID, username, comment, videoId],
      );
      console.log("163", response);
      res.status(200).json(response.rows[0]);
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

//fetch comment for each video
app.get("/comments/:videoId", async (req, res) => {
  const client = await pool.connect();
  const { videoId } = req.params;
  try {
    const commentExist = await client.query(
      "SELECT * from comments WHERE video_id=$1",
      [videoId],
    );
    console.log("185", commentExist);

    if (!commentExist.rows.length) {
      return res.status(404).json({ message: "No postgre comment found" });
    } else {
      return res.status(200).json(commentExist.rows);
    }
  } catch (error) {
    console.error("Error fetching comment", error);
    res.status(500).json(error);
  } finally {
    client.release();
  }
});

//update comment
app.put("/comment/:videoId/:commentId", async (req, res) => {
  const client = await pool.connect();
  const { videoId, commentId } = req.params;
  const { updatedComment, userUID } = req.body;

  try {
    const commentExists = await client.query(
      "SELECT * from comments WHERE video_id=$1 AND id=$2",
      [videoId, commentId],
    );

    if (commentExists) {
      const updateComment = await client.query(
        "UPDATE comments SET comment=$1 WHERE user_uid=$2 AND video_id=$3 AND id=$4 RETURNING *",
        [updatedComment, userUID, videoId, commentId],
      );
      res.status(200).json(updateComment);
    }
  } catch (error) {
    res.status(500).json(error);
  } finally {
    client.release();
  }
});

app.delete("/comment/:videoId/:commentId", async (req, res) => {
  const client = await pool.connect();
  const { videoId, commentId } = req.params;
  const { userUID } = req.body;
  console.log("line 225", videoId, commentId, userUID);
  try {
    if (!userUID || !videoId || !commentId) {
      console.log({ message: "Missing required fields" });
      return res.status(400).json({ message: "Missing required fields" });
    }
    const deleteComment = await client.query(
      "DELETE FROM comments WHERE video_id=$1 AND id=$2 AND user_uid=$3 RETURNING *",
      [videoId, commentId, userUID],
    );
    console.log("264", deleteComment);
    res.status(200).json(deleteComment);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  } finally {
    client.release();
  }
});

app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname,'index.html'));
});

app.listen(PORT, () => {
console.log(`🚀 Server running at http://localhost:${PORT}`);
});
