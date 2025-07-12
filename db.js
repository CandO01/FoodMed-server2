import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

let db

export async function connectToDB() {
  const client = new MongoClient(process.env.MONGO_URI)
  await client.connect()
  db = client.db() // Uses default DB from connection string
  console.log('✅ MongoDB connected')
}

export function getDB() {
  if (!db) throw new Error('❌ DB not connected')
  return db
}
