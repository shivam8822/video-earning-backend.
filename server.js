const express = require('express');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let db;

app.get('/', (req, res) => {
  res.send('Backend is running ✅');
});

app.post('/api/offer/create', async (req, res) => {
  const userId = req.body.userId;
  const offerId = req.body.offerId || 'adsterra_demo_offer';
  const token = uuidv4();

  await db.collection('offers').insertOne({ token, userId, offerId, used: false, createdAt: new Date() });

  const callbackBase = encodeURIComponent('https://your-app.onrender.com/webhook/adnetwork');
  const redirectUrl = `https://adnetwork.example/offer?offer=${offerId}&cb=${callbackBase}&token=${token}`;

  res.json({ redirectUrl });
});

app.post('/webhook/adnetwork', async (req, res) => {
  const { token, status, networkTxId, offerId } = req.body;

  const rec = await db.collection('offers').findOne({ token });
  if (!rec) return res.status(400).send('Invalid token');
  if (rec.used) return res.send('Already processed');

  if (status === 'approved') {
    await db.collection('transactions').insertOne({
      userId: rec.userId,
      type: 'credit',
      amount: 1.0,
      reason: 'offer_click',
      meta: { networkTxId, offerId },
      status: 'confirmed',
      createdAt: new Date()
    });

    await db.collection('users').updateOne(
      { _id: rec.userId },
      { $inc: { wallet: 1.0, totalEarned: 1.0 } },
      { upsert: true }
    );

    await db.collection('offers').updateOne({ token }, { $set: { used: true, processedAt: new Date() } });
  }

  res.send('ok');
});

async function start() {
  await client.connect();
  db = client.db('mydb');
  app.listen(3000, () => console.log('Server running on port 3000 🚀'));
}
start();
