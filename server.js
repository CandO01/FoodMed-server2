// //LATEST VERSION OF THE SERVER
// // Updated FoodMed Server with Donor Notification System and Pagination
// import http from 'node:http'
// import path from 'node:path'
// import fs from 'node:fs'
// import { fileURLToPath } from 'url'
// import { v4 as uuidv4 } from 'uuid'
// import nodemailer from 'nodemailer'
// import twilio from 'twilio'

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// const PORT = 3000
// const uploadDir = path.join(__dirname, 'uploads')
// const submissionsFile = path.join(uploadDir, 'submissions.json')
// const requestsFile = path.join(uploadDir, 'requests.json')

// const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
// const twilioFrom = process.env.TWILIO_PHONE

// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL,
//     pass: process.env.EMAIL_PASS
//   }
// })

// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)
// if (!fs.existsSync(submissionsFile)) fs.writeFileSync(submissionsFile, JSON.stringify([]))
// if (!fs.existsSync(requestsFile)) fs.writeFileSync(requestsFile, JSON.stringify([]))

// function parseJSONBody(req, callback) {
//   let body = ''
//   req.on('data', chunk => body += chunk)
//   req.on('end', () => {
//     try {
//       const parsed = JSON.parse(body)
//       callback(null, parsed)
//     } catch (err) {
//       callback(err)
//     }
//   })
// }

// function parseMultipart(req, callback) {
//   const boundary = req.headers['content-type'].split('boundary=')[1]
//   const buffers = []
//   req.on('data', chunk => buffers.push(chunk))
//   req.on('end', () => {
//     const rawData = Buffer.concat(buffers).toString('latin1')
//     const parts = rawData.split(`--${boundary}`)
//     const fields = {}
//     let imagePath = null

//     for (const part of parts) {
//       if (!part.includes('Content-Disposition')) continue

//       const nameMatch = part.match(/name="([^"]+)"/)
//       const name = nameMatch?.[1]
//       const filenameMatch = part.match(/filename="([^"]+)"/)
//       const contentTypeMatch = part.match(/Content-Type: (.+)/)

//       const start = part.indexOf('\r\n\r\n')
//       const rawBody = part.slice(start + 4, part.lastIndexOf('\r\n'))

//       if (filenameMatch && contentTypeMatch && name === 'image') {
//         const rawFilename = filenameMatch[1]
//         const extension = path.extname(rawFilename)
//         const baseName = path.basename(rawFilename, extension)
//           .replace(/\s+/g, '-')        // replace spaces with dashes
//           .replace(/[^\w\-]/g, '')     // remove non-word chars

//         const uniqueName = `${uuidv4()}-${baseName}${extension}`
//         const filePath = path.join(uploadDir, uniqueName)
//         fs.writeFileSync(filePath, Buffer.from(rawBody, 'latin1'))
//         imagePath = `/uploads/${uniqueName}`
//         console.log(`✅ Uploaded image: ${imagePath}`)
//       } else if (name) {
//         fields[name] = rawBody.trim()
//       }
//     }
//     console.log('Saving image to:', filePath);

//     callback(fields, imagePath)
//   })
// }

// const server = http.createServer((req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
//   res.setHeader('Content-Type', 'application/json')

//   if (req.method === 'OPTIONS') return res.writeHead(204).end()

//   if (req.method === 'POST' && req.url === '/submit') {
//     if (req.headers['content-type']?.includes('multipart/form-data')) {
//       parseMultipart(req, (fields, imagePath) => {
//         let data = []
//         try { data = JSON.parse(fs.readFileSync(submissionsFile)) } catch {}
//         const newEntry = {
//           id: uuidv4(),
//           ...fields,
//           imageUrl: imagePath,
//           uploadedAt: new Date(),
//           uploadedBy: fields.email,
//           expiryDate: fields.expiryDate || null
//         }
//         data.push(newEntry)
//         fs.writeFileSync(submissionsFile, JSON.stringify(data, null, 2))

//         io.emit('newSubmission', newEntry)

//         res.writeHead(201)
//         res.end(JSON.stringify({ message: 'Saved', data: newEntry }))
//       })
//     } else {
//       res.writeHead(400).end('Invalid content type')
//     }

//   } else if (req.method === 'GET' && req.url.startsWith('/submissions')) {
//     const url = new URL(req.url, `http://${req.headers.host}`)
//     const page = parseInt(url.searchParams.get('page')) || 1
//     const limit = parseInt(url.searchParams.get('limit')) || 10
//     const startIndex = (page - 1) * limit
//     const endIndex = page * limit

//     let data = JSON.parse(fs.readFileSync(submissionsFile))
//     const now = new Date()
//     const validSubmissions = data.filter(item => !item.expiryDate || new Date(item.expiryDate) > now)

//     const paginated = validSubmissions.slice(startIndex, endIndex)
//     res.writeHead(200).end(JSON.stringify(paginated))

//   } else if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
//     const imageName = req.url.split('/uploads/')[1]
//     const filePath = path.join(uploadDir, path.basename(imageName))
//     fs.readFile(filePath, (err, content) => {
//       if (err) return res.writeHead(404).end(JSON.stringify({ error: 'Image not found' }))
//       const ext = path.extname(filePath).toLowerCase()
//       const contentTypeMap = {
//         '.jpg': 'image/jpeg',
//         '.jpeg': 'image/jpeg',
//         '.png': 'image/png',
//         '.gif': 'image/gif',
//         '.webp': 'image/webp'
//       }
//       res.writeHead(200, { 'Content-Type': contentTypeMap[ext] || 'application/octet-stream' })
//       res.end(content)
//     })

//   } else if (req.method === 'POST' && req.url === '/request') {
//     parseJSONBody(req, (err, body) => {
//       if (err) return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }))

//       const allFoods = JSON.parse(fs.readFileSync(submissionsFile))
//       const targetFood = allFoods.find(item => item.id === body.itemId)
//       if (!targetFood) return res.writeHead(404).end(JSON.stringify({ error: 'Food not found' }))

//       const data = JSON.parse(fs.readFileSync(requestsFile))
//       const newRequest = {
//         id: uuidv4(),
//         ...body,
//         foodName: targetFood.foodName,
//         donorEmail: targetFood.uploadedBy,
//         status: 'pending',
//         createdAt: new Date().toISOString()
//       }
//       data.push(newRequest)
//       fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))

//       transporter.sendMail({
//         from: process.env.EMAIL,
//         to: targetFood.uploadedBy,
//         subject: 'Someone requested your food!',
//         text: `Someone just requested for your food item: ${targetFood.foodName}. Please log in to confirm.`
//       }, (err) => {
//         if (err) console.error('Email error to donor:', err)
//       })

//       io.emit('newRequest', newRequest)

//       res.writeHead(201).end(JSON.stringify({ message: 'Request submitted', data: newRequest }))
//     })

//   } else if (req.method === 'GET' && req.url.startsWith('/requests')) {
//     const url = new URL(req.url, `http://${req.headers.host}`)
//     const donorEmail = url.searchParams.get('email')
//     const allRequests = JSON.parse(fs.readFileSync(requestsFile))
//     const filtered = donorEmail ? allRequests.filter(r => r.donorEmail === donorEmail) : allRequests
//     res.writeHead(200).end(JSON.stringify(filtered))

//   } else if (req.method === 'PATCH' && req.url.startsWith('/request/update/')) {
//     const requestId = req.url.split('/').pop()
//     parseJSONBody(req, (err, body) => {
//       if (err) return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }))

//       let data = JSON.parse(fs.readFileSync(requestsFile))
//       const index = data.findIndex(r => r.id === requestId)
//       if (index === -1) return res.writeHead(404).end(JSON.stringify({ error: 'Request not found' }))

//       data[index].status = body.status || 'confirmed'
//       data[index].confirmedAt = new Date().toISOString()
//       data[index].confirmationDetails = {
//         date: body.date,
//         time: body.time,
//         location: body.location
//       }

//       fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))

//       transporter.sendMail({
//         from: process.env.EMAIL,
//         to: data[index].email,
//         subject: `✅ Your food request has been ${data[index].status}`,
//         text: `Your request for ${data[index].foodName} has been ${data[index].status}. ${body.date ? `Pickup: ${body.date}, ${body.time} at ${body.location}` : ''}`
//       }, err => {
//         if (err) console.error('User email error:', err)
//       })

//       if (data[index].phone) {
//         twilioClient.messages.create({
//           body: `FoodMed: Your request for ${data[index].foodName} is ${data[index].status}.`,
//           from: twilioFrom,
//           to: data[index].phone
//         }).catch(err => console.error('SMS error:', err))
//       }

//       res.writeHead(200).end(JSON.stringify({ message: 'Request updated' }))
//     })

//   } else {
//     res.writeHead(404).end(JSON.stringify({ error: 'Not Found' }))
//   }
// })

// server.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`)
// })














// 🚀 COMPLETE SERVER WITH PATCH + EMAIL + SMS NOTIFICATION
// server.js
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import nodemailer from 'nodemailer'
import twilio from 'twilio'
import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'foodmed',
        public_id: `${uuidv4()}-${filename}`
      },
      (err, result) => {
        if (err) return reject(err)
        resolve(result.secure_url)
      }
    )
    stream.end(buffer)
  })
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 3000
const uploadDir = path.join(__dirname, 'uploads')
const submissionsFile = path.join(uploadDir, 'submissions.json')
const requestsFile = path.join(uploadDir, 'requests.json')

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)
const twilioFrom = process.env.TWILIO_PHONE

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS
  }
})

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)
if (!fs.existsSync(submissionsFile)) fs.writeFileSync(submissionsFile, JSON.stringify([]))
if (!fs.existsSync(requestsFile)) fs.writeFileSync(requestsFile, JSON.stringify([]))

function parseJSONBody(req, callback) {
  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body)
      callback(null, parsed)
    } catch (err) {
      callback(err)
    }
  })
}

function parseMultipart(req, callback) {
  const boundary = req.headers['content-type'].split('boundary=')[1]
  const buffers = []
  req.on('data', chunk => buffers.push(chunk))
  req.on('end', async () => {
    const rawData = Buffer.concat(buffers).toString('latin1')
    const parts = rawData.split(`--${boundary}`)
    const fields = {}
    let imagePath = null
    for (const part of parts) {
      if (!part.includes('Content-Disposition')) continue
      const nameMatch = part.match(/name="([^"]+)"/)
      const name = nameMatch?.[1]
      const filenameMatch = part.match(/filename="([^"]+)"/)
      const contentTypeMatch = part.match(/Content-Type: (.+)/)
      const start = part.indexOf('\r\n\r\n')
      const rawBody = part.slice(start + 4, part.lastIndexOf('\r\n'))
      if (filenameMatch && contentTypeMatch && name === 'image') {
        const filename = filenameMatch[1]
        const buffer = Buffer.from(rawBody, 'latin1')
        try {
          const cloudUrl = await uploadToCloudinary(buffer, filename)
          imagePath = cloudUrl
        } catch (err) {
          console.error('Cloudinary upload error:', err)
        }
      } else if (name) {
        fields[name] = rawBody.trim()
      }
    }
    callback(fields, imagePath)
  })
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (req.method === 'POST' && req.url === '/submit') {
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      parseMultipart(req, (fields, imagePath) => {
        let data = []
        try {
          data = JSON.parse(fs.readFileSync(submissionsFile))
        } catch {}
        const newEntry = { id: Date.now(), ...fields, imageUrl: imagePath }
        data.push(newEntry)
        fs.writeFileSync(submissionsFile, JSON.stringify(data, null, 2))
        res.writeHead(201)
        res.end(JSON.stringify({ message: 'Saved', data: newEntry }))
      })
    } else {
      res.writeHead(400)
      res.end('Invalid content type')
    }

  } else if (req.method === 'GET' && req.url === '/submissions') {
    const data = fs.readFileSync(submissionsFile)
    res.writeHead(200)
    res.end(data)

  } else if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
    const imageName = req.url.split('/uploads/')[1]
    const filePath = path.join(uploadDir, path.basename(imageName))
    fs.readFile(filePath, (err, content) => {
      if (err) return res.writeHead(404).end(JSON.stringify({ error: 'Image not found' }))
      const ext = path.extname(filePath).toLowerCase()
      const contentTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      }
      res.writeHead(200, { 'Content-Type': contentTypeMap[ext] || 'application/octet-stream' })
      res.end(content)
    })

  } else if (req.method === 'POST' && req.url === '/request') {
    parseJSONBody(req, (err, body) => {
      if (err) return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }))
      const data = JSON.parse(fs.readFileSync(requestsFile))
      const newRequest = {
        id: uuidv4(),
        ...body,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
      data.push(newRequest)
      fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
      res.writeHead(201)
      res.end(JSON.stringify({ message: 'Request received', data: newRequest }))
    })

  } else if (req.method === 'GET' && req.url === '/requests') {
    const data = fs.readFileSync(requestsFile)
    res.writeHead(200)
    res.end(data)

  } else if (req.method === 'PATCH' && req.url.startsWith('/request/update/')) {
    const requestId = req.url.split('/').pop()
    parseJSONBody(req, async (err, body) => {
      if (err) return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }))
      let data = JSON.parse(fs.readFileSync(requestsFile))
      const index = data.findIndex(r => r.id === requestId)
      if (index === -1) return res.writeHead(404).end(JSON.stringify({ error: 'Request not found' }))
      data[index].status = 'confirmed'
      data[index].confirmedAt = new Date().toISOString()
      data[index].confirmationDetails = {
        date: body.date,
        time: body.time,
        location: body.location
      }
      fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
      transporter.sendMail({
        from: process.env.EMAIL,
        to: data[index].email,
        subject: '✅ Your Food Request is Confirmed!',
        text: `Hello, your request for ${data[index].foodName} has been confirmed for ${body.date} at ${body.time} in ${body.location}. This message is from FoodMed.`
      }, (err, info) => {
        if (err) console.error('✉️ Email error:', err)
        else console.log('✉️ Email sent:', info.response)
      })
      if (data[index].phone) {
        twilioClient.messages.create({
          body: `FoodMed: Your request for ${data[index].foodName} is confirmed for ${body.date}, ${body.time} at ${body.location}.`,
          from: twilioFrom,
          to: data[index].phone
        }).then(msg => console.log('📱 SMS sent:', msg.sid))
          .catch(err => console.error('📱 SMS error:', err))
      }
      res.writeHead(200)
      res.end(JSON.stringify({ message: 'Request confirmed and user notified' }))
    })

  } else if (req.method === 'DELETE' && req.url.startsWith('/request/delete/')) {
    const requestId = req.url.split('/').pop()
    let data = JSON.parse(fs.readFileSync(requestsFile, 'utf-8'))
    const index = data.findIndex(req => req.id === requestId)
    if (index === -1) return res.writeHead(404).end(JSON.stringify({ error: 'Request not found' }))
    data.splice(index, 1)
    fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
    res.writeHead(200)
    res.end(JSON.stringify({ message: 'Request deleted successfully' }))

  } else {
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Not Found' }))
  }
})

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
})
























// import http from 'node:http'
// import path from 'node:path'
// import fs from 'node:fs'
// import { fileURLToPath } from 'url'
// import { v4 as uuidv4 } from 'uuid'
// import nodemailer from 'nodemailer'
// import twilio from 'twilio'
// import dotenv from 'dotenv'

// dotenv.config()

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// const PORT = 3000
// const uploadDir = path.join(__dirname, 'uploads')
// const submissionsFile = path.join(uploadDir, 'submissions.json')
// const requestsFile = path.join(uploadDir, 'requests.json')

// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// )
// const twilioFrom = process.env.TWILIO_PHONE

// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL,
//     pass: process.env.EMAIL_PASS
//   }
// })

// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)
// if (!fs.existsSync(submissionsFile)) fs.writeFileSync(submissionsFile, JSON.stringify([]))
// if (!fs.existsSync(requestsFile)) fs.writeFileSync(requestsFile, JSON.stringify([]))

// function parseJSONBody(req, callback) {
//   let body = ''
//   req.on('data', chunk => body += chunk)
//   req.on('end', () => {
//     try {
//       const parsed = JSON.parse(body)
//       callback(null, parsed)
//     } catch (err) {
//       callback(err)
//     }
//   })
// }

// function parseMultipart(req, callback) {
//   const boundary = req.headers['content-type'].split('boundary=')[1]
//   const buffers = []
//   req.on('data', chunk => buffers.push(chunk))
//   req.on('end', () => {
//     const rawData = Buffer.concat(buffers).toString('latin1')
//     const parts = rawData.split(`--${boundary}`)
//     const fields = {}
//     let imagePath = null
//     for (const part of parts) {
//       if (!part.includes('Content-Disposition')) continue
//       const nameMatch = part.match(/name="([^"]+)"/)
//       const name = nameMatch?.[1]
//       const filenameMatch = part.match(/filename="([^"]+)"/)
//       const contentTypeMatch = part.match(/Content-Type: (.+)/)
//       const start = part.indexOf('\r\n\r\n')
//       const rawBody = part.slice(start + 4, part.lastIndexOf('\r\n'))
//       if (filenameMatch && contentTypeMatch && name === 'image') {
//         const filename = filenameMatch[1]
//         const buffer = Buffer.from(rawBody, 'latin1')
//         const uniqueName = `${uuidv4()}-${filename}`
//         const filePath = path.join(uploadDir, uniqueName)
//         fs.writeFileSync(filePath, buffer)
//         imagePath = `/uploads/${uniqueName}`
//       } else if (name) {
//         fields[name] = rawBody.trim()
//       }
//     }
//     callback(fields, imagePath)
//   })
// }

// const server = http.createServer((req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
//   res.setHeader('Content-Type', 'application/json')

//   if (req.method === 'OPTIONS') {
//     res.writeHead(204)
//     return res.end()
//   }

//   if (req.method === 'POST' && req.url === '/submit') {
//     if (req.headers['content-type']?.includes('multipart/form-data')) {
//       parseMultipart(req, (fields, imagePath) => {
//         let data = []
//         try {
//           data = JSON.parse(fs.readFileSync(submissionsFile))
//         } catch {}
//         const newEntry = { id: Date.now(), ...fields, imageUrl: imagePath }
//         data.push(newEntry)
//         fs.writeFileSync(submissionsFile, JSON.stringify(data, null, 2))
//         res.writeHead(201)
//         res.end(JSON.stringify({ message: 'Saved', data: newEntry }))
//       })
//     } else {
//       res.writeHead(400)
//       res.end('Invalid content type')
//     }

//   } else if (req.method === 'GET' && req.url === '/submissions') {
//     const data = fs.readFileSync(submissionsFile)
//     res.writeHead(200)
//     res.end(data)

//   } else if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
//     const imageName = req.url.split('/uploads/')[1]
//     const filePath = path.join(uploadDir, path.basename(imageName))
//     fs.readFile(filePath, (err, content) => {
//       if (err) return res.writeHead(404).end(JSON.stringify({ error: 'Image not found' }))
//       const ext = path.extname(filePath).toLowerCase()
//       const contentTypeMap = {
//         '.jpg': 'image/jpeg',
//         '.jpeg': 'image/jpeg',
//         '.png': 'image/png',
//         '.gif': 'image/gif',
//         '.webp': 'image/webp'
//       }
//       res.writeHead(200, { 'Content-Type': contentTypeMap[ext] || 'application/octet-stream' })
//       res.end(content)
//     })

//   } else if (req.method === 'POST' && req.url === '/request') {
//     parseJSONBody(req, (err, body) => {
//       if (err) return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }))
//       const data = JSON.parse(fs.readFileSync(requestsFile))
//       const newRequest = {
//         id: uuidv4(),
//         ...body,
//         status: 'pending',
//         createdAt: new Date().toISOString()
//       }
//       data.push(newRequest)
//       fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
//       res.writeHead(201)
//       res.end(JSON.stringify({ message: 'Request received', data: newRequest }))
//     })

//   } else if (req.method === 'GET' && req.url === '/requests') {
//     const data = fs.readFileSync(requestsFile)
//     res.writeHead(200)
//     res.end(data)

//   } else if (req.method === 'PATCH' && req.url.startsWith('/request/update/')) {
//     const requestId = req.url.split('/').pop()
//     parseJSONBody(req, async (err, body) => {
//       if (err) return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }))
//       let data = JSON.parse(fs.readFileSync(requestsFile))
//       const index = data.findIndex(r => r.id === requestId)
//       if (index === -1) return res.writeHead(404).end(JSON.stringify({ error: 'Request not found' }))
//       data[index].status = 'confirmed'
//       data[index].confirmedAt = new Date().toISOString()
//       data[index].confirmationDetails = {
//         date: body.date,
//         time: body.time,
//         location: body.location
//       }
//       fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
//       transporter.sendMail({
//         from: process.env.EMAIL,
//         to: data[index].email,
//         subject: '✅ Your Food Request is Confirmed!',
//         text: `Hello, your request for ${data[index].foodName} has been confirmed for ${body.date} at ${body.time} in ${body.location}. This message is from FoodMed.`
//       }, (err, info) => {
//         if (err) console.error('✉️ Email error:', err)
//         else console.log('✉️ Email sent:', info.response)
//       })
//       if (data[index].phone) {
//         twilioClient.messages.create({
//           body: `FoodMed: Your request for ${data[index].foodName} is confirmed for ${body.date}, ${body.time} at ${body.location}.`,
//           from: twilioFrom,
//           to: data[index].phone
//         }).then(msg => console.log('📱 SMS sent:', msg.sid))
//           .catch(err => console.error('📱 SMS error:', err))
//       }
//       res.writeHead(200)
//       res.end(JSON.stringify({ message: 'Request confirmed and user notified' }))
//     })

//   } else if (req.method === 'DELETE' && req.url.startsWith('/request/delete/')) {
//     const requestId = req.url.split('/').pop()
//     let data = JSON.parse(fs.readFileSync(requestsFile, 'utf-8'))
//     const index = data.findIndex(req => req.id === requestId)
//     if (index === -1) return res.writeHead(404).end(JSON.stringify({ error: 'Request not found' }))
//     data.splice(index, 1)
//     fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
//     res.writeHead(200)
//     res.end(JSON.stringify({ message: 'Request deleted successfully' }))

//   } else {
//     res.writeHead(404)
//     res.end(JSON.stringify({ error: 'Not Found' }))
//   }
// })

// server.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`)
// })






























