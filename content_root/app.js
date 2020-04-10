const cookies = {}
const avatars = {}
const users = {}
decodeURIComponent(document.cookie).split(';').forEach((v) => {
  v = v.trim()
  let sep = v.indexOf('=')
  const key = v.substring(0, sep)
  const value = v.substring(sep + 1)
  cookies[key] = value
})

const required = ['ws_server_url', 'cjwt', 'prefix', 'user_name']
required.forEach((v) => {
  if (!cookies[v]) {
    alert(`expected cookie ${v} is not set`)
    location.href = '/index.html'
  }
})

// add an entry to the document
function addEntry (d, who, event) {
  const p = document.createElement('p')
  if (who && avatars[who]) {
    const img = document.createElement('img')
    img.classList.add('user_image')
    img.classList.add('avatar')
    img.title = who
    img.src = avatars[who]
    p.appendChild(img)
  }
  if (event) {
    p.appendChild(document.createTextNode(`${users[who] || who} - ${event}`))
  } else {
    p.appendChild(document.createTextNode(d))
  }
  document.getElementById('log').appendChild(p)
}

let nc
function disconnectNATS () {
  if (nc && !nc.isClosed()) {
    nc.publish(`${cookies['prefix']}.exited`)
    nc.flush().then(() => {
      nc.close()
    })
  }
}

async function run () {
  nats.connect({ url: cookies['ws_server_url'], noEcho: true, userJwt: cookies['cjwt'], name: cookies['user_name'] })
    .then(async (conn) => {
      nc = conn

      const me = cookies['prefix'].split('.')[1]
      users[me] = cookies['user_name']
      avatars[me] = getUserImage()
      addEntry(`connected as ${cookies['user_name']} to ${nc.options.url}`, me)

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

      nc.subscribe('user.who', (m) => {
        m.respond(JSON.stringify({id: me, name: cookies['user_name'], avatar: getUserImage() }))
      })

      let i = 0
      nc.subscribe('user.*.*', (m) => {
        i++
        const chunks = m.subject.split('.')
        if (chunks[2] === 'entered') {
          let jm = JSON.parse(m.data)
          users[chunks[1]] = chunks[1]
          avatars[chunks[1]] = jm.avatar
          m.data = jm.name
        }
        addEntry(`[${i}] ${m.subject}: ${m.data}`, chunks[1], chunks[2])
      })

      // create a subscription to handle the request for a list of users
      const inbox = nats.nuid.next()
      const here = []
      const hereSub = await nc.subscribe(inbox, (m) => {
        let jm = JSON.parse(m.data)
        console.log('found one', jm)
        here.push(jm.id)
        users[jm.id] = jm.name
        avatars[jm.id] = jm.avatar
        done()
      })

      const done = debounce(()=> {
        const p = document.createElement('p')
        here.forEach((v) => {
          if (avatars[v]) {
            const img = document.createElement('img')
            img.classList.add('user_image')
            img.classList.add('avatar')
            img.title = users[v]
            img.src = avatars[v]
            p.appendChild(img)
            console.log('added')
          }
        })
        addEntry(`Found ${here.length} users already here (hover to see their names):`)
        document.getElementById('log').appendChild(p)
      }, 500)
      await nc.flush()

      // only this message is json
      nc.publish(`${cookies['prefix']}.entered`, JSON.stringify({ name: cookies['user_name'], avatar: getUserImage() }))
      // request to find out who is here
      nc.publish('user.who','', inbox)
      setTimeout(() => {
        hereSub.unsubscribe()
      }, 5000)
    })
    .catch((err) => {
      addEntry(`error connecting: ${err.toString()}`)
      addEntry(`will reload in 1000`)
      setTimeout(() => {
        location.reload()
      }, 1000)
    })
}
