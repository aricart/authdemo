const cookies = {}
const avatars = {}
const users = {}
decodeURIComponent(document.cookie).split(';').forEach((v) => {
  v = v.trim()
  let sep = v.indexOf('=')
  const key = v.substring(0, sep)
  cookies[key] = v.substring(sep + 1)
})

const required = ['ws_server_url', 'cjwt', 'prefix', 'user_name']
let foundAll = true
required.forEach((v) => {
  if (!cookies[v]) {
    foundAll = false
  }
})
if (!foundAll) {
  location.href = '/index.html'
}

const me = cookies['prefix'].split('.')[1]


function addAvatar(id) {

  const container = document.getElementById('log')
  let cn
  if(container.hasChildNodes()) {
    const index = Math.floor(Math.random() * container.childNodes.length)
    cn = container.childNodes[index]
  }
  if (avatars[id]) {
    let img = document.getElementById(id)
    if (!img) {
      img = document.createElement('img')
      img.id = id
      img.classList.add('user_image')
      img.classList.add('avatar')
      img.src = avatars[id]
      if (cn) {
        container.insertBefore(img, cn.nextSibling)
      } else {
        container.appendChild(img)
      }
    }
  }
  updateCount()
}

function updateCount() {
  const counter = document.getElementById('counter')
  const ids = Object.getOwnPropertyNames(users)
  let fake = 0
  ids.forEach((v) => {
    if (v.indexOf('pokenats_') === 0) {
      fake++
    }
  })
  counter.innerHTML = `${ids.length} users here - ${fake} are bots.`
}

function removeAvatar(who) {
  const w = document.getElementById(who)
  if (w) {
    w.remove()
    updateCount()
  }
}

let nc
function disconnectNATS () {
  if (nc && !nc.isClosed()) {
    nc.publish(`user.${me}.exited`)
    nc.flush().then(() => {
      nc.close()
    })
  }
}

async function run () {
  nats.connect({ url: cookies['ws_server_url'], noEcho: true, userJwt: cookies['cjwt'], name: cookies['user_name'] })
    .then(async (conn) => {
      nc = conn
      users[me] = cookies['user_name']
      avatars[me] = getUserImage()

      // add an entry for us
      const myAvatar = document.getElementById('me')
      const img = document.createElement('img')
      // img.classList.add('user_image')
      img.classList.add('avatar')
      img.src = avatars[me]
      myAvatar.append(img)
      const label = document.createTextNode(`Connected as ${cookies['user_name']} to ${nc.options.url}`)
      myAvatar.appendChild(label)
      addAvatar(me)

      // handle errors
      nc.addEventListener('error', (err) => {
        console.log(`error: ${err.toString()}`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      // handle close
      nc.addEventListener('close', () => {
        console.log(`connection closed`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      nc.subscribe('user.who', (m) => {
        m.respond(JSON.stringify({ id: me, name: users[me], avatar: getUserImage() }))
      })

      let i = 0
      nc.subscribe('user.*.entered', (m) => {
        i++
        const chunks = m.subject.split('.')
        if (chunks[2] === 'entered') {
          let jm = JSON.parse(m.data)
          users[chunks[1]] = chunks[1]
          avatars[chunks[1]] = jm.avatar
          m.data = jm.name
        }
        addAvatar(chunks[1])
      })

      nc.subscribe('user.*.exited', (m) => {
        const chunks = m.subject.split('.')
        delete users[chunks[1]]
        delete avatars[chunks[1]]
        removeAvatar(chunks[1])
      })

      // create a subscription to handle the request for a list of users
      const inbox = nats.nuid.next()
      const hereSub = await nc.subscribe(inbox, (m) => {
        let jm = JSON.parse(m.data)
        users[jm.id] = jm.name
        avatars[jm.id] = jm.avatar
        addAvatar(jm.id)
      })

      await nc.flush()

      // only this message is json
      nc.publish(`${cookies['prefix']}.entered`, JSON.stringify({ id: me, name: users[me], avatar: getUserImage() }))
      // request to find out who is here
      nc.publish('user.who', '', inbox)
      setTimeout(() => {
        hereSub.drain()
      }, 5000)
    })
    .catch((err) => {
      console.error('error connecting', err)
      setTimeout(() => {
        location.reload()
      }, 5000)
    })
}
