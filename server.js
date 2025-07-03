//LATEST VERSION OF THE SERVER
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

dotenv.config()

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
  req.on('end', () => {
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
        const uniqueName = `${uuidv4()}-${filename}`
        const filePath = path.join(uploadDir, uniqueName)
        fs.writeFileSync(filePath, buffer)
        imagePath = `/uploads/${uniqueName}`
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































// //THIS IS MY NEW SERVER
// import http from 'node:http'
// import path from 'node:path'
// import fs from 'node:fs'
// import { fileURLToPath } from 'url'
// import { v4 as uuidv4 } from 'uuid'

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// const PORT = 3000
// const uploadDir = path.join(__dirname, 'uploads')
// const submissionsFile = path.join(uploadDir, 'submissions.json')
// const requestsFile = path.join(uploadDir, 'requests.json')

// // This is to check if directories and files exist
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
//         console.log('📷 Image saved at:', filePath)
//         console.log('📦 File size:', buffer.length, 'bytes')

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
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
//   res.setHeader('Content-Type', 'application/json')

//   if (req.method === 'OPTIONS') {
//     res.writeHead(204)
//     return res.end()
//   }

//   // POST /submit
//   if (req.method === 'POST' && req.url === '/submit') {
//     if (req.headers['content-type']?.includes('multipart/form-data')) {
//       parseMultipart(req, (fields, imagePath) => {
//         let data = []
//         try {
//           data = JSON.parse(fs.readFileSync(submissionsFile))
//         } catch (err) {
//           console.error('⚠️ Error parsing submissions:', err)
//         }

//         const newEntry = {
//           id: Date.now(),
//           ...fields,
//           imageUrl: imagePath
//         }

//         data.push(newEntry)
//         fs.writeFileSync(submissionsFile, JSON.stringify(data, null, 2))

//         res.writeHead(201)
//         res.end(JSON.stringify({ message: 'Saved', data: newEntry }))
//       })
//     } else {
//       res.writeHead(400)
//       res.end('Invalid content type')
//     }
//   } 
  
//    // GET /submissions
//   else if (req.method === 'GET' && req.url === '/submissions') {
//     const data = fs.readFileSync(submissionsFile)
//     res.writeHead(200)
//     res.end(data)
  
//   } 

//   // GET /uploads/:image
//   else if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
//     const imageName = req.url.split('/uploads/')[1]
//     const safeName = path.basename(imageName)
//     const filePath = path.join(uploadDir, safeName)

//     console.log('🧪 Fetching image:', filePath)

//     fs.readFile(filePath, (err, content) => {
//       if (err) {
//         console.error('❌ Image not found:', filePath)
//         res.writeHead(404)
//         return res.end(JSON.stringify({ error: 'Image not found' }))
//       }

//       const ext = path.extname(filePath).toLowerCase()
//       let contentType = 'application/octet-stream'
//       if (ext === '.jpg' || ext === '.jpeg' || ext === '.jfif') contentType = 'image/jpeg'
//       else if (ext === '.png') contentType = 'image/png'
//       else if (ext === '.gif') contentType = 'image/gif'
//       else if (ext === '.webp') contentType = 'image/webp'

//       res.writeHead(200, { 'Content-Type': contentType })
//       res.end(content)
//     })

//   // POST /request
//   } else if (req.method === 'POST' && req.url === '/request') {
//     parseJSONBody(req, (err, body) => {
//       if (err) {
//         res.writeHead(400)
//         return res.end(JSON.stringify({ error: 'Invalid JSON' }))
//       }

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

//   // GET /requests
//   } else if (req.method === 'GET' && req.url === '/requests') {
//     const data = fs.readFileSync(requestsFile)
//     res.writeHead(200)
//     res.end(data)

//   // POST /request/accept/:id
//   } else if (req.method === 'POST' && req.url.startsWith('/request/accept/')) {
//     const requestId = req.url.split('/').pop()
//     const data = JSON.parse(fs.readFileSync(requestsFile))

//     const index = data.findIndex(req => req.id === requestId)
//     if (index !== -1) {
//       data[index].status = 'accepted'
//       fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2))
//       res.writeHead(200)
//       res.end(JSON.stringify({ message: 'Request accepted' }))
//     } else {
//       res.writeHead(404)
//       res.end(JSON.stringify({ error: 'Request not found' }))
//     }

//   } else {
//     res.writeHead(404)
//     res.end(JSON.stringify({ error: 'Not Found' }))
//   }
// })

// server.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`)
// })
















// //THIS IS MY PREVIOUS SERVER

// // import http from 'node:http'
// // import path from 'node:path'
// // import fs from 'node:fs'
// // import { fileURLToPath } from 'url'
// // import { v4 as uuidv4 } from 'uuid'

// // // 🔁 Get __dirname in ES6
// // const __filename = fileURLToPath(import.meta.url)
// // const __dirname = path.dirname(__filename)

// // // 📁 Setup paths
// // const PORT = 3000
// // const uploadDir = path.join(__dirname, 'uploads')
// // const submissionsFile = path.join(uploadDir, 'submissions.json')

// // // ✅ Ensure upload directory and file exist
// // if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)
// // if (!fs.existsSync(submissionsFile)) fs.writeFileSync(submissionsFile, JSON.stringify([]))

// // // 🔍 Parse multipart/form-data manually
// // function parseMultipart(req, callback) {
// //   const boundary = req.headers['content-type'].split('boundary=')[1]
// //   let rawData = ''

// //   req.on('data', chunk => rawData += chunk)

// //   req.on('end', () => {
// //     const parts = rawData.split(`--${boundary}`)
// //     const fields = {}
// //     let imagePath = null

// //     parts.forEach(part => {
// //       if (part.includes('Content-Disposition')) {
// //         const nameMatch = part.match(/name="([^"]+)"/)
// //         const name = nameMatch?.[1]

// //         if (name === 'image') {
// //           const filenameMatch = part.match(/filename="([^"]+)"/)
// //           const filename = filenameMatch?.[1]
// //           const contentTypeMatch = part.match(/Content-Type: (.+)/)
// //           const contentType = contentTypeMatch?.[1]

// //           // ✅ Only allow image uploads
// //           if (contentType && !contentType.startsWith('image/')) {
// //             console.log(`Blocked file type: ${contentType}`)
// //             return
// //           }

// //           const binaryData = part.split('\r\n\r\n')[1]
// //           if (binaryData && filename) {
// //             const buffer = Buffer.from(binaryData, 'binary')
// //             const uniqueName = `${uuidv4()}-${filename}`
// //             const filePath = path.join(uploadDir, uniqueName)
// //             fs.writeFileSync(filePath, buffer)
// //             imagePath = `/uploads/${uniqueName}`
// //           }
// //         } else if (name) {
// //           const value = part.split('\r\n\r\n')[1]?.trim()
// //           if (value) fields[name] = value
// //         }
// //       }
// //     })

// //     callback(fields, imagePath)
// //   })
// // }

// // // 🌐 Create HTTP server
// // const server = http.createServer((req, res) => {
// //   res.setHeader('Access-Control-Allow-Origin', '*')
// //   res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
// //   res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
// //   res.setHeader('Content-Type', 'application/json')
// //   if (req.method === 'OPTIONS') {
// //     res.writeHead(204)
// //     return res.end()
// //   }

// //   if (req.method === 'POST' && req.url === '/submit') {
// //     if (req.headers['content-type']?.includes('multipart/form-data')) {
// //       parseMultipart(req, (fields, imagePath) => {
// //         let data = []
// //         try {
// //           data = JSON.parse(fs.readFileSync(submissionsFile))
// //         } catch (err) {
// //           console.error('⚠️ Failed to parse JSON file:', err)
// //         }

// //         const newEntry = {
// //           id: Date.now(),
// //           ...fields,
// //           imageUrl: imagePath
// //         }

// //         data.push(newEntry)
// //         fs.writeFileSync(submissionsFile, JSON.stringify(data, null, 2))

// //         res.writeHead(201, { 'Content-Type': 'application/json' })
// //         res.end(JSON.stringify({ message: 'Saved', data: newEntry }))
// //       })
// //     } else {
// //       res.writeHead(400)
// //       res.end('Invalid content type')
// //     }

// //   } else if (req.method === 'GET' && req.url === '/submissions') {
// //     try {
// //       const data = fs.readFileSync(submissionsFile)
// //       res.writeHead(200, { 'Content-Type': 'application/json' })
// //       res.end(data)
// //     } catch {
// //       res.writeHead(500)
// //       res.end('Failed to read submissions')
// //     }

// //   } else if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
// //     const filePath = path.join(__dirname, req.url)
// //     fs.readFile(filePath, (err, content) => {
// //       if (err) {
// //         res.writeHead(404)
// //         res.end('Not found')
// //       } else {
// //         res.writeHead(200)
// //         res.end(content)
// //       }
// //     })

// //   } else {
// //     res.writeHead(404)
// //     res.end('Not Found')
// //   }
// // })

// // server.listen(PORT, () => {
// //   console.log(`🚀 Server running at http://localhost:${PORT}`)
// // })
