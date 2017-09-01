const php = require('..')
const server = php()

server.on('start', data => {
  console.log('Server started on http://' + data.host + ':' + data.port)
})

server.on('error', err => {
  console.log(err)
})

server.start()
