const cookies = {}
decodeURIComponent(document.cookie).split(";").forEach((v) => {
  v = v.trim()
  let sep = v.indexOf("=")
  const key = v.substring(0, sep)
  const value = v.substring(sep+1)
  cookies[key] = value
})

const required = ['ws_server_url', 'cjwt', 'prefix', 'user_name']
required.forEach((v) => {
  if (!cookies[v]) {
    alert(`expected cookie ${v} is not set`)
    location.href = "/index.html"
  }
})

// add an entry to the document
function addEntry (s) {
  const p = document.createElement('pre')
  p.appendChild(document.createTextNode(s))
  document.getElementById('log').appendChild(p)
}

let nc
function disconnectNATS() {
  console.log('disconnect')
  if (nc) {
    nc.publish(`${cookies['prefix']}.exited`)
    nc.flush().then(() => {
      nc.close()
    })
  }
}

async function run() {
  nats.connect({url: cookies['ws_server_url'], noEcho: true, userJwt: cookies['cjwt'], name: cookies['user_name']})
    .then(async (conn) => {
      nc = conn
      addEntry(`connected as ${cookies['user_name']} to ${nc.options.url}`)

      // handle errors
      nc.addEventListener('error', (err) => {
        addEntry(`error: ${err.toString()}`)
        addEntry(`reloading in 1s`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      // handle close
      nc.addEventListener('close', () => {
        addEntry(`connection closed`)
        addEntry(`will attempt to reconnect in 1s`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      nc.subscribe('who', () => {
          nc.publish('here', cookies['user_name'])
      })

      let i = 0
      nc.subscribe('>', (m) => {
        i++
        addEntry(`[${i}] ${m.subject}: ${m.data}`)
      })
      await nc.flush()

      nc.publish(`${cookies['prefix']}.entered`
          , cookies['user_name'])
      nc.publish('who')
    })
    .catch((err) => {
      addEntry(`error connecting: ${err.toString()}`)
      addEntry(`will reload in 1000`)
      setTimeout(() => {
        location.reload()
      }, 1000)
    })
}
run()
